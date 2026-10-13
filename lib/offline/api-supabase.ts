'use client'
// lib/offline/api-supabase.ts
// Implementación real del motor de sincronización sobre Supabase.
import { createClient } from '@/lib/supabase/client'
import { confirmarActividad } from '@/lib/actividades/confirmar'
import { BUCKET_ADJUNTOS } from '@/lib/chat/adjuntos'
import { llamarInformes } from '@/lib/informes/informes'
import type { ApiSincronizacion, Fallo } from './motor'
import type { ConfirmacionPendiente, TipoConflicto } from './almacen'

type ErrorRemoto = { code?: string; message?: string; status?: number; statusCode?: string | number; name?: string } | null

const sinRed = (): Fallo => ({ ok: false, tipo: 'red', mensaje: 'Sin conexión con el servidor.' })
const sesion = (): Fallo => ({ ok: false, tipo: 'sesion', mensaje: 'Tu sesión expiró. Inicia sesión para sincronizar.' })

function esErrorDeRed(error: ErrorRemoto, status?: number) {
  const texto = `${error?.name ?? ''} ${error?.message ?? ''}`
  return status === 0 || /Failed to fetch|NetworkError|Load failed|network|fetch failed|AuthRetryableFetchError|StorageUnknownError/i.test(texto)
    || (typeof navigator !== 'undefined' && navigator.onLine === false)
}

/** Clasifica errores de PostgREST/Storage: red, sesión, temporal o permanente. */
function clasificar(error: ErrorRemoto, status: number | undefined, mensaje: string): Fallo {
  const codigoHttp = Number(error?.status ?? error?.statusCode ?? status ?? NaN)
  if (esErrorDeRed(error, status)) return sinRed()
  if (codigoHttp === 401 || error?.code === 'PGRST301' || error?.code === 'PGRST303' || /jwt|token is expired|invalid claim/i.test(error?.message ?? '')) {
    return sesion()
  }
  if (codigoHttp >= 500 || codigoHttp === 408 || codigoHttp === 429) {
    return { ok: false, tipo: 'temporal', mensaje: 'El servidor no respondió bien. Se reintentará.' }
  }
  return { ok: false, tipo: 'permanente', mensaje }
}

const TIPOS_CONFLICTO: TipoConflicto[] = ['ya_confirmada', 'cancelada', 'modificada', 'estado_cambiado', 'no_disponible']

/** Respaldo mientras la migración 008 no esté instalada: confirmación actual (no idempotente). */
async function confirmarSinMigracion(c: ConfirmacionPendiente, usuarioId: string) {
  let res: Awaited<ReturnType<typeof confirmarActividad>>
  try {
    res = await confirmarActividad({ activityId: c.actividadId, nota: c.nota ?? undefined })
  } catch {
    return sinRed()
  }
  if (res.ok) return { ok: true as const, actividad: res.activity as unknown as Record<string, unknown>, duplicado: false }
  if (/inicia sesión/i.test(res.error)) return sesion()
  // ¿Ya estaba confirmada? Si fue por esta misma cuenta, es un reintento de una confirmación que sí llegó.
  const { data, error, status } = await createClient().from('activities').select('*').eq('id', c.actividadId).maybeSingle()
  if (error) return clasificar(error, status, res.error)
  if (!data) return { ok: false as const, tipo: 'conflicto' as const, conflicto: 'no_disponible' as const, actividad: null }
  if (data.status === 'completado' && data.confirmado_por === usuarioId) return { ok: true as const, actividad: data, duplicado: true }
  if (data.status === 'completado') return { ok: false as const, tipo: 'conflicto' as const, conflicto: 'ya_confirmada' as const, actividad: data }
  if (data.status === 'cancelado') return { ok: false as const, tipo: 'conflicto' as const, conflicto: 'cancelada' as const, actividad: data }
  if (data.status !== 'programado') return { ok: false as const, tipo: 'conflicto' as const, conflicto: 'estado_cambiado' as const, actividad: data }
  return { ok: false as const, tipo: 'permanente' as const, mensaje: res.error }
}

