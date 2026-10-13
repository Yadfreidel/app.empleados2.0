// components/calendar/ResumenMes.tsx
// Resumen del mes mostrado en el calendario (con los filtros activos).
// Solo cuenta datos reales: no hay comparaciones ni tendencias inventadas.
import { CheckCircle2, ClipboardList, Clock, Loader } from 'lucide-react'
import type { Activity } from '@/types'

const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)} % del total` : 'Sin servicios')

export default function ResumenMes({ actividades, mes }: { actividades: Activity[]; mes: string }) {
  const total = actividades.length
  const completados = actividades.filter(a => a.status === 'completado').length
  const enProgreso = actividades.filter(a => a.status === 'en_progreso').length
  const pendientes = actividades.filter(a => a.status === 'programado').length

  const tarjetas = [
    { titulo: 'Servicios del mes', valor: total, detalle: mes, icono: ClipboardList, color: 'bg-fm-navy-700 text-white' },
    { titulo: 'Completados', valor: completados, detalle: pct(completados, total), icono: CheckCircle2, color: 'bg-emerald-600 text-white' },
    { titulo: 'En progreso', valor: enProgreso, detalle: pct(enProgreso, total), icono: Loader, color: 'bg-amber-500 text-white' },
    { titulo: 'Pendientes', valor: pendientes, detalle: pct(pendientes, total), icono: Clock, color: 'bg-sky-600 text-white' },
  ]

  return (
    <section aria-label="Resumen del mes" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {tarjetas.map(({ titulo, valor, detalle, icono: Icono, color }) => (
        <div key={titulo} className="fm-card flex items-center gap-2.5 p-3 sm:gap-3 sm:p-4">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11 ${color}`} aria-hidden="true">
            <Icono size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-2xl font-bold leading-none tabular-nums text-foreground">{valor}</p>
            <p className="mt-1 text-sm font-semibold leading-tight text-foreground">{titulo}</p>
            <p className="text-xs leading-tight text-muted-foreground">{detalle}</p>
          </div>
        </div>
      ))}
    </section>
  )
}
