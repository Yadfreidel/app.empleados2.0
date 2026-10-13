'use client'
// lib/offline/sincronizacion.ts
// Estado global de la sincronización (indicador, pendientes, conflictos) y
// disparadores: al abrir la app, al volver la conexión, al volver a la pestaña,
// periódicamente mientras haya pendientes y con el botón «Sincronizar ahora».
// No depende de Background Sync (que muchos navegadores no tienen).
import { useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase/client'
import { eliminarConfirmacion, guardarConfirmacion, listarConfirmaciones, obtenerConfirmacion, type ConfirmacionPendiente } from './almacen'
import { sincronizar } from './motor'
import { crearApiSupabase } from './api-supabase'

export type EstadoSincronizacion = 'sin_conexion' | 'pendiente' | 'sincronizando' | 'sincronizado' | 'error' | 'sesion_expirada'

/** Copia ligera para la interfaz (sin los bytes de las fotos). */
export type ResumenPendiente = Omit<ConfirmacionPendiente, 'fotos'> & { cantidadFotos: number; fotosSubidas: number }

export interface UsuarioLocal { id: string; email: string | null }

interface Estado {
  usuario: UsuarioLocal | null
  enLinea: boolean
  sincronizando: boolean
  sesionExpirada: boolean
  sinConexionServidor: boolean
  pendientes: ResumenPendiente[]
  ultimaSincronizacion: string | null
  aviso: string | null
}

const CLAVE_USUARIO = 'fm-offline-usuario'
export const EVENTO_ACTIVIDAD_SINCRONIZADA = 'fm-actividad-sincronizada'
const INTERVALO_MS = 60_000

function leerUsuarioGuardado(): UsuarioLocal | null {
  try {
    const valor = localStorage.getItem(CLAVE_USUARIO)
    return valor ? JSON.parse(valor) as UsuarioLocal : null
  } catch { return null }
}

let estado: Estado = {
  usuario: null,
  enLinea: true,
  sincronizando: false,
  sesionExpirada: false,
  sinConexionServidor: false,
  pendientes: [],
  ultimaSincronizacion: null,
  aviso: null,
}
const oyentes = new Set<() => void>()
const actualizar = (cambio: Partial<Estado>) => {
  estado = { ...estado, ...cambio }
  oyentes.forEach(fn => fn())
}

export function estadoGeneral(e: Estado = estado): EstadoSincronizacion {
  if (e.sincronizando) return 'sincronizando'
  if (!e.enLinea || e.sinConexionServidor) return 'sin_conexion'
  if (e.sesionExpirada && e.pendientes.length > 0) return 'sesion_expirada'
  if (e.pendientes.some(p => p.estado === 'conflicto' || p.estado === 'error')) return 'error'
  if (e.pendientes.length > 0) return 'pendiente'
  return 'sincronizado'
}

/** Usuario dueño de los datos locales. Se recuerda para poder trabajar sin conexión. */
export function usuarioLocal(): UsuarioLocal | null {
  return estado.usuario ?? (typeof window !== 'undefined' ? leerUsuarioGuardado() : null)
}

function recordarUsuario(usuario: UsuarioLocal) {
  const cambio = estado.usuario?.id !== usuario.id
  try { localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario)) } catch { /* sin almacenamiento */ }
  actualizar({ usuario, sesionExpirada: false })
  if (cambio) void recargarPendientes()
}

/** Llamar al cerrar sesión a propósito: deja de mostrar los pendientes de esa cuenta en este equipo. */
export function olvidarUsuarioLocal() {
  try { localStorage.removeItem(CLAVE_USUARIO) } catch { /* sin almacenamiento */ }
  actualizar({ usuario: null, pendientes: [], sesionExpirada: false })
}

export async function recargarPendientes() {
  const usuario = usuarioLocal()
  if (!usuario) { actualizar({ pendientes: [] }); return }
  try {
    const lista = await listarConfirmaciones(usuario.id)
    // Si cambió de cuenta mientras se leía, no mostrar datos de la anterior.
    if (usuarioLocal()?.id !== usuario.id) return
    actualizar({
      pendientes: lista.map(({ fotos, ...resto }) => ({
        ...resto,
        cantidadFotos: fotos.length,
        fotosSubidas: fotos.filter(f => f.subida).length,
      })),
    })
  } catch (error) {
    actualizar({ aviso: error instanceof Error ? error.message : 'No se pudieron leer los datos guardados en el teléfono.' })
  }
}

export interface ResultadoEnvio { resultado: 'sincronizada' | 'pendiente' | 'conflicto' | 'sesion' | 'error'; actividad?: Record<string, unknown> | null }

