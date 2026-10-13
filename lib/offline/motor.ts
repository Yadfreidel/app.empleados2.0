// lib/offline/motor.ts
// Envía al servidor las confirmaciones guardadas en el teléfono.
// Orden por confirmación: 1) subir fotos, 2) confirmar (y notificar), 3) publicar
// las fotos como evidencia en el chat. Cada paso queda marcado en IndexedDB, así
// un reintento continúa donde se quedó sin repetir nada. Los datos locales solo
// se borran cuando los tres pasos terminaron bien.
import {
  eliminarConfirmacion, guardarConfirmacion, listarConfirmaciones, obtenerConfirmacion,
  type ConfirmacionPendiente, type TipoConflicto,
} from './almacen'

/** Resultado de una llamada al servidor. 'red' y 'temporal' se reintentan solos. */
export type Fallo = { ok: false; tipo: 'red' | 'temporal' | 'sesion' | 'permanente'; mensaje: string }
export type Exito<T = object> = { ok: true } & T

export interface ApiSincronizacion {
  /** Verifica la sesión contra el servidor (no solo la copia local). */
  usuarioServidor(): Promise<Exito<{ id: string }> | Fallo>
  subirFoto(ruta: string, datos: Blob): Promise<Exito | Fallo>
  confirmar(c: ConfirmacionPendiente): Promise<
    | Exito<{ actividad: Record<string, unknown> | null; duplicado: boolean; numeroInforme?: string | null }>
    | { ok: false; tipo: 'conflicto'; conflicto: TipoConflicto; actividad: Record<string, unknown> | null }
    | Fallo
  >
  crearMensaje(fila: {
    id: string; actividad_id: string; contenido: string | null; es_evidencia: boolean
    adjunto_path?: string; adjunto_tipo?: string; adjunto_nombre?: string; adjunto_tamano?: number
  }): Promise<Exito | Fallo>
  borrarFotos(rutas: string[]): Promise<void>
  /** Pide al servidor generar y enviar el informe de cierre (en segundo plano). */
  procesarInforme?(informeId: string): Promise<Exito | Fallo>
}

export interface ResultadoSincronizacion {
  sincronizadas: { id: string; actividadId: string; actividad: Record<string, unknown> | null }[]
  conflictos: number
  errores: number
  pendientes: number
  sesionExpirada: boolean
  sinConexion: boolean
}

const ESPERA_BASE_MS = 15_000
const ESPERA_MAX_MS = 10 * 60_000
export const TEXTO_EVIDENCIA = 'Evidencia de la confirmación del servicio'
export const TEXTO_EVIDENCIA_INFORME = 'Evidencia del informe de cierre'

/** 15 s, 30 s, 1 min, 2 min… hasta 10 min entre reintentos automáticos. */
export function esperaReintento(intentos: number) {
  return Math.min(ESPERA_MAX_MS, ESPERA_BASE_MS * 2 ** Math.max(0, intentos - 1))
}

class Interrupcion extends Error {
  constructor(readonly fallo: Fallo) { super(fallo.mensaje) }
}

async function procesar(c: ConfirmacionPendiente, api: ApiSincronizacion) {
  // 1. Fotos (ruta fija: si ya existía por un intento anterior, cuenta como subida).
  for (const foto of c.fotos) {
    if (foto.subida) continue
    const r = await api.subirFoto(foto.ruta, new Blob([foto.datos], { type: foto.tipo }))
    if (!r.ok) throw new Interrupcion(r)
    foto.subida = true
    await guardarConfirmacion(c)
  }

  // 2. Confirmación (idempotente en el servidor gracias a c.id).
  let actividad: Record<string, unknown> | null = null
  if (c.modo === 'confirmar' && !c.confirmadaEnServidor) {
    const r = await api.confirmar(c)
    if (!r.ok && r.tipo === 'conflicto') {
      c.estado = 'conflicto'
      c.conflicto = { tipo: r.conflicto, actividad: r.actividad }
      c.ultimoError = null
      await guardarConfirmacion(c)
      return { conflicto: true as const }
    }
    if (!r.ok) throw new Interrupcion(r)
    c.confirmadaEnServidor = true
    actividad = r.actividad
    if (c.informe && r.numeroInforme) c.informe.numero = r.numeroInforme
    await guardarConfirmacion(c)
  }

  // 2b. Informe de cierre: pedir que se genere ya. Si no se puede (sin red o la
  // función no está desplegada), la tarea programada o el administrador lo
  // retoman; no bloquea la sincronización.
  if (c.informe && c.confirmadaEnServidor && !c.informe.generacionSolicitada && api.procesarInforme) {
    await api.procesarInforme(c.id).catch(() => null)
    c.informe.generacionSolicitada = true
    await guardarConfirmacion(c)
  }

  // 3. Evidencia en el chat (id fijo por foto: un reintento no duplica mensajes).
  if (c.modo === 'solo_chat' && c.nota && !c.notaEnviada) {
    const r = await api.crearMensaje({ id: c.id, actividad_id: c.actividadId, contenido: c.nota, es_evidencia: false })
    if (!r.ok) throw new Interrupcion(r)
    c.notaEnviada = true
    await guardarConfirmacion(c)
  }
  for (const [i, foto] of c.fotos.entries()) {
    if (foto.mensajeCreado) continue
    const r = await api.crearMensaje({
      id: foto.id,
      actividad_id: c.actividadId,
      contenido: i === 0 && c.modo === 'confirmar' ? (c.informe ? TEXTO_EVIDENCIA_INFORME : TEXTO_EVIDENCIA) : null,
      es_evidencia: c.modo === 'confirmar',
      adjunto_path: foto.ruta,
      adjunto_tipo: foto.tipo,
      adjunto_nombre: foto.nombre,
      adjunto_tamano: foto.tamano,
    })
    if (!r.ok) throw new Interrupcion(r)
    foto.mensajeCreado = true
    await guardarConfirmacion(c)
  }

  // Todo quedó guardado en el servidor: ahora sí se borra la copia local.
  await eliminarConfirmacion(c.id)
  return { conflicto: false as const, actividad }
}

