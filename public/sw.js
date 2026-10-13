// public/sw.js — Service worker de F&M Fumigación
// Permite abrir el calendario sin conexión después de una primera carga online.
// - Páginas (navegación): red primero; sin conexión, la última copia guardada.
// - Archivos de la app (/_next/static, con hash en el nombre): se guardan y se
//   sirven desde el teléfono.
// - No intercepta peticiones a otros dominios (Supabase): esos datos se guardan
//   en IndexedDB desde la app. No se guardan credenciales.
const VERSION = 'fm-v1'
const CACHE_PAGINAS = `${VERSION}-paginas`
const CACHE_ESTATICOS = `${VERSION}-estaticos`
const MAX_ESTATICOS = 400
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, '')
const INICIO = `${BASE}/`

const esEstatico = url => url.pathname.startsWith(`${BASE}/_next/static/`) || url.pathname.startsWith(`${BASE}/images/`)
  || /\.(?:png|svg|ico|webp|woff2?)$/.test(url.pathname)

async function recortar(nombre, maximo) {
  const cache = await caches.open(nombre)
  const claves = await cache.keys()
  for (const clave of claves.slice(0, Math.max(0, claves.length - maximo))) await cache.delete(clave)
}

/** Guarda una página y los archivos que necesita para mostrarse sin conexión. */
async function guardarPaginaConRecursos(url) {
  const respuesta = await fetch(url, { credentials: 'same-origin', cache: 'no-store' })
  if (!respuesta.ok || respuesta.redirected) return
  const html = await respuesta.clone().text()
  await (await caches.open(CACHE_PAGINAS)).put(url, respuesta)
  const recursos = [...html.matchAll(/(?:src|href)="([^"]*\/_next\/static\/[^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&'))
  const cache = await caches.open(CACHE_ESTATICOS)
  await Promise.all([...new Set(recursos)].map(async recurso => {
    if (await cache.match(recurso)) return
    try {
      const r = await fetch(recurso)
      if (r.ok) await cache.put(recurso, r)
    } catch { /* se guardará cuando la página lo pida */ }
  }))
}

self.addEventListener('install', evento => {
  evento.waitUntil(guardarPaginaConRecursos(INICIO).catch(() => {}).then(() => self.skipWaiting()))
})

self.addEventListener('activate', evento => {
  evento.waitUntil((async () => {
    const nombres = await caches.keys()
    await Promise.all(nombres.filter(n => n.startsWith('fm-') && !n.startsWith(VERSION)).map(n => caches.delete(n)))
    await self.clients.claim()
  })())
})

self.addEventListener('message', evento => {
  const datos = evento.data || {}
  // La app envía los archivos que ya cargó, para guardarlos también.
  if (datos.tipo === 'guardar-recursos' && Array.isArray(datos.urls)) {
    evento.waitUntil((async () => {
      const cache = await caches.open(CACHE_ESTATICOS)
      for (const u of datos.urls) {
        try {
          const url = new URL(u, self.location.origin)
          if (url.origin !== self.location.origin || !esEstatico(url) || await cache.match(url.href)) continue
          const r = await fetch(url.href)
          if (r.ok) await cache.put(url.href, r)
        } catch { /* sin conexión: se intentará más tarde */ }
      }
    })())
  }
})

async function paginaRedPrimero(peticion) {
  const cache = await caches.open(CACHE_PAGINAS)
  try {
    const respuesta = await fetch(peticion)
    // No se guardan redirecciones (p. ej. al login) ni errores.
    if (respuesta.ok && !respuesta.redirected && respuesta.type === 'basic') {
      await cache.put(peticion.url.split('#')[0], respuesta.clone())
    }
    return respuesta
  } catch {
    const url = new URL(peticion.url)
    return (await cache.match(peticion.url, { ignoreSearch: false }))
      || (await cache.match(url.origin + url.pathname, { ignoreSearch: true }))
      || (await cache.match(new URL(INICIO, url.origin).href))
      || new Response(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title>'
        + '<body style="font-family:system-ui;padding:2rem;text-align:center"><h1>Sin conexión</h1>'
        + '<p>Abre la app con internet al menos una vez para poder usarla sin conexión.</p></body>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      )
  }
}

async function estaticoCachePrimero(peticion) {
  const cache = await caches.open(CACHE_ESTATICOS)
  const guardado = await cache.match(peticion)
  if (guardado) return guardado
  const respuesta = await fetch(peticion)
  if (respuesta.ok && respuesta.type === 'basic') {
    await cache.put(peticion, respuesta.clone())
    recortar(CACHE_ESTATICOS, MAX_ESTATICOS)
  }
  return respuesta
}

self.addEventListener('fetch', evento => {
  const peticion = evento.request
  if (peticion.method !== 'GET') return
  const url = new URL(peticion.url)
  if (url.origin !== self.location.origin) return // Supabase y otros dominios: sin tocar
  if (url.pathname.startsWith(`${BASE}/_next/webpack-hmr`) || url.pathname === `${BASE}/sw.js`) return
  if (peticion.headers.get('RSC') === '1' || url.searchParams.has('_rsc')) return // Next.js cae a navegación completa si fallan

  if (peticion.mode === 'navigate') {
    evento.respondWith(paginaRedPrimero(peticion))
  } else if (esEstatico(url)) {
    evento.respondWith(estaticoCachePrimero(peticion))
  }
})

// Background Sync (si el navegador lo tiene): solo despierta a la app para que
// sincronice; la app no depende de esto y también sincroniza por su cuenta.
self.addEventListener('sync', evento => {
  if (evento.tag !== 'fm-sincronizar') return
  evento.waitUntil(self.clients.matchAll({ type: 'window' }).then(clientes => {
    for (const cliente of clientes) cliente.postMessage({ tipo: 'sincronizar' })
  }))
})
