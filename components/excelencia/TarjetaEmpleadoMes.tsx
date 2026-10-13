'use client'
// components/excelencia/TarjetaEmpleadoMes.tsx
// Tarjeta del empleado del mes: se usa en el calendario y como vista previa
// antes de publicar. Plegable para no ocupar espacio en el teléfono.
import { useState } from 'react'
import { ChevronDown, ChevronUp, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { nombreMes } from '@/lib/excelencia/excelencia'

export interface DatosTarjeta {
  nombre: string
  mes: string
  mensaje: string
  fotoUrl: string | null
  porcentaje?: number
}

export default function TarjetaEmpleadoMes({ datos, className, plegable = true }: { datos: DatosTarjeta; className?: string; plegable?: boolean }) {
  const [abierta, setAbierta] = useState(true)
  const [fotoFallo, setFotoFallo] = useState(false)
  const iniciales = datos.nombre.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()

  return (
    <aside aria-label="Empleado del mes"
      className={cn('overflow-hidden rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-white shadow-sm dark:border-amber-800 dark:from-amber-950/50 dark:to-card', className)}>
      <div className="flex items-center gap-3 p-3">
        {datos.fotoUrl && !fotoFallo ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto del bucket público de Supabase
          <img src={datos.fotoUrl} alt={`Foto de ${datos.nombre}`} onError={() => setFotoFallo(true)}
            className="h-14 w-14 shrink-0 rounded-full border-2 border-amber-400 object-cover" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-amber-400 bg-amber-100 text-lg font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            {iniciales || '★'}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            <Trophy size={12} /> Empleado del mes · {nombreMes(datos.mes)}
          </p>
          <p className="truncate text-base font-bold text-foreground">{datos.nombre}</p>
          {datos.porcentaje !== undefined && (
            <p className="text-xs text-muted-foreground">{datos.porcentaje.toLocaleString('es-DO')} % de cumplimiento</p>
          )}
        </div>
        {plegable && (
          <button type="button" onClick={() => setAbierta(v => !v)} aria-expanded={abierta}
            aria-label={abierta ? 'Ocultar mensaje' : 'Ver mensaje'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-950">
            {abierta ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        )}
      </div>
      {(abierta || !plegable) && (
        <p className="whitespace-pre-wrap break-words border-t border-amber-200 px-3 py-2.5 text-sm text-foreground/90 dark:border-amber-900">
          {datos.mensaje}
        </p>
      )}
    </aside>
  )
}
