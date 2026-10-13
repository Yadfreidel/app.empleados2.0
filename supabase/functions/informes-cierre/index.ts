// supabase/functions/informes-cierre/index.ts
// Edge Function OPCIONAL: análisis con IA de los informes de cierre.
// El PDF se genera y descarga en el navegador; si esta función está desplegada
// con ANTHROPIC_API_KEY, el PDF incluye además la descripción de las fotos, el
// resumen, las recomendaciones y los motivos de revisión. La clave de IA y la
// service_role solo existen aquí; nunca llegan al navegador.
//
// Acciones (POST JSON { accion, ... }):
//   estado               admin   ¿Está desplegada? ¿Hay clave de IA?
//   procesar             admin o técnico del informe   Analiza (en segundo plano)
//   procesar_pendientes  admin o tarea programada (x-cron-secret)   Reintentos
//   reintentar           admin   Reintento manual (reinicia el contador)
//
// Despliegue y variables: ver supabase/functions/README.md
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'
import { ErrorIA, analizarCierre, type AnalisisInforme, type Categoria, type DatosCierre, type FotoParaAnalisis } from './analisis.ts'

declare const EdgeRuntime: { waitUntil(promesa: Promise<unknown>): void } | undefined

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BUCKET_FOTOS = 'actividad-adjuntos'
const MAX_INTENTOS = 6
// 1 min, 5 min, 15 min, 1 h, 3 h, 6 h
const ESPERAS_MIN = [1, 5, 15, 60, 180, 360]
const MODELO = Deno.env.get('INFORMES_MODELO_IA') ?? 'claude-opus-5-5'

interface FotoInforme { path: string; categoria: Categoria; nombre: string; tipo: string; tamano: number }

interface Informe {
  id: string
  numero: string
  hotel_nombre: string
  operacion_nombre: string | null
  actividad_titulo: string
  fecha_programada: string
  area: string
  servicio: string
  hallazgos: string
  acciones: string
  resultado: string
  observaciones: string | null
  productos?: string | null
  recomendaciones?: string | null
  pendientes?: string | null
  fotos: FotoInforme[]
  tecnico_id: string | null
  tecnico_nombre: string
  estado_generacion: 'pendiente' | 'generando' | 'generado' | 'error'
  analisis: AnalisisInforme | null
  intentos_generacion: number
}

function responder(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
const fallo = (error: string, status = 200) => responder({ ok: false, error }, status)

function esUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)
}

function enSegundoPlano(promesa: Promise<unknown>) {
  const segura = promesa.catch(error => console.error('informes-cierre (segundo plano):', error))
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(segura)
  return segura
}

async function registrar(db: SupabaseClient, informeId: string, tipo: string, mensaje: string, detalle?: Record<string, unknown>, usuarioId?: string | null) {
  const { error } = await db.from('informe_eventos').insert({
    informe_id: informeId, tipo, mensaje: mensaje.slice(0, 1000), detalle: detalle ?? null, usuario_id: usuarioId ?? null,
  })
  if (error) console.error('No se pudo registrar el evento del informe:', error.message)
}

async function actualizar(db: SupabaseClient, id: string, cambios: Record<string, unknown>) {
  const { data, error } = await db.from('informes_cierre').update(cambios).eq('id', id).select('*').single()
  if (error) throw new Error(`No se pudo guardar el estado del informe: ${error.message}`)
  return data as Informe
}

// ── Revisión automática de evidencia ──────────────────────────────────────
const MIN_DETALLE = 10
const SIN_HALLAZGOS = /^(sin|no hay|ning[uú]n|no se (observ|encontr))/i

function motivosDeRevision(inf: Informe, analisis: AnalisisInforme, fotosLegibles: boolean[]): string[] {
  const motivos: string[] = []
  fotosLegibles.forEach((ok, i) => {
    if (!ok) motivos.push(`La foto ${i + 1} no se pudo leer o no está en un formato compatible (JPEG/PNG).`)
  })
  if (inf.hallazgos.trim().length < MIN_DETALLE && !SIN_HALLAZGOS.test(inf.hallazgos.trim())) {
    motivos.push('Los hallazgos están poco detallados.')
  }
  if (inf.acciones.trim().length < MIN_DETALLE) motivos.push('Las acciones realizadas están poco detalladas.')
  if (!analisis.evidencia_suficiente) motivos.push('La evidencia fotográfica no es suficiente para respaldar lo declarado.')
  for (const c of analisis.contradicciones) motivos.push(`Contradicción: ${c}`)
  for (const f of analisis.fotos) {
    if (!f.corresponde_a_categoria) {
      const foto = inf.fotos[f.indice - 1]
      motivos.push(`La foto ${f.indice}${foto ? ` (${foto.categoria.replace('_', ' ')})` : ''} no parece corresponder a su categoría.`)
    }
  }
  motivos.push(...analisis.motivos_revision)
  return [...new Set(motivos.map(m => m.trim()).filter(Boolean))].slice(0, 12)
}

