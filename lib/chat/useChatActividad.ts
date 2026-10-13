'use client'
// lib/chat/useChatActividad.ts
// Mensajes del chat de una actividad con actualización en tiempo real.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { ActividadMensaje } from '@/types'
import { ErrorAdjunto, eliminarAdjuntos, esImagen, obtenerUrlsFirmadas, subirAdjunto, type AdjuntoSubido } from './adjuntos'

export type EstadoChat = 'cargando' | 'listo' | 'sin_sesion' | 'no_disponible' | 'error'

export interface UsuarioChat {
  id: string
}

const CLAVE_VISTO = 'fm-chat-visto-'
/** Evento de ventana emitido al marcar un chat como leído (lo escucha la bandeja del admin). */
export const EVENTO_CHAT_VISTO = 'fm-chat-visto'

function esChatNoInstalado(error: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || /actividad_mensajes/.test(error.message ?? '')
}

export function leerVisto(actividadId: string) {
  try { return localStorage.getItem(CLAVE_VISTO + actividadId) } catch { return null }
}

function guardarVisto(actividadId: string, fecha: string) {
  try {
    if (localStorage.getItem(CLAVE_VISTO + actividadId) === fecha) return
    localStorage.setItem(CLAVE_VISTO + actividadId, fecha)
  } catch { /* almacenamiento no disponible */ }
  window.dispatchEvent(new CustomEvent(EVENTO_CHAT_VISTO, { detail: actividadId }))
}

/** Inserta mensajes con adjuntos ya subidos. El texto va en el primer mensaje. */
export async function publicarAdjuntos(
  supabase: SupabaseClient,
  actividadId: string,
  adjuntos: AdjuntoSubido[],
  texto: string | null,
  esEvidencia = false,
) {
  const filas = adjuntos.length > 0
    ? adjuntos.map((adj, i) => ({
        actividad_id: actividadId,
        contenido: i === 0 ? texto : null,
        adjunto_path: adj.path,
        adjunto_tipo: adj.tipo,
        adjunto_nombre: adj.nombre,
        adjunto_tamano: adj.tamano,
        es_evidencia: esEvidencia,
      }))
    : [{ actividad_id: actividadId, contenido: texto, es_evidencia: esEvidencia }]
  const { data, error } = await supabase.from('actividad_mensajes').insert(filas).select('*')
  if (error) throw error
  return (data ?? []) as ActividadMensaje[]
}

const CLAVE_CHAT_DISPONIBLE = 'fm-chat-disponible'
const esErrorDeRed = (error: { message?: string }) =>
  /Failed to fetch|NetworkError|Load failed|fetch failed/i.test(error.message ?? '') || (typeof navigator !== 'undefined' && !navigator.onLine)
function leerChatDisponible() {
  try { return localStorage.getItem(CLAVE_CHAT_DISPONIBLE) === '1' } catch { return false }
}
function guardarChatDisponible(disponible: boolean) {
  try { localStorage.setItem(CLAVE_CHAT_DISPONIBLE, disponible ? '1' : '0') } catch { /* sin almacenamiento */ }
}

/** Resumen ligero para mostrar el contador en la tarjeta sin abrir el chat. */
export function useResumenChat(actividadId: string, habilitado: boolean) {
  // Oculto hasta comprobar que la migración del chat está instalada.
  const [resumen, setResumen] = useState<{ total: number; nuevos: number; disponible: boolean }>({ total: 0, nuevos: 0, disponible: false })

  const recargar = useCallback(async () => {
    if (!habilitado) return
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const total = await supabase.from('actividad_mensajes')
      .select('id', { count: 'exact', head: true })
      .eq('actividad_id', actividadId)
    // Sin red no se puede saber: se usa lo último comprobado (permite adjuntar fotos sin conexión).
    if (total.error && esErrorDeRed(total.error)) {
      setResumen({ total: 0, nuevos: 0, disponible: leerChatDisponible() })
      return
    }
    // Sin sesión la consulta se rechaza por permisos, pero sí indica si el chat existe.
    if (total.error || !session) {
      const disponible = !esChatNoInstalado(total.error)
      guardarChatDisponible(disponible)
      setResumen({ total: 0, nuevos: 0, disponible })
      return
    }
    guardarChatDisponible(true)
    let nuevosQuery = supabase.from('actividad_mensajes')
      .select('id', { count: 'exact', head: true })
      .eq('actividad_id', actividadId)
      .neq('autor_id', session.user.id)
    const visto = leerVisto(actividadId)
    if (visto) nuevosQuery = nuevosQuery.gt('created_at', visto)
    const nuevos = await nuevosQuery
    setResumen({ total: total.count ?? 0, nuevos: nuevos.count ?? 0, disponible: true })
  }, [actividadId, habilitado])

  useEffect(() => {
    const t = window.setTimeout(() => { void recargar() }, 0)
    return () => window.clearTimeout(t)
  }, [recargar])

  return { ...resumen, recargar }
}