const enCurso = new Map<string, Promise<ResultadoSincronizacion>>()

/**
 * Sincroniza las confirmaciones del usuario. Si ya hay una sincronización en curso
 * para ese usuario, devuelve la misma (no se envía nada dos veces en paralelo).
 * Con `forzar` se ignora la espera entre reintentos (botón «Sincronizar ahora»).
 */
export function sincronizar(usuarioId: string, api: ApiSincronizacion, opciones: { forzar?: boolean; soloId?: string } = {}) {
  const actual = enCurso.get(usuarioId)
  if (actual) return actual
  const ejecutar = () => sincronizarSinBloqueo(usuarioId, api, opciones)
  // Entre pestañas abiertas, Web Locks evita sincronizar a la vez.
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined
  const base: Promise<ResultadoSincronizacion> = locks
    ? locks.request(`fm-sync-${usuarioId}`, () => ejecutar()).then(r => r)
    : ejecutar()
  const promesa = base
    .finally(() => enCurso.delete(usuarioId))
  enCurso.set(usuarioId, promesa)
  return promesa
}

async function sincronizarSinBloqueo(usuarioId: string, api: ApiSincronizacion, { forzar = false, soloId }: { forzar?: boolean; soloId?: string }) {
  const resultado: ResultadoSincronizacion = { sincronizadas: [], conflictos: 0, errores: 0, pendientes: 0, sesionExpirada: false, sinConexion: false }
  let lista = await listarConfirmaciones(usuarioId)
  const ahora = Date.now()
  const porEnviar = lista.filter(c =>
    c.estado !== 'conflicto' && (!soloId || c.id === soloId) && (forzar || c.proximoIntento <= ahora))

  if (porEnviar.length > 0) {
    const sesion = await api.usuarioServidor()
    if (!sesion.ok) {
      resultado.sesionExpirada = sesion.tipo === 'sesion'
      resultado.sinConexion = sesion.tipo === 'red'
    } else if (sesion.id !== usuarioId) {
      // La sesión activa es de otra cuenta: los pendientes de este usuario no se tocan.
      resultado.sesionExpirada = true
    } else {
      for (const original of porEnviar) {
        // Releer: otra parte de la app pudo haberla cambiado (p. ej. resolver un conflicto).
        const c = await obtenerConfirmacion(original.id)
        if (!c || c.usuarioId !== usuarioId || c.estado === 'conflicto') continue
        try {
          const r = await procesar(c, api)
          if (!r.conflicto) resultado.sincronizadas.push({ id: c.id, actividadId: c.actividadId, actividad: r.actividad ?? null })
        } catch (error) {
          if (!(error instanceof Interrupcion)) throw error
          const { fallo } = error
          if (fallo.tipo === 'sesion') { resultado.sesionExpirada = true; break }
          c.intentos += 1
          c.proximoIntento = Date.now() + esperaReintento(c.intentos)
          c.ultimoError = fallo.mensaje
          c.estado = fallo.tipo === 'permanente' ? 'error' : 'pendiente'
          await guardarConfirmacion(c)
          if (fallo.tipo === 'red') { resultado.sinConexion = true; break }
        }
      }
    }
  }

  lista = await listarConfirmaciones(usuarioId)
  resultado.pendientes = lista.length
  resultado.conflictos = lista.filter(c => c.estado === 'conflicto').length
  resultado.errores = lista.filter(c => c.estado === 'error').length
  return resultado
}