function tipoImagen(bytes: Uint8Array): FotoParaAnalisis['mediaType'] | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45) return 'image/webp'
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'
  return null
}

// ── Análisis con IA ───────────────────────────────────────────────────────
async function analizar(db: SupabaseClient, inf: Informe) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new ErrorIA('El análisis con IA no está configurado (falta ANTHROPIC_API_KEY).', false)
  await actualizar(db, inf.id, { estado_generacion: 'generando' })

  const fotos: FotoParaAnalisis[] = []
  const legibles: boolean[] = []
  for (const [i, foto] of inf.fotos.entries()) {
    const { data, error } = await db.storage.from(BUCKET_FOTOS).download(foto.path)
    if (error || !data) { legibles.push(false); continue }
    const bytes = new Uint8Array(await data.arrayBuffer())
    const tipo = tipoImagen(bytes)
    legibles.push(tipo === 'image/jpeg' || tipo === 'image/png')
    if (tipo) fotos.push({ indice: i + 1, categoria: foto.categoria, mediaType: tipo, base64: encodeBase64(bytes) })
  }

  const datos: DatosCierre = {
    numero: inf.numero, hotel: inf.hotel_nombre, area: inf.area, operacion: inf.operacion_nombre,
    titulo: inf.actividad_titulo, fechaProgramada: inf.fecha_programada, servicio: inf.servicio,
    hallazgos: inf.hallazgos, acciones: inf.acciones, resultado: inf.resultado,
    observaciones: inf.observaciones, tecnico: inf.tecnico_nombre,
    productos: inf.productos, recomendaciones: inf.recomendaciones, pendientes: inf.pendientes,
  }
  const { analisis, modelo } = await analizarCierre({ apiKey, modelo: MODELO, datos, fotos })
  const motivos = motivosDeRevision(inf, analisis, legibles)

  // Si un supervisor ya revisó y editó el informe mientras tanto, no se pisa su contenido.
  const { data: actual } = await db.from('informes_cierre').select('revisado_en').eq('id', inf.id).single()
  await actualizar(db, inf.id, {
    estado_generacion: 'generado',
    ...(actual?.revisado_en ? {} : { analisis }),
    modelo_ia: modelo,
    generado_en: new Date().toISOString(),
    requiere_revision: motivos.length > 0,
    motivos_revision: motivos,
    ultimo_error: null,
    intentos_generacion: 0,
  })
  await registrar(db, inf.id, 'generacion', `Análisis con IA completado${analisis.ia_disponible ? '' : ' (sin contenido de IA)'}.`, { modelo })
  if (motivos.length > 0) await registrar(db, inf.id, 'revision', 'Requiere revisión del supervisor.', { motivos })
}

async function procesar(db: SupabaseClient, id: string): Promise<'procesado' | 'ocupado' | 'no_encontrado'> {
  const { data: reservados, error } = await db.rpc('reservar_informe_cierre', { p_id: id, p_segundos: 360 })
  if (error) throw new Error(`No se pudo reservar el informe: ${error.message}`)
  const inf = (reservados as Informe[] | null)?.[0]
  if (!inf) {
    const { data } = await db.from('informes_cierre').select('id').eq('id', id).maybeSingle()
    return data ? 'ocupado' : 'no_encontrado'
  }
  try {
    if (inf.estado_generacion !== 'generado') await analizar(db, inf)
  } catch (err) {
    const reintentable = err instanceof ErrorIA ? err.reintentable : true
    const mensaje = err instanceof Error ? err.message : 'Error inesperado.'
    const intentos = inf.intentos_generacion + 1
    const espera = ESPERAS_MIN[Math.min(intentos - 1, ESPERAS_MIN.length - 1)]
    const agotado = !reintentable || intentos >= MAX_INTENTOS
    console.error(`informes-cierre ${inf.numero}:`, mensaje)
    try {
      await actualizar(db, inf.id, {
        estado_generacion: 'error',
        intentos_generacion: agotado ? MAX_INTENTOS : intentos,
        ultimo_error: mensaje.slice(0, 1000),
        proximo_intento: new Date(Date.now() + espera * 60_000).toISOString(),
      })
      await registrar(db, inf.id, 'error', mensaje, { intento: intentos, reintento_automatico: !agotado, proximo_en_min: agotado ? null : espera })
    } catch (e) {
      console.error('No se pudo registrar el error del informe:', e)
    }
  } finally {
    await db.from('informes_cierre').update({ bloqueado_hasta: null }).eq('id', id)
  }
  return 'procesado'
}