export function crearApiSupabase(usuarioId: string): ApiSincronizacion {
  const supabase = createClient()

  /** Cierre con informe (migración 009): actividad + informe + notificación en una transacción. */
  async function cerrarConInforme(c: ConfirmacionPendiente): ReturnType<ApiSincronizacion['confirmar']> {
    const informe = c.informe!
    try {
      const base = {
        p_informe_id: c.id,
        p_actividad_id: c.actividadId,
        p_area: informe.area,
        p_servicio: informe.servicio,
        p_hallazgos: informe.hallazgos,
        p_acciones: informe.acciones,
        p_resultado: informe.resultado,
        p_observaciones: c.nota,
        p_fotos: c.fotos.map(f => ({ path: f.ruta, categoria: f.categoria ?? 'adicional', nombre: f.nombre, tipo: f.tipo, tamano: f.tamano })),
        p_version_esperada: c.versionEsperada,
        p_forzar: c.forzar,
        p_creado_en_dispositivo: c.creadaEn,
      }
      // v2 (migración 012) guarda además productos, recomendaciones, pendientes y el dictado.
      let { data, error, status } = await supabase.rpc('cerrar_operativo_con_informe_v2', {
        ...base,
        p_productos: informe.productos || null,
        p_recomendaciones: informe.recomendaciones || null,
        p_pendientes: informe.pendientes || null,
        p_dictado_id: informe.dictadoId ?? null,
      })
      if (error && (error.code === 'PGRST202' || error.code === '42883')) {
        ({ data, error, status } = await supabase.rpc('cerrar_operativo_con_informe', base))
      }
      if (error) {
        if (error.code === 'PGRST202' || error.code === '42883') {
          // Nunca se confirma sin el informe: se espera a que el administrador instale la migración.
          return { ok: false, tipo: 'temporal', mensaje: 'Los informes de cierre aún no están instalados en el servidor. Avisa al administrador; se reintentará.' }
        }
        return clasificar(error, status, 'El servidor rechazó el cierre del operativo.')
      }
      const r = data as { ok: boolean; codigo?: string; conflicto?: string; error?: string; actividad?: Record<string, unknown> | null; duplicado?: boolean; informe?: { numero?: string } }
      if (r.ok) return { ok: true, actividad: r.actividad ?? null, duplicado: Boolean(r.duplicado), numeroInforme: r.informe?.numero ?? null }
      if (r.codigo === 'conflicto' && TIPOS_CONFLICTO.includes(r.conflicto as TipoConflicto)) {
        return { ok: false, tipo: 'conflicto', conflicto: r.conflicto as TipoConflicto, actividad: r.actividad ?? null }
      }
      if (r.codigo === 'sin_sesion') return sesion()
      if (r.codigo === 'foto_faltante') return { ok: false, tipo: 'temporal', mensaje: r.error ?? 'Una foto aún no llegó al servidor.' }
      return { ok: false, tipo: 'permanente', mensaje: r.error ?? 'El servidor rechazó el cierre del operativo.' }
    } catch (error) {
      return clasificar(error as ErrorRemoto, 0, 'No se pudo enviar el cierre del operativo.')
    }
  }

  return {
    async usuarioServidor() {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (data.user) return { ok: true, id: data.user.id }
        if (esErrorDeRed(error as ErrorRemoto)) return sinRed()
        const codigo = Number((error as ErrorRemoto)?.status ?? 0)
        if (codigo >= 500) return { ok: false, tipo: 'temporal', mensaje: 'El servidor de autenticación no respondió.' }
        return sesion()
      } catch {
        return sinRed()
      }
    },

    async subirFoto(ruta, datos) {
      try {
        const { error } = await supabase.storage.from(BUCKET_ADJUNTOS).upload(ruta, datos, { contentType: datos.type, upsert: false })
        if (!error) return { ok: true }
        const e = error as ErrorRemoto
        // Ruta fija por foto: si ya existe es porque un intento anterior sí la subió.
        if (String(e?.statusCode ?? e?.status) === '409' || /already exists|Duplicate/i.test(e?.message ?? '')) return { ok: true }
        return clasificar(e, undefined, 'No se pudo subir una foto (sin permiso o archivo no válido).')
      } catch (error) {
        return clasificar(error as ErrorRemoto, 0, 'No se pudo subir una foto.')
      }
    },

    async confirmar(c) {
      if (c.informe) return cerrarConInforme(c)
      try {
        const { data, error, status } = await supabase.rpc('confirmar_actividad_offline', {
          p_confirmacion_id: c.id,
          p_actividad_id: c.actividadId,
          p_nota: c.nota,
          p_version_esperada: c.versionEsperada,
          p_forzar: c.forzar,
          p_creada_en_dispositivo: c.creadaEn,
        })
        if (error) {
          if (error.code === 'PGRST202' || error.code === '42883') return confirmarSinMigracion(c, usuarioId)
          return clasificar(error, status, 'El servidor rechazó la confirmación.')
        }
        const r = data as { ok: boolean; codigo?: string; conflicto?: string; error?: string; actividad?: Record<string, unknown> | null; duplicado?: boolean }
        if (r.ok) return { ok: true, actividad: r.actividad ?? null, duplicado: Boolean(r.duplicado) }
        if (r.codigo === 'conflicto' && TIPOS_CONFLICTO.includes(r.conflicto as TipoConflicto)) {
          return { ok: false, tipo: 'conflicto', conflicto: r.conflicto as TipoConflicto, actividad: r.actividad ?? null }
        }
        if (r.codigo === 'sin_sesion') return sesion()
        return { ok: false, tipo: 'permanente', mensaje: r.error ?? 'El servidor rechazó la confirmación.' }
      } catch (error) {
        return clasificar(error as ErrorRemoto, 0, 'No se pudo enviar la confirmación.')
      }
    },

    async crearMensaje(fila) {
      try {
        const { error, status } = await supabase.from('actividad_mensajes').insert(fila)
        // Id fijo: si ya existe, el mensaje se creó en un intento anterior.
        if (!error || error.code === '23505') return { ok: true }
        return clasificar(error, status, 'No se pudo publicar la evidencia en el chat.')
      } catch (error) {
        return clasificar(error as ErrorRemoto, 0, 'No se pudo publicar la evidencia.')
      }
    },

    async procesarInforme(informeId) {
      const r = await llamarInformes({ accion: 'procesar', informe_id: informeId })
      return r.ok ? { ok: true } : { ok: false, tipo: r.red ? 'red' : 'temporal', mensaje: r.error }
    },

    async borrarFotos(rutas) {
      if (rutas.length === 0) return
      try { await supabase.storage.from(BUCKET_ADJUNTOS).remove(rutas) } catch { /* se reintenta otro día; no bloquea */ }
    },
  }
}