export function useChatActividad(actividadId: string, abierto: boolean) {
  const [mensajes, setMensajes] = useState<ActividadMensaje[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [usuario, setUsuario] = useState<UsuarioChat | null>(null)
  const [estado, setEstado] = useState<EstadoChat>('cargando')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const urlsRef = useRef(urls)
  useEffect(() => { urlsRef.current = urls }, [urls])

  const firmarAdjuntos = useCallback(async (lista: ActividadMensaje[]) => {
    const pendientes = lista
      .map(m => m.adjunto_path)
      .filter((p): p is string => !!p && !urlsRef.current[p])
    if (pendientes.length === 0) return
    const nuevas = await obtenerUrlsFirmadas(createClient(), pendientes)
    setUrls(prev => ({ ...prev, ...nuevas }))
  }, [])

  const agregar = useCallback((nuevos: ActividadMensaje[]) => {
    setMensajes(prev => {
      const ids = new Set(prev.map(m => m.id))
      const unidos = [...prev, ...nuevos.filter(m => !ids.has(m.id))]
      return unidos.sort((a, b) => a.created_at.localeCompare(b.created_at))
    })
    void firmarAdjuntos(nuevos)
  }, [firmarAdjuntos])

  const cargar = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setEstado('sin_sesion')
      return
    }
    setUsuario({ id: session.user.id })
    const { data, error: queryError } = await supabase
      .from('actividad_mensajes')
      .select('*')
      .eq('actividad_id', actividadId)
      .order('created_at', { ascending: true })
      .limit(300)
    if (queryError) {
      setEstado(esChatNoInstalado(queryError) ? 'no_disponible' : 'error')
      return
    }
    const lista = (data ?? []) as ActividadMensaje[]
    setMensajes(lista)
    void firmarAdjuntos(lista)
    setEstado('listo')
  }, [actividadId, firmarAdjuntos])

  useEffect(() => {
    if (!abierto) return
    const supabase = createClient()
    const channel = supabase.channel(`chat-${actividadId}-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'actividad_mensajes', filter: `actividad_id=eq.${actividadId}` },
        payload => agregar([payload.new as ActividadMensaje]),
      )
      .subscribe()
    // Respaldo para teléfonos con Realtime interrumpido: recargar al volver y cada 20 s.
    const refrescar = () => { if (document.visibilityState === 'visible') void cargar() }
    const initial = window.setTimeout(() => { void cargar() }, 0)
    const interval = window.setInterval(refrescar, 20000)
    document.addEventListener('visibilitychange', refrescar)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refrescar)
      void supabase.removeChannel(channel)
    }
  }, [abierto, actividadId, agregar, cargar])

  // Marcar como visto el último mensaje mientras el chat está abierto.
  useEffect(() => {
    if (!abierto || mensajes.length === 0) return
    guardarVisto(actividadId, mensajes[mensajes.length - 1].created_at)
  }, [abierto, actividadId, mensajes])

  const enviar = useCallback(async (texto: string, archivos: File[]) => {
    const contenido = texto.trim() || null
    if (!contenido && archivos.length === 0) return false
    setEnviando(true)
    setError(null)
    const supabase = createClient()
    const subidos: AdjuntoSubido[] = []
    try {
      for (const archivo of archivos) subidos.push(await subirAdjunto(supabase, actividadId, archivo))
      agregar(await publicarAdjuntos(supabase, actividadId, subidos, contenido))
      return true
    } catch (err) {
      await eliminarAdjuntos(supabase, subidos.map(s => s.path))
      setError(err instanceof ErrorAdjunto
        ? err.message
        : 'No se pudo enviar el mensaje. Revisa tu conexión e inténtalo de nuevo.')
      return false
    } finally {
      setEnviando(false)
    }
  }, [actividadId, agregar])

  const imagenes = mensajes.filter(m => esImagen(m.adjunto_tipo) && m.adjunto_path)

  return { mensajes, imagenes, urls, usuario, estado, enviando, error, setError, enviar, recargar: cargar }
}
