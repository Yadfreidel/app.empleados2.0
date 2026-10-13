'use client'
// components/calendar/ProximosServicios.tsx
// Próximos servicios pendientes (desde hoy, con los filtros activos).
// Al tocar uno se abre ese día en el calendario (mismo flujo que tocar el día).
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarClock, ChevronRight } from 'lucide-react'
import type { Activity } from '@/types'
import { formatTime } from '@/lib/utils'

export default function ProximosServicios({ actividades, onElegirDia, limite = 6 }: {
  actividades: Activity[]
  onElegirDia: (fecha: Date) => void
  limite?: number
}) {
  const hoy = format(new Date(), 'yyyy-MM-dd')
  const proximos = actividades
    .filter(a => a.date >= hoy && (a.status === 'programado' || a.status === 'en_progreso'))
    .sort((a, b) => (a.date + (a.start_time ?? '99')).localeCompare(b.date + (b.start_time ?? '99')))
    .slice(0, limite)

  return (
    <section aria-label="Próximos servicios" className="fm-card overflow-hidden">
      <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-bold text-foreground">
        <CalendarClock size={16} className="text-fm-navy-600 dark:text-fm-navy-300" /> Próximos servicios
      </h2>
      {proximos.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">No hay servicios pendientes próximos.</p>
      ) : (
        <ul className="divide-y divide-border">
          {proximos.map(a => {
            const fecha = new Date(`${a.date}T12:00:00`)
            const color = a.color_override || a.operation_type?.color || '#16a34a'
            return (
              <li key={a.id}>
                <button type="button" onClick={() => onElegirDia(fecha)}
                  className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60">
                  <span className="flex w-11 shrink-0 flex-col items-center rounded-lg border border-border bg-fm-navy-50 py-1 leading-none dark:bg-fm-navy-950/60">
                    <span className="text-base font-bold text-fm-navy-800 dark:text-white">{format(fecha, 'd')}</span>
                    <span className="mt-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{format(fecha, 'MMM', { locale: es }).replace('.', '')}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
                      <span className="truncate text-sm font-semibold text-foreground">{a.title}</span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{a.hotel?.name ?? '—'}</span>
                  </span>
                  {a.start_time && <span className="shrink-0 text-xs font-medium text-muted-foreground">{formatTime(a.start_time)}</span>}
                  <ChevronRight size={15} className="shrink-0 text-muted-foreground" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
