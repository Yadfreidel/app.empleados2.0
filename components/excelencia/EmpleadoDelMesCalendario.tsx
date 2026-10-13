'use client'
// components/excelencia/EmpleadoDelMesCalendario.tsx
// Apartado del empleado del mes en el calendario. Si aún no hay ninguno
// publicado, se muestra una tarjeta de espera (sin datos inventados).
import { Trophy } from 'lucide-react'
import TarjetaEmpleadoMes from './TarjetaEmpleadoMes'
import { cn } from '@/lib/utils'
import { urlFoto, type EmpleadoMes } from '@/lib/excelencia/excelencia'

/** La página consulta una sola vez (useEmpleadoDelMes) y lo muestra donde corresponda según el ancho. */
export default function EmpleadoDelMesCalendario({ publicado, className }: { publicado: EmpleadoMes | null | undefined; className?: string }) {
  // Mientras consulta no se muestra nada, para no parpadear entre la espera y la tarjeta real.
  if (publicado === undefined) return null
  if (!publicado) {
    return (
      <aside aria-label="Empleado del mes"
        className={cn('rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-4 dark:border-amber-800 dark:bg-amber-950/30', className)}>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
            <Trophy size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">Empleado del mes</p>
            <p className="text-sm font-semibold text-foreground">Aún no se ha publicado</p>
            <p className="text-xs text-muted-foreground">Aquí aparecerá el reconocimiento cuando la administración lo publique.</p>
          </div>
        </div>
      </aside>
    )
  }
  return (
    <TarjetaEmpleadoMes className={className} datos={{
      nombre: publicado.nombre,
      mes: publicado.mes,
      mensaje: publicado.mensaje,
      fotoUrl: urlFoto(publicado.foto_path),
      porcentaje: Number(publicado.porcentaje),
    }} />
  )
}
