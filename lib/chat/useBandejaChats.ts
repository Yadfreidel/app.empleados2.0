'use client'
// lib/chat/useBandejaChats.ts
// Bandeja del administrador: actividades con conversación, ordenadas por el último mensaje.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ActivityStatus } from '@/types'
import { EVENTO_CHAT_VISTO, leerVisto } from './useChatActividad'

// Mensajes recientes que se agrupan por actividad. Cubre de sobra el volumen de la
// operación; conversaciones sin actividad dentro de este rango dejan de listarse.
const LIMITE_MENSAJES = 1500

export interface ConversacionActividad {
  actividadId: string
  titulo: string
  hotel: string | null
  fecha: string
  estado: ActivityStatus
  colorTipo: string | null
  ultimoTexto: string
  ultimoAutor: string | null
  ultimoEsMio: boolean
  ultimoEn: string
  mensajes: number
  noLeidos: number
}

interface FilaMensaje {
  actividad_id: string
  autor_id: string | null
  autor_nombre: string | null
  contenido: string | null
  adjunto_tipo: string | null
  created_at: string
}

interface FilaActividad {
  id: string
  title: string
  date: string
  status: ActivityStatus
  color_override: string | null
  hotel: { name: string } | null
  operation_type: { color: string } | null
}

function vistaPrevia(m: FilaMensaje) {
  if (m.contenido) return m.contenido
  if (m.adjunto_tipo?.startsWith('image/')) return '📷 Foto'
  if (m.adjunto_tipo) return '📄 Documento'
  return ''
}

export function useBandejaChats(habilitado = true) {
  const [conversaciones, setConversaciones] = useState<ConversacionActividad[]>([])
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'no_disponible' | 'error'>('cargando')
  const mensajesRef = useRef<FilaMensaje[]>([])
  const actividadesRef = useRef<Map<string, FilaActividad>>(new Map())
  const miIdRef = useRef<string | null>(null)

  // Recalcula la lista con los datos ya cargados (p. ej. al marcar un chat como leído).
  const componer = useCallback(() => {
    const porActividad = new Map<string, FilaMensaje[]>()
    for (const m of mensajesRef.current) {
      const lista = porActividad.get(m.actividad_id)
      if (lista) lista.push(m)
      else porActividad.set(m.actividad_id, [m])
    }
    const resultado: ConversacionActividad[] = []
    for (const [actividadId, lista] of porActividad) {
      const actividad = actividadesRef.current.get(actividadId)
      if (!actividad) continue
      const ultimo = lista[0] // los mensajes llegan del más reciente al más antiguo
      const visto = leerVisto(actividadId)
      resultado.push({
        actividadId,
        titulo: actividad.title,
        hotel: actividad.hotel?.name ?? null,
        fecha: actividad.date,
        estado: actividad.status,
        colorTipo: actividad.color_override || actividad.operation_type?.color || null,
        ultimoTexto: vistaPrevia(ultimo),
        ultimoAutor: ultimo.autor_nombre,
        ultimoEsMio: ultimo.autor_id === miIdRef.current,
        ultimoEn: ultimo.created_at,
        mensajes: lista.length,
        noLeidos: lista.filter(m => m.autor_id !== miIdRef.current && (!visto || m.created_at > visto)).length,
      })
    }
    setConversaciones(resultado.sort((a, b) => b.ultimoEn.localeCompare(a.ultimoEn)))
  }, [])

  const cargar = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    miIdRef.current = session?.user.id ?? null
    const { data, error } = await supabase
      .from('actividad_mensajes')
      .select('actividad_id, autor_id, autor_nombre, contenido, adjunto_tipo, created_at')
      .order('created_at', { ascending: false })
      .limit(LIMITE_MENSAJES)
    if (error) {
      setEstado(error.code === 'PGRST205' || error.code === '42P01' ? 'no_disponible' : 'error')
      return
    }
    const mensajes = (data ?? []) as FilaMensaje[]
    // Se vuelven a leer siempre para reflejar cambios de estado (p. ej. recién confirmada).
    const ids = [...new Set(mensajes.map(m => m.actividad_id))]
    const actividades = new Map<string, FilaActividad>()
    if (ids.length > 0) {
      const { data: acts, error: actError } = await supabase
        .from('activities')
        .select('id, title, date, status, color_override, hotel:hotels(name), operation_type:operation_types(color)')
        .in('id', ids)
      if (actError) { setEstado('error'); return }
      for (const a of (acts ?? []) as unknown as FilaActividad[]) actividades.set(a.id, a)
    }
    actividadesRef.current = actividades
    mensajesRef.current = mensajes
    componer()
    setEstado('listo')
  }, [componer])

  useEffect(() => {
    if (!habilitado) return
    const supabase = createClient()
    let pendiente: number | undefined
    // Varios mensajes seguidos (p. ej. 4 fotos) provocan una sola recarga.
    const programar = () => {
      window.clearTimeout(pendiente)
      pendiente = window.setTimeout(() => { void cargar() }, 400)
    }
    const channel = supabase.channel(`bandeja-chats-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'actividad_mensajes' }, programar)
      .subscribe()
    const refrescar = () => { if (document.visibilityState === 'visible') programar() }
    const initial = window.setTimeout(() => { void cargar() }, 0)
    const interval = window.setInterval(refrescar, 30000)
    document.addEventListener('visibilitychange', refrescar)
    window.addEventListener(EVENTO_CHAT_VISTO, componer)
    return () => {
      window.clearTimeout(initial)
      window.clearTimeout(pendiente)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refrescar)
      window.removeEventListener(EVENTO_CHAT_VISTO, componer)
      void supabase.removeChannel(channel)
    }
  }, [habilitado, cargar, componer])

  const totalNoLeidos = conversaciones.reduce((s, c) => s + c.noLeidos, 0)
  return { conversaciones, estado, totalNoLeidos, recargar: cargar }
}
