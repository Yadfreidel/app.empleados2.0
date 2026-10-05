'use client'

import { useEffect, useState, useCallback } from 'react'
import AreaMatrix from './AreaMatrix'
import { createClient } from '@/lib/supabase/client'
import type { AreaHotel, MatrizMensual, ServicioArea } from '@/lib/calendario-hotel/datos'

type HotelOption = { id: string; name: string }
type EstadoFiltro = '' | 'programado' | 'realizado' | 'reprogramado' | 'cancelado'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export default function AreaCalendarSection() {
  const now = new Date()
  const [hotels, setHotels] = useState<HotelOption[]>([])
  const [hotelId, setHotelId] = useState('')
  const [role, setRole] = useState<string | null>(null)
  const [anio, setAnio] = useState(now.getFullYear())
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>('')
  const [matrix, setMatrix] = useState<MatrizMensual | null>(null)
  const [loadingHotels, setLoadingHotels] = useState(true)
  const [loadingMatrix, setLoadingMatrix] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    async function loadHotels() {
      const [{ data, error: hotelsError }, { data: { user } }] = await Promise.all([
        supabase.from('hotels').select('id, name').eq('active', true).order('name'),
        supabase.auth.getUser(),
      ])
      if (cancelled) return
      if (hotelsError) setError('No se pudieron cargar los hoteles.')
      setHotels(data ?? [])
      setHotelId(data?.[0]?.id ?? '')
      if (user) {
        const { data: profile } = await supabase
          .from('profiles').select('role, active').eq('id', user.id).maybeSingle()
        if (!cancelled) {
          const userRole = (profile?.active && profile?.role) || (user.user_metadata?.role as string) || 'consulta'
          setRole(userRole)
        }
      }
      if (!cancelled) setLoadingHotels(false)
    }

    void loadHotels()
    return () => { cancelled = true }
  }, [])

  const cargarMatrix = useCallback(async () => {
    if (!hotelId) { setMatrix(null); setLoadingMatrix(false); return }
    const supabase = createClient()
    const hotel = hotels.find((item) => item.id === hotelId)
    const mm = String(mes).padStart(2, '0')
    const desde = `${anio}-${mm}-01`
    const hasta = `${anio}-${mm}-${new Date(anio, mes, 0).getDate()}`
    setLoadingMatrix(true)
    setError(null)

    const { data: areas, error: areasError } = await supabase
      .from('hotel_areas').select('id, nombre, horario, orden')
      .eq('hotel_id', hotelId).eq('activo', true).order('orden')

    if (areasError || !hotel) {
      setError('No se pudo cargar el calendario de areas. Comprueba que las migraciones esten aplicadas.')
      setMatrix(null); setLoadingMatrix(false); return
    }

    const areaIds = (areas as AreaHotel[]).map((area) => area.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = areaIds.length
      ? supabase.from('area_servicios')
          .select('id, area_id, fecha, estado, notas, confirmado_por, confirmado_nombre, confirmado_en, confirmacion_nota')
          .in('area_id', areaIds).gte('fecha', desde).lte('fecha', hasta)
      : null
    if (estadoFiltro && q) q = q.eq('estado', estadoFiltro)
    const { data: services, error: servicesError } = q ? await q : { data: [], error: null }

    if (servicesError) {
      setError('No se pudieron cargar los servicios del calendario.')
      setMatrix(null)
    } else {
      setMatrix({ hotel, anio, mes, areas: areas as AreaHotel[], servicios: (services ?? []) as ServicioArea[] })
    }
    setLoadingMatrix(false)
  }, [hotelId, hotels, anio, mes, estadoFiltro])

  useEffect(() => { void cargarMatrix() }, [cargarMatrix])

  // Realtime: actualizacion en vivo cuando un empleado confirma
  useEffect(() => {
    if (!hotelId || !matrix) return
    const supabase = createClient()
    const areaIds = matrix.areas.map(a => a.id)
    if (!areaIds.length) return
    const channel = supabase
      .channel(`area-servicios-${hotelId}-${anio}-${mes}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'area_servicios' }, (payload) => {
        const nuevo = payload.new as ServicioArea | undefined
        const viejo = payload.eventType === 'DELETE' ? payload.old as { id: string } : null
        setMatrix(prev => {
          if (!prev) return prev
          if (payload.eventType === 'DELETE' && viejo) {
            return { ...prev, servicios: prev.servicios.filter(s => s.id !== viejo.id) }
          }
          if (!nuevo || !areaIds.includes(nuevo.area_id)) return prev
          const existe = prev.servicios.find(s => s.id === nuevo.id)
          if (existe) return { ...prev, servicios: prev.servicios.map(s => s.id === nuevo.id ? nuevo : s) }
          return { ...prev, servicios: [...prev.servicios, nuevo] }
        })
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId, anio, mes])

  function actualizarServicio(servicio: ServicioArea) {
    setMatrix(actual => actual && ({
      ...actual,
      servicios: actual.servicios.map((item) => item.id === servicio.id ? servicio : item),
    }))
  }

  const anios = Array.from({ length: 3 }, (_, i) => now.getFullYear() - 1 + i)

  return (
    <section className="space-y-4" aria-busy={loadingHotels || loadingMatrix}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-800 text-foreground">Calendario por areas</h2>
          <p className="mt-1 text-sm text-muted-foreground">Servicios programados por hotel y area</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Hotel</span>
            <select id="area-cal-hotel" className="fm-input" value={hotelId}
              onChange={(e) => setHotelId(e.target.value)} disabled={loadingHotels}>
              {hotels.length === 0 && <option value="">No hay hoteles activos</option>}
              {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Mes</span>
            <select id="area-cal-mes" className="fm-input" value={mes}
              onChange={(e) => setMes(Number(e.target.value))}>
              {MESES.map((nombre, i) => <option key={i + 1} value={i + 1}>{nombre}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Anio</span>
            <select id="area-cal-anio" className="fm-input" value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}>
              {anios.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Estado</span>
            <select id="area-cal-estado" className="fm-input" value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value as EstadoFiltro)}>
              <option value="">Todos</option>
              <option value="programado">Programado</option>
              <option value="realizado">Realizado</option>
              <option value="reprogramado">Reprogramado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </label>
        </div>
      </header>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loadingHotels || loadingMatrix ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Cargando calendario...</p>
      ) : matrix ? (
        <AreaMatrix matriz={matrix} rutaBase="/" showMonthNav={false}
          puedeConfirmar={role === 'consulta' || role === 'admin'}
          onServiceUpdate={actualizarServicio} />
      ) : !error && hotels.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No hay hoteles activos.</p>
      ) : null}
    </section>
  )
}