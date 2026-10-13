'use client'
// components/perfil/Avatar.tsx
// Foto de perfil redonda, o las iniciales si no hay foto (o si no carga).
import { useState } from 'react'
import { cn } from '@/lib/utils'

export default function Avatar({ url, nombre, tamano = 36, className }: { url?: string | null; nombre: string; tamano?: number; className?: string }) {
  const [fallo, setFallo] = useState(false)
  const iniciales = nombre.split(/[\s@.]+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase() || '?'
  const estilo = { width: tamano, height: tamano, fontSize: Math.max(11, Math.round(tamano * 0.38)) }
  if (url && !fallo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL firmada del bucket privado
      <img src={url} alt={`Foto de ${nombre}`} style={estilo} onError={() => setFallo(true)}
        className={cn('shrink-0 rounded-full object-cover ring-2 ring-white dark:ring-slate-800', className)} />
    )
  }
  return (
    <span style={estilo} aria-label={`Sin foto: ${nombre}`}
      className={cn('flex shrink-0 items-center justify-center rounded-full bg-fm-navy-100 font-bold text-fm-navy-800 ring-2 ring-white dark:bg-fm-navy-800 dark:text-white dark:ring-slate-800', className)}>
      {iniciales}
    </span>
  )
}
