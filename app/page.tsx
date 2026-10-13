'use client'
// app/page.tsx – Página principal: Calendario público de F&M Fumigación
import { useState, useEffect, useCallback } from 'react'
import { format, isSameDay } from 'date-fns'
import { CloudOff } from 'lucide-react'
import { es } from 'date-fns/locale'
import type { Activity, Hotel, OperationType, FilterState } from '@/types'
import Header from '@/components/layout/Header'
import CalendarGrid from '@/components/calendar/CalendarGrid'
import DayPanel from '@/components/calendar/DayPanel'
import CalendarFilters from '@/components/calendar/CalendarFilters'
import Legend from '@/components/calendar/Legend'
import { CalendarSkeleton } from '@/components/ui/Skeleton'
import EmpleadoDelMesCalendario from '@/components/excelencia/EmpleadoDelMesCalendario'
import BarraLateral from '@/components/layout/BarraLateral'
import ResumenMes from '@/components/calendar/ResumenMes'
import ProximosServicios from '@/components/calendar/ProximosServicios'
import { capitalize } from '@/lib/utils'
import { useEmpleadoDelMes } from '@/lib/excelencia/excelencia'
import { guardarCache, leerCache } from '@/lib/offline/almacen'
import { EVENTO_ACTIVIDAD_SINCRONIZADA, usuarioLocal } from '@/lib/offline/sincronizacion'

type DatosCalendario = { actividades: Activity[]; hoteles: Hotel[]; tipos: OperationType[] }

/** Copia local separada por usuario (o «publico» si no hay sesión en el equipo). */
const claveCache = () => `calendario:${usuarioLocal()?.id ?? 'publico'}`

