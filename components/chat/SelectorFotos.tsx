'use client'
// components/chat/SelectorFotos.tsx
// Botones de cámara/galería y miniaturas de archivos pendientes de enviar.
import { useRef } from 'react'
import { Camera, FileText, ImagePlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TIPOS_ADJUNTO } from '@/lib/chat/adjuntos'
import type { ArchivoPendiente } from '@/lib/chat/useArchivosPendientes'

interface BotonesAdjuntarProps {
  onArchivos: (files: FileList | null) => void
  disabled?: boolean
  /** 'icono' para la barra del chat; 'boton' para formularios. */
  variante?: 'icono' | 'boton'
  /** La galería solo ofrece fotos (sin PDF). */
  soloImagenes?: boolean
}

export function BotonesAdjuntar({ onArchivos, disabled, variante = 'icono', soloImagenes }: BotonesAdjuntarProps) {
  const camara = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)
  const clases = variante === 'icono'
    ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50'
    : 'flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50'

  return (
    <>
      <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { onArchivos(e.target.files); e.target.value = '' }} />
      <input ref={galeria} type="file" accept={soloImagenes ? 'image/*' : TIPOS_ADJUNTO} multiple className="hidden"
        onChange={e => { onArchivos(e.target.files); e.target.value = '' }} />
      <button type="button" onClick={() => camara.current?.click()} disabled={disabled} className={clases} aria-label="Tomar foto">
        <Camera size={variante === 'icono' ? 20 : 17} />
        {variante === 'boton' && 'Tomar foto'}
      </button>
      <button type="button" onClick={() => galeria.current?.click()} disabled={disabled} className={clases} aria-label="Adjuntar fotos o PDF">
        <ImagePlus size={variante === 'icono' ? 20 : 17} />
        {variante === 'boton' && 'Galería'}
      </button>
    </>
  )
}

interface MiniaturasProps {
  pendientes: ArchivoPendiente[]
  onQuitar: (id: string) => void
  disabled?: boolean
  grande?: boolean
}

export function MiniaturasPendientes({ pendientes, onQuitar, disabled, grande }: MiniaturasProps) {
  if (pendientes.length === 0) return null
  return (
    <div className={cn('flex gap-2', grande ? 'flex-wrap' : 'overflow-x-auto pb-1')}>
      {pendientes.map(p => (
        <div key={p.id} className={cn('relative shrink-0 overflow-hidden rounded-lg border border-border bg-muted', grande ? 'h-20 w-20' : 'h-16 w-16')}>
          {p.preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- vista previa local
            <img src={p.preview} alt={p.file.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-0.5 p-1 text-muted-foreground">
              <FileText size={18} />
              <span className="w-full truncate text-center text-[9px]">{p.file.name}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => onQuitar(p.id)}
            disabled={disabled}
            className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
            aria-label={`Quitar ${p.file.name}`}
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
