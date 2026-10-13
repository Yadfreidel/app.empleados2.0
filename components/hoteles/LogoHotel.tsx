'use client'
// components/hoteles/LogoHotel.tsx
// Logo del hotel, o el ícono de edificio si no tiene (o si la imagen no carga).
import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function LogoHotel({ url, nombre, tamano = 40, className }: {
  url?: string | null
  nombre: string
  tamano?: number
  className?: string
}) {
  const [fallo, setFallo] = useState(false)
  const estilo = { width: tamano, height: tamano }
  if (url && !fallo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- imagen del bucket de Supabase
      <img src={url} alt={`Logo de ${nombre}`} style={estilo} onError={() => setFallo(true)}
        className={cn('flex-shrink-0 rounded-lg border border-border bg-white object-contain p-0.5', className)} />
    )
  }
  return (
    <div style={estilo} className={cn('flex flex-shrink-0 items-center justify-center rounded-lg bg-fm-green-100 text-fm-green-800 dark:bg-fm-green-950 dark:text-fm-green-300', className)}>
      <Building2 size={Math.round(tamano * 0.45)} />
    </div>
  )
}
