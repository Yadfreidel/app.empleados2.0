'use client'
// app/page.tsx – Página principal: Calendario público de F&M Fumigación
import { useState, useEffect, useCallback } from 'react'
import { format, isSameDay } from 'date-fns'
import type { Activity, Hotel, OperationType, FilterState } from '@/types'
import Header from '@/components/layout/Header'
import CalendarGrid from '@/components/calendar/CalendarGrid'
import DayPanel from '@/components/calendar/DayPanel'
import CalendarFilters from '@/components/calendar/CalendarFilters'
import Legend from '@/components/calendar/Legend'
import { CalendarSkeleton } from '@/components/ui/Skeleton'

export default function CalendarPage() {
  const [allActivities, setAllActivities] = useState<Activity[]>([])
  const [hotels, setHotels]               = useState<Hotel[]>([])
  const [operationTypes, setOperationTypes] = useState<OperationType[]>([])
  const [selectedDate, setSelectedDate]   = useState<Date | null>(new Date())
  const [filters, setFilters]             = useState<FilterState>({
    hotel_id: null, operation_type_id: null, status: null, priority: null,
  })
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const [{ data: acts }, { data: hots }, { data: ops }] = await Promise.all([
        supabase
          .from('activities')
          .select('*, hotel:hotels(id,name,location,code,active,notes,created_at), operation_type:operation_types(id,name,color,icon,description,active,created_at)')
          .eq('published', true)
          .order('date')
          .order('start_time', { ascending: true, nullsFirst: false }),
        supabase.from('hotels').select('*').eq('active', true).order('name'),
        supabase.from('operation_types').select('*').eq('active', true).order('name'),
      ])

      setAllActivities((acts as Activity[]) ?? [])
      setHotels(hots ?? [])
      setOperationTypes(ops ?? [])
    } catch (error) {
      console.error('Error cargando datos del calendario:', error)
      setAllActivities([])
      setHotels([])
      setOperationTypes([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Filtrar actividades según los filtros activos
  const filteredActivities = allActivities.filter(act => {
    if (filters.hotel_id && act.hotel_id !== filters.hotel_id) return false
    if (filters.operation_type_id && act.operation_type_id !== filters.operation_type_id) return false
    if (filters.status && act.status !== filters.status) return false
    if (filters.priority && act.priority !== filters.priority) return false
    return true
  })

  // Actividades del día seleccionado
  const dayActivities = selectedDate
    ? filteredActivities.filter(act => act.date === format(selectedDate, 'yyyy-MM-dd'))
    : []

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />

      <main className="flex-1 fm-container py-6 w-full max-w-7xl mx-auto px-4 md:px-6">
        {/* Título */}
        <div className="mb-5">
          <h1 className="text-xl md:text-2xl font-800 text-foreground leading-tight tracking-tight">
            Calendario Operativo
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Trabajos programados de F&amp;M Fumigación en todos los hoteles
          </p>
        </div>

        {/* Filtros */}
        <div className="mb-4">
          <CalendarFilters
            hotels={hotels}
            operationTypes={operationTypes}
            filters={filters}
            onChange={setFilters}
          />
        </div>

        {/* Layout principal: Calendario + Panel día (bottom sheet en móvil, columna lateral en PC) */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 items-start">
          {/* Calendario */}
          <div className="space-y-4">
            {loading ? (
              <CalendarSkeleton />
            ) : (
              <CalendarGrid
                activities={filteredActivities}
                selectedDate={selectedDate}
                onDaySelect={date =>
                  setSelectedDate(prev => (prev && isSameDay(prev, date)) ? null : date)
                }
              />
            )}
            {/* Leyenda */}
            <Legend operationTypes={operationTypes} />
          </div>

          {/* Panel de día: bottom sheet en mobile (<lg) y sticky sidebar en PC (>=lg) */}
          {selectedDate && (
            <>
              {/* Backdrop móvil */}
              <div
                className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs z-40 lg:hidden fm-animate-fadein"
                onClick={() => setSelectedDate(null)}
                aria-hidden="true"
              />
              <div className="fixed inset-x-0 bottom-0 z-50 p-2 sm:p-4 lg:p-0 lg:static lg:z-auto lg:sticky lg:top-20">
                <DayPanel
                  date={selectedDate}
                  activities={dayActivities}
                  loading={loading}
                  onClose={() => setSelectedDate(null)}
                />
              </div>
            </>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-5 text-xs text-muted-foreground border-t border-border mt-auto">
        &copy; {new Date().getFullYear()} F&amp;M Fumigación &mdash; Sistema de gestión operativa
      </footer>
    </div>
  )
}
