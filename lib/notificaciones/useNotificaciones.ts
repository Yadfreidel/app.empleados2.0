'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Notificacion = {
  id: string
  tipo: 'confirmacion'
  empleado_id: string | null
  empleado_nombre: string | null
  actividad_id: string | null
  servicio_id: string | null
  hotel_id: string | null
  hotel_nombre: string | null
  area_id: string | null
  area_nombre: string | null
  operacion_nombre: string | null
  fecha_servicio: string | null
  leida: boolean
  leida_en: string | null
  created_at: string
}

export function useNotificaciones(isAdmin: boolean, soloNoLeidas = false) {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [noLeidas, setNoLeidas] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const busy = useRef(false)
  const request = useRef<AbortController | null>(null)

  const cargar = useCallback(async () => {
    if (!isAdmin) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    try {
      const supabase = createClient()
      let listaQuery = supabase.from('notificaciones').select('*').order('created_at', { ascending: false }).limit(50)
      if (soloNoLeidas) listaQuery = listaQuery.eq('leida', false)
      const [lista, contador] = await Promise.all([
        listaQuery.abortSignal(controller.signal),
        supabase.from('notificaciones').select('id', { count: 'exact', head: true }).eq('leida', false).abortSignal(controller.signal),
      ])
      if (controller.signal.aborted) return
      if (lista.error || contador.error) {
        setError('No se pudieron cargar las notificaciones. Intenta actualizar de nuevo.')
        return
      }
      setNotificaciones((lista.data as Notificacion[]) ?? [])
      setNoLeidas(contador.count ?? 0)
      setError(null)
    } catch {
      if (!controller.signal.aborted) setError('No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [isAdmin, soloNoLeidas])

  useEffect(() => {
    if (!isAdmin) return
    const supabase = createClient()
    const channel = supabase.channel(`notificaciones-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificaciones' }, () => { void cargar() })
      .subscribe(status => { if (status === 'SUBSCRIBED') void cargar() })
    // Respaldo para conexiones sin Realtime: actualizar al volver y cada 15 segundos.
    const refrescar = () => { if (document.visibilityState === 'visible') void cargar() }
    const initial = window.setTimeout(refrescar, 0)
    const interval = window.setInterval(refrescar, 15000)
    window.addEventListener('focus', refrescar)
    document.addEventListener('visibilitychange', refrescar)
    return () => {
      request.current?.abort()
      window.clearTimeout(initial)
      window.clearInterval(interval)
      window.removeEventListener('focus', refrescar)
      document.removeEventListener('visibilitychange', refrescar)
      void supabase.removeChannel(channel)
    }
  }, [isAdmin, cargar])

  const marcar = useCallback(async (id?: string) => {
    if (!isAdmin || busy.current) return
    busy.current = true
    setGuardando(true)
    try {
      const supabase = createClient()
      const { error: rpcError } = id
        ? await supabase.rpc('marcar_notificacion_leida', { p_id: id })
        : await supabase.rpc('marcar_todas_notificaciones_leidas')
      if (rpcError) {
        setError('No se pudo guardar el estado de lectura. Inténtalo de nuevo.')
        return
      }
      await cargar()
    } catch {
      setError('No se pudo guardar el estado de lectura. Revisa tu conexión.')
    } finally {
      busy.current = false
      setGuardando(false)
    }
  }, [isAdmin, cargar])

  const marcarLeida = useCallback((id: string) => marcar(id), [marcar])
  const marcarTodasLeidas = useCallback(() => marcar(), [marcar])
  return { notificaciones: isAdmin ? notificaciones : [], noLeidas: isAdmin ? noLeidas : 0, loading, error, guardando, marcarLeida, marcarTodasLeidas, recargar: cargar }
}
