'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Notificacion = {
  id: string
  tipo: 'confirmacion'
  empleado_id: string | null
  empleado_nombre: string | null
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

export function useNotificaciones(isAdmin: boolean) {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [loading, setLoading] = useState(true)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  const noLeidas = notificaciones.filter(n => !n.leida).length

  const cargar = useCallback(async () => {
    if (!isAdmin) { setLoading(false); return }
    const supabase = createClient()
    const { data } = await supabase
      .from('notificaciones')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    setNotificaciones((data as Notificacion[]) ?? [])
    setLoading(false)
  }, [isAdmin])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Realtime subscription
  useEffect(() => {
    if (!isAdmin) return

    const supabase = createClient()
    const channel = supabase
      .channel('notificaciones-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones' },
        (payload) => {
          const nueva = payload.new as Notificacion
          setNotificaciones(prev => [nueva, ...prev])
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notificaciones' },
        (payload) => {
          const actualizada = payload.new as Notificacion
          setNotificaciones(prev =>
            prev.map(n => n.id === actualizada.id ? actualizada : n)
          )
        }
      )
      .subscribe()

    channelRef.current = channel
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [isAdmin])

  const marcarLeida = useCallback(async (id: string) => {
    const supabase = createClient()
    await supabase.rpc('marcar_notificacion_leida', { p_id: id })
    // optimistic update
    setNotificaciones(prev =>
      prev.map(n => n.id === id ? { ...n, leida: true, leida_en: new Date().toISOString() } : n)
    )
  }, [])

  const marcarTodasLeidas = useCallback(async () => {
    const supabase = createClient()
    await supabase.rpc('marcar_todas_notificaciones_leidas')
    // optimistic update
    const ahora = new Date().toISOString()
    setNotificaciones(prev =>
      prev.map(n => n.leida ? n : { ...n, leida: true, leida_en: ahora })
    )
  }, [])

  return { notificaciones, noLeidas, loading, marcarLeida, marcarTodasLeidas, recargar: cargar }
}