export default function CalendarPage() {
  const [allActivities, setAllActivities] = useState<Activity[]>([])
  const [hotels, setHotels]               = useState<Hotel[]>([])
  const [operationTypes, setOperationTypes] = useState<OperationType[]>([])
  const [selectedDate, setSelectedDate]   = useState<Date | null>(new Date())
  const [filters, setFilters]             = useState<FilterState>({
    hotel_id: null, operation_type_id: null, status: null, priority: null,
  })
  const [loading, setLoading] = useState(true)
  // Mes que muestra el calendario: lo usa también el resumen del mes.
  const [mesVisible, setMesVisible] = useState<Date>(new Date())
  // Empleado del mes publicado: una sola consulta, se muestra según el ancho de pantalla.
  const empleadoDelMes = useEmpleadoDelMes()
  // Si se muestra la copia guardada en el teléfono: fecha en que se guardó.
  const [copiaLocal, setCopiaLocal] = useState<string | null>(null)
  const [sinDatos, setSinDatos] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const [{ data: acts, error: errActs }, { data: hots, error: errHots }, { data: ops, error: errOps }] = await Promise.all([
        supabase
          .from('activities')
          .select('*, hotel:hotels(*), operation_type:operation_types(id,name,color,icon,description,active,created_at)')
          .eq('published', true)
          .order('date')
          .order('start_time', { ascending: true, nullsFirst: false }),
        supabase.from('hotels').select('*').eq('active', true).order('name'),
        supabase.from('operation_types').select('*').eq('active', true).order('name'),
      ])

      if (errActs || errHots || errOps) throw errActs ?? errHots ?? errOps

      setAllActivities((acts as Activity[]) ?? [])
      setHotels(hots ?? [])
      setOperationTypes(ops ?? [])
      setCopiaLocal(null)
      setSinDatos(false)
      // Guardar para consultar sin conexión (si falla, el calendario sigue funcionando).
      guardarCache(claveCache(), { actividades: acts ?? [], hoteles: hots ?? [], tipos: ops ?? [] } satisfies DatosCalendario)
        .catch(error => console.warn('No se pudo guardar el calendario para usarlo sin conexión:', error))
    } catch (error) {
      console.error('Error cargando datos del calendario:', error)
      // Sin conexión: usar la última copia guardada de este usuario.
      const copia = await leerCache<DatosCalendario>(claveCache()).catch(() => null)
      setAllActivities(copia?.datos.actividades ?? [])
      setHotels(copia?.datos.hoteles ?? [])
      setOperationTypes(copia?.datos.tipos ?? [])
      setCopiaLocal(copia?.guardadoEn ?? null)
      setSinDatos(!copia)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Al volver la conexión, recargar datos frescos.
  useEffect(() => {
    const alVolver = () => { void loadData() }
    window.addEventListener('online', alVolver)
    return () => window.removeEventListener('online', alVolver)
  }, [loadData])

  // Una confirmación guardada sin conexión llegó al servidor: reflejarla.
  useEffect(() => {
    function alSincronizar(evento: Event) {
      const { actividadId, actividad } = (evento as CustomEvent<{ actividadId: string; actividad: Partial<Activity> | null }>).detail
      if (!actividad) return
      setAllActivities(prev => {
        const lista = prev.map(a => a.id === actividadId ? { ...a, ...actividad, hotel: a.hotel, operation_type: a.operation_type } : a)
        guardarCache(claveCache(), { actividades: lista, hoteles: hotels, tipos: operationTypes } satisfies DatosCalendario).catch(() => {})
        return lista
      })
    }
    window.addEventListener(EVENTO_ACTIVIDAD_SINCRONIZADA, alSincronizar)
    return () => window.removeEventListener(EVENTO_ACTIVIDAD_SINCRONIZADA, alSincronizar)
  }, [hotels, operationTypes])

  // Filtrar actividades según los filtros activos
  const filteredActivities = allActivities.filter(act => {
    if (filters.hotel_id && act.hotel_id !== filters.hotel_id) return false
    if (filters.operation_type_id && act.operation_type_id !== filters.operation_type_id) return false
    if (filters.status && act.status !== filters.status) return false
    if (filters.priority && act.priority !== filters.priority) return false
    return true
  })

  // Actividades del mes mostrado (para el resumen)
  const actividadesDelMes = filteredActivities.filter(act => act.date.startsWith(format(mesVisible, 'yyyy-MM')))
  const nombreMesVisible = capitalize(format(mesVisible, 'MMMM yyyy', { locale: es }))

  function elegirDia(fecha: Date) {
    setMesVisible(fecha)
    setSelectedDate(fecha)
  }

  // Actividades del día seleccionado
  const dayActivities = selectedDate
    ? filteredActivities.filter(act => act.date === format(selectedDate, 'yyyy-MM-dd'))
    : []

  function handleActivityUpdated(updated: Activity) {
    setAllActivities(prev => prev.map(a => a.id === updated.id ? updated : a))
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Menú lateral azul marino (solo PC) */}
      <BarraLateral />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header conBarraLateral titulo="Calendario operativo" />

        <main className="flex-1 w-full px-4 py-5 md:px-6 lg:py-6 xl:px-8">
          {/* Título (en PC el título va en el encabezado) */}
          <div className="mb-4 lg:hidden">
            <h1 className="text-xl font-800 text-foreground leading-tight tracking-tight">Calendario operativo</h1>
            <p className="text-sm text-muted-foreground mt-1">Trabajos programados de F&amp;M Fumigación en todos los hoteles</p>
          </div>
          <p className="mb-4 hidden text-sm text-muted-foreground lg:block">Trabajos programados de F&amp;M Fumigación en todos los hoteles</p>

          {/* Teléfono y tablet: empleado del mes debajo del título */}
          <EmpleadoDelMesCalendario publicado={empleadoDelMes} className="mb-4 lg:hidden" />

          {copiaLocal && (
            <p role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-slate-300 bg-slate-100 p-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
              <CloudOff size={18} className="mt-0.5 shrink-0" />
              <span>
                <strong>Sin conexión.</strong> Mostrando el calendario guardado en este teléfono el {format(new Date(copiaLocal), 'dd/MM/yyyy')} a las {format(new Date(copiaLocal), 'HH:mm')}.
                Puedes confirmar actividades: se enviarán al recuperar la conexión.
              </span>
            </p>
          )}
          {sinDatos && (
            <p role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <CloudOff size={18} className="mt-0.5 shrink-0" />
              <span>Sin conexión y sin un calendario guardado en este teléfono. Ábrelo con internet al menos una vez para poder consultarlo sin conexión.</span>
            </p>
          )}

          {/* Filtros */}
          <div className="mb-4">
            <CalendarFilters
              hotels={hotels}
              operationTypes={operationTypes}
              filters={filters}
              onChange={setFilters}
            />
          </div>

          {/* Resumen del mes mostrado (datos reales, con los filtros activos) */}
          <div className="mb-4">
            <ResumenMes actividades={actividadesDelMes} mes={nombreMesVisible} />
          </div>

          {/* Calendario + columna lateral (empleado del mes y panel del día) en PC */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
            <div className="min-w-0 space-y-4">
              {loading ? (
                <CalendarSkeleton />
              ) : (
                <CalendarGrid
                  activities={filteredActivities}
                  month={mesVisible}
                  onMonthChange={setMesVisible}
                  selectedDate={selectedDate}
                  onDaySelect={date =>
                    setSelectedDate(prev => (prev && isSameDay(prev, date)) ? null : date)
                  }
                />
              )}
              {/* Leyenda */}
              <Legend operationTypes={operationTypes} />
            </div>

            <div className="space-y-4">
              <EmpleadoDelMesCalendario publicado={empleadoDelMes} className="hidden lg:block" />

              {/* Panel de día: hoja inferior en teléfono (<lg) y columna lateral en PC (>=lg) */}
              {selectedDate ? (
                <>
                  {/* Backdrop móvil */}
                  <div
                    className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs z-40 lg:hidden fm-animate-fadein"
                    onClick={() => setSelectedDate(null)}
                    aria-hidden="true"
                  />
                  <div className="fixed inset-x-0 bottom-0 z-50 p-2 sm:p-4 lg:p-0 lg:static lg:z-auto">
                    <DayPanel
                      date={selectedDate}
                      activities={dayActivities}
                      loading={loading}
                      onClose={() => setSelectedDate(null)}
                      onActivityUpdated={handleActivityUpdated}
                    />
                  </div>
                </>
              ) : null}

              <div className="hidden lg:block">
                <ProximosServicios actividades={filteredActivities} onElegirDia={elegirDia} />
              </div>
            </div>
          </div>
        </main>

        {/* Footer (en PC está en el menú lateral) */}
        <footer className="lg:hidden text-center py-5 text-xs text-muted-foreground border-t border-border mt-auto">
          &copy; {new Date().getFullYear()} F&amp;M Fumigación &mdash; Sistema de gestión operativa
        </footer>
      </div>
    </div>
  )
}
