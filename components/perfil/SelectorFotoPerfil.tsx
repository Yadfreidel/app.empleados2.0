'use client'
// components/perfil/SelectorFotoPerfil.tsx
// Elegir foto (cámara o galería), recortarla en cuadrado (arrastrar + zoom),
// ver la vista previa y guardarla. Se valida tipo y tamaño antes de recortar;
// el resultado es un JPG de 512×512 (liviano) que el servidor vuelve a validar.
import { useEffect, useRef, useState, type PointerEvent as EventoPuntero } from 'react'
import { Camera, Check, ImagePlus, Loader2, RotateCcw, ZoomIn } from 'lucide-react'
import Button from '@/components/ui/Button'
import Avatar from './Avatar'
import { guardarFotoPerfil, validarFotoPerfil } from '@/lib/perfil/perfil'

const LADO = 260       // tamaño del recuadro de recorte en pantalla (px)
const SALIDA = 512     // tamaño de la foto guardada (px)

export default function SelectorFotoPerfil({ nombre, fotoActual, onGuardada }: {
  nombre: string
  fotoActual: string | null
  onGuardada?: () => void
}) {
  const camara = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)
  const [imagen, setImagen] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [desplazamiento, setDesplazamiento] = useState({ x: 0, y: 0 })
  const arrastre = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const [vistaPrevia, setVistaPrevia] = useState<{ blob: Blob; url: string } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState(false)

  useEffect(() => () => { if (vistaPrevia) URL.revokeObjectURL(vistaPrevia.url) }, [vistaPrevia])
  // La dirección local de la imagen en recorte se libera al reemplazarla o al salir.
  useEffect(() => () => { if (imagen) URL.revokeObjectURL(imagen.src) }, [imagen])

  // Escala base: la imagen cubre todo el recuadro.
  const base = imagen ? LADO / Math.min(imagen.naturalWidth, imagen.naturalHeight) : 1
  const ancho = imagen ? imagen.naturalWidth * base * zoom : 0
  const alto = imagen ? imagen.naturalHeight * base * zoom : 0
  const limitar = (x: number, y: number) => ({
    x: Math.max(-(ancho - LADO) / 2, Math.min((ancho - LADO) / 2, x)),
    y: Math.max(-(alto - LADO) / 2, Math.min((alto - LADO) / 2, y)),
  })
  const pos = limitar(desplazamiento.x, desplazamiento.y)

  function elegir(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    const problema = validarFotoPerfil(file)
    if (problema) { setError(problema); return }
    setError(null)
    setExito(false)
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { setImagen(img); setZoom(1); setDesplazamiento({ x: 0, y: 0 }); setVistaPrevia(null) }
    img.onerror = () => { setError('No se pudo leer la imagen. Prueba con otra foto.'); URL.revokeObjectURL(url) }
    img.src = url
  }

  function iniciarArrastre(e: EventoPuntero<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    arrastre.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y }
  }
  function mover(e: EventoPuntero<HTMLDivElement>) {
    const a = arrastre.current
    if (a) setDesplazamiento({ x: a.ox + e.clientX - a.x, y: a.oy + e.clientY - a.y })
  }

  async function recortar() {
    if (!imagen) return
    const escala = base * zoom
    const izquierda = LADO / 2 - ancho / 2 + pos.x
    const arriba = LADO / 2 - alto / 2 + pos.y
    const canvas = document.createElement('canvas')
    canvas.width = SALIDA
    canvas.height = SALIDA
    const ctx = canvas.getContext('2d')
    if (!ctx) { setError('Este navegador no permite recortar imágenes.'); return }
    ctx.drawImage(imagen, -izquierda / escala, -arriba / escala, LADO / escala, LADO / escala, 0, 0, SALIDA, SALIDA)
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.9))
    if (!blob) { setError('No se pudo preparar la foto.'); return }
    setVistaPrevia({ blob, url: URL.createObjectURL(blob) })
  }

  async function guardar() {
    if (!vistaPrevia) return
    setGuardando(true)
    setError(null)
    const r = await guardarFotoPerfil(vistaPrevia.blob)
    setGuardando(false)
    if (!r.ok) { setError(r.error); return }
    setExito(true)
    setImagen(null)
    setVistaPrevia(null)
    onGuardada?.()
  }

  return (
    <div className="space-y-4">
      <input ref={camara} type="file" accept="image/jpeg,image/png,image/webp" capture="user" className="hidden"
        onChange={e => { elegir(e.target.files); e.target.value = '' }} />
      <input ref={galeria} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={e => { elegir(e.target.files); e.target.value = '' }} />

      {!imagen && (
        <div className="flex flex-col items-center gap-3 text-center">
          <Avatar url={fotoActual} nombre={nombre} tamano={112} className="ring-4" />
          {exito && <p role="status" className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400"><Check size={16} /> Foto guardada</p>}
        </div>
      )}

      {imagen && !vistaPrevia && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">Arrastra para encuadrar tu cara y usa el zoom.</p>
          <div
            role="img" aria-label="Recorte de la foto"
            onPointerDown={iniciarArrastre} onPointerMove={mover} onPointerUp={() => { arrastre.current = null }} onPointerCancel={() => { arrastre.current = null }}
            className="relative cursor-grab touch-none overflow-hidden rounded-2xl bg-slate-900 active:cursor-grabbing"
            style={{ width: LADO, height: LADO }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- imagen local en recorte */}
            <img src={imagen.src} alt="" draggable={false} className="pointer-events-none absolute max-w-none select-none"
              style={{ width: ancho, height: alto, left: LADO / 2 - ancho / 2 + pos.x, top: LADO / 2 - alto / 2 + pos.y }} />
            {/* Guía circular: así se verá el avatar (fuera del círculo se oscurece) */}
            <div className="pointer-events-none absolute inset-0 m-auto rounded-full ring-2 ring-white/90" style={{ width: LADO - 8, height: LADO - 8, boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.45)' }} />
          </div>
          <label className="flex w-full max-w-[260px] items-center gap-2 text-xs text-muted-foreground">
            <ZoomIn size={16} />
            <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={e => setZoom(Number(e.target.value))}
              className="w-full accent-emerald-600" aria-label="Zoom" />
          </label>
          <Button onClick={() => void recortar()} leftIcon={<Check size={15} />} className="min-h-[44px]">Usar este recorte</Button>
        </div>
      )}

      {vistaPrevia && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-semibold text-foreground">Vista previa</p>
          <div className="flex items-end gap-4">
            <Avatar url={vistaPrevia.url} nombre={nombre} tamano={112} className="ring-4" />
            <Avatar url={vistaPrevia.url} nombre={nombre} tamano={40} />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => void guardar()} loading={guardando} disabled={guardando} leftIcon={<Check size={15} />} className="min-h-[44px]">
              Guardar foto
            </Button>
            <Button variant="secondary" onClick={() => setVistaPrevia(null)} disabled={guardando} leftIcon={<RotateCcw size={15} />} className="min-h-[44px]">
              Ajustar recorte
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="secondary" onClick={() => camara.current?.click()} disabled={guardando} leftIcon={<Camera size={15} />} className="min-h-[44px]">
          Tomar foto
        </Button>
        <Button variant="secondary" onClick={() => galeria.current?.click()} disabled={guardando} leftIcon={<ImagePlus size={15} />} className="min-h-[44px]">
          {imagen || fotoActual ? 'Reemplazar desde galería' : 'Elegir de la galería'}
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">JPG, PNG o WebP · máximo 5 MB · una foto tuya, de frente y con buena luz.</p>
      {guardando && <p role="status" className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><Loader2 size={13} className="animate-spin" /> Subiendo…</p>}
      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-center text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}
    </div>
  )
}