/** Sincroniza ahora. Con `forzar` ignora la espera entre reintentos. */
export async function sincronizarAhora({ forzar = true, soloId }: { forzar?: boolean; soloId?: string } = {}): Promise<ResultadoEnvio> {
  const usuario = usuarioLocal()
  if (!usuario) return { resultado: 'sesion' }
  const online = typeof navigator === 'undefined' || navigator.onLine
  if (!online) { actualizar({ enLinea: false }); return { resultado: 'pendiente' } }

  actualizar({ sincronizando: true, aviso: null })
  try {
    const r = await sincronizar(usuario.id, crearApiSupabase(usuario.id), { forzar, soloId })
    for (const s of r.sincronizadas) {
      window.dispatchEvent(new CustomEvent(EVENTO_ACTIVIDAD_SINCRONIZADA, { detail: s }))
    }
    actualizar({
      sesionExpirada: r.sesionExpirada,
      sinConexionServidor: r.sinConexion,
      ultimaSincronizacion: r.sincronizadas.length > 0 || r.pendientes === 0 ? new Date().toISOString() : estado.ultimaSincronizacion,
    })
    await recargarPendientes()
    if (soloId) {
      const hecha = r.sincronizadas.find(s => s.id === soloId)
      if (hecha) return { resultado: 'sincronizada', actividad: hecha.actividad }
      const quedo = estado.pendientes.find(p => p.id === soloId)
      if (r.sesionExpirada) return { resultado: 'sesion' }
      if (quedo?.estado === 'conflicto') return { resultado: 'conflicto' }
      if (quedo?.estado === 'error') return { resultado: 'error' }
      return { resultado: quedo ? 'pendiente' : 'sincronizada' }
    }
    return { resultado: r.pendientes === 0 ? 'sincronizada' : 'pendiente' }
  } catch (error) {
    console.error('Sincronización:', error)
    actualizar({ aviso: error instanceof Error ? error.message : 'Error inesperado al sincronizar.' })
    return { resultado: 'error' }
  } finally {
    actualizar({ sincronizando: false })
  }
}

/** Acciones ante un conflicto. Nada se descarta sin que el técnico lo pida. */
export async function resolverConflicto(id: string, accion: 'confirmar_igual' | 'enviar_al_chat' | 'descartar') {
  const c = await obtenerConfirmacion(id)
  const usuario = usuarioLocal()
  if (!c || !usuario || c.usuarioId !== usuario.id) return
  if (accion === 'descartar') {
    // Fotos ya subidas que no llegaron al chat: se retiran del servidor (si se puede).
    const huerfanas = c.fotos.filter(f => f.subida && !f.mensajeCreado).map(f => f.ruta)
    await crearApiSupabase(usuario.id).borrarFotos(huerfanas)
    await eliminarConfirmacion(id)
    await recargarPendientes()
    return
  }
  c.estado = 'pendiente'
  c.proximoIntento = 0
  c.ultimoError = null
  if (accion === 'confirmar_igual') c.forzar = true
  if (accion === 'enviar_al_chat') c.modo = 'solo_chat'
  c.conflicto = null
  await guardarConfirmacion(c)
  await recargarPendientes()
  await sincronizarAhora({ soloId: id })
}

// ── Disparadores automáticos ──────────────────────────────────────────────

let iniciado = false
export function iniciarSincronizacion() {
  if (iniciado || typeof window === 'undefined') return
  iniciado = true
  actualizar({ usuario: leerUsuarioGuardado(), enLinea: navigator.onLine })
  void recargarPendientes()

  const supabase = createClient()
  supabase.auth.onAuthStateChange((evento, sesion) => {
    if (sesion?.user) {
      recordarUsuario({ id: sesion.user.id, email: sesion.user.email ?? null })
      if (evento === 'SIGNED_IN') void sincronizarAhora({ forzar: true })
    } else if (evento === 'SIGNED_OUT') {
      // Puede ser vencimiento de la sesión: se conservan los pendientes y se pide entrar.
      actualizar({ sesionExpirada: true })
    }
  })

  const automatico = () => {
    if (navigator.onLine && estado.pendientes.some(p => p.estado !== 'conflicto')) void sincronizarAhora({ forzar: false })
  }
  window.addEventListener('online', () => { actualizar({ enLinea: true, sinConexionServidor: false }); void sincronizarAhora({ forzar: true }) })
  window.addEventListener('offline', () => actualizar({ enLinea: false }))
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') automatico() })
  window.setInterval(automatico, INTERVALO_MS)
  // El service worker avisa si el navegador soporta Background Sync.
  navigator.serviceWorker?.addEventListener('message', evento => {
    if (evento.data?.tipo === 'sincronizar') automatico()
  })
  // Al abrir la app.
  window.setTimeout(() => { void recargarPendientes().then(automatico) }, 1500)
}

function suscribir(fn: () => void) {
  oyentes.add(fn)
  return () => { oyentes.delete(fn) }
}

const estadoServidor: Estado = { ...estado }
export function useSincronizacion() {
  const actual = useSyncExternalStore(suscribir, () => estado, () => estadoServidor)
  return { ...actual, general: estadoGeneral(actual) }
}

/** Muestra un aviso puntual en el indicador de sincronización. */
export function mostrarAviso(aviso: string | null) {
  actualizar({ aviso })
}