async function procesarPendientes(db: SupabaseClient, limite = 3) {
  const { data, error } = await db.from('informes_cierre')
    .select('id')
    .lte('proximo_intento', new Date().toISOString())
    .in('estado_generacion', ['pendiente', 'generando', 'error'])
    .lt('intentos_generacion', MAX_INTENTOS)
    .order('proximo_intento')
    .limit(limite)
  if (error) throw new Error(error.message)
  const ids = (data ?? []).map(r => r.id as string)
  for (const id of ids) await procesar(db, id)
  return ids.length
}

// ── Servidor ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fallo('Método no permitido.', 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return fallo('Solicitud inválida.', 400) }

  // Tarea programada (pg_cron): solo puede pedir los reintentos pendientes.
  const secretoCron = Deno.env.get('INFORMES_CRON_SECRET')
  const esCron = !!secretoCron && req.headers.get('x-cron-secret') === secretoCron

  let usuario: { id: string; esAdmin: boolean } | null = null
  if (!esCron) {
    const llamante = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
    const { data: { user }, error } = await llamante.auth.getUser()
    if (error || !user) return fallo('Tu sesión expiró. Vuelve a iniciar sesión.', 401)
    const { data: perfil } = await db.from('profiles').select('role, active').eq('id', user.id).maybeSingle()
    if (!perfil || perfil.active !== true) return fallo('Tu cuenta no está activa.', 403)
    usuario = { id: user.id, esAdmin: perfil.role === 'admin' }
  }
  const esAdmin = usuario?.esAdmin === true

  try {
    switch (body.accion) {
      case 'estado': {
        if (!esAdmin) return fallo('Solo un administrador puede consultar el estado.', 403)
        return responder({ ok: true, ia: !!Deno.env.get('ANTHROPIC_API_KEY'), tarea_programada: !!secretoCron, modelo: MODELO })
      }

      case 'procesar': {
        if (!esUuid(body.informe_id)) return fallo('Informe no válido.')
        const { data: inf } = await db.from('informes_cierre').select('id, tecnico_id').eq('id', body.informe_id).maybeSingle()
        if (!inf) return fallo('Informe no encontrado.')
        if (!esAdmin && inf.tecnico_id !== usuario?.id) return fallo('No tienes permiso sobre este informe.', 403)
        // Se responde enseguida; el análisis sigue en segundo plano aunque el teléfono se desconecte.
        enSegundoPlano(procesar(db, inf.id))
        return responder({ ok: true, en_proceso: true })
      }

      case 'procesar_pendientes': {
        if (!esCron && !esAdmin) return fallo('No autorizado.', 403)
        const tarea = procesarPendientes(db)
        if (esCron) return responder({ ok: true, procesados: await tarea })
        enSegundoPlano(tarea)
        return responder({ ok: true, en_proceso: true })
      }

      case 'reintentar': {
        if (!esAdmin) return fallo('Solo un administrador puede reintentar.', 403)
        if (!esUuid(body.informe_id)) return fallo('Informe no válido.')
        const { data: inf } = await db.from('informes_cierre').select('id').eq('id', body.informe_id).maybeSingle()
        if (!inf) return fallo('Informe no encontrado.')
        await actualizar(db, inf.id, { estado_generacion: 'pendiente', intentos_generacion: 0, proximo_intento: new Date().toISOString() })
        await registrar(db, inf.id, 'reintento', 'Reintento manual del análisis con IA.', undefined, usuario!.id)
        enSegundoPlano(procesar(db, inf.id))
        return responder({ ok: true, en_proceso: true })
      }

      default:
        return fallo('Acción no reconocida.', 400)
    }
  } catch (err) {
    console.error('informes-cierre:', err)
    return fallo('Error inesperado en el servidor.', 500)
  }
})
