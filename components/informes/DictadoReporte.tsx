'use client'
// components/informes/DictadoReporte.tsx
// "Dictar reporte": graba audio en el teléfono, permite escucharlo, borrarlo y
// volver a grabar, y lo envía al servidor para transcribirlo y extraer los
// campos. Nunca cierra el servicio: solo propone campos para que el técnico
// los revise. Si el micrófono falla, el técnico escribe el reporte a mano.
import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, Mic, RotateCcw, Sparkles, Square, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CamposDictado {
  area: string
  hallazgos: string
  trabajo_realizado: string
  productos: string
  recomendaciones: string
  pendientes: string
}

const MAX_SEGUNDOS = 180
const TIPOS_PREFERIDOS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg']
const ETIQUETAS: { id: keyof CamposDictado; titulo: string }[] = [
  { id: 'area', titulo: 'Área' },
  { id: 'hallazgos', titulo: 'Hallazgos' },
  { id: 'trabajo_realizado', titulo: 'Trabajo realizado' },
  { id: 'productos', titulo: 'Productos mencionados' },
  { id: 'recomendaciones', titulo: 'Recomendaciones' },
  { id: 'pendientes', titulo: 'Pendientes' },
]

type Estado = 'inicial' | 'pidiendo' | 'grabando' | 'grabado' | 'enviando' | 'listo'

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function mensajeMicrofono(error: unknown) {
  const nombre = (error as DOMException | null)?.name
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError') {
    return 'No hay permiso para usar el micrófono. Actívalo en la configuración del navegador o escribe el reporte abajo.'
  }
  if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') return 'No se encontró un micrófono en este equipo. Escribe el reporte abajo.'
  if (nombre === 'NotReadableError') return 'El micrófono está en uso por otra aplicación. Ciérrala e inténtalo de nuevo, o escribe el reporte.'
  return 'No se pudo iniciar la grabación. Escribe el reporte abajo.'
}

export default function DictadoReporte({ actividadId, disabled, onAplicar }: {
  actividadId: string
  disabled?: boolean
  onAplicar: (campos: CamposDictado, dictadoId: string) => void
}) {
  const [estado, setEstado] = useState<Estado>('inicial')
  const [segundos, setSegundos] = useState(0)
  const [audio, setAudio] = useState<{ blob: Blob; url: string; duracion: number; id: string } | null>(null)
  const [resultado, setResultado] = useState<{ transcripcion: string; campos: CamposDictado; extraido: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aplicado, setAplicado] = useState(false)
  const grabador = useRef<MediaRecorder | null>(null)
  const flujo = useRef<MediaStream | null>(null)
  const trozos = useRef<Blob[]>([])
  const inicio = useRef(0)
  const reloj = useRef<number | undefined>(undefined)
  const urlActual = useRef<string | null>(null)

  const soportado = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

  function soltarMicrofono() {
    window.clearInterval(reloj.current)
    flujo.current?.getTracks().forEach(t => t.stop())
    flujo.current = null
  }

  useEffect(() => () => {
    soltarMicrofono()
    if (grabador.current?.state === 'recording') grabador.current.stop()
    if (urlActual.current) URL.revokeObjectURL(urlActual.current)
  }, [])

  function descartar() {
    if (urlActual.current) URL.revokeObjectURL(urlActual.current)
    urlActual.current = null
    setAudio(null)
    setResultado(null)
    setAplicado(false)
    setSegundos(0)
    setError(null)
    setEstado('inicial')
  }

  async function grabar() {
    descartar()
    if (!soportado) {
      setError(window.isSecureContext
        ? 'Este navegador no permite grabar audio. Escribe el reporte abajo.'
        : 'Para grabar, abre la app con https (la dirección publicada). Mientras tanto, escribe el reporte abajo.')
      return
    }
    setEstado('pidiendo')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      flujo.current = stream
      const tipo = TIPOS_PREFERIDOS.find(t => MediaRecorder.isTypeSupported(t))
      // 32 kbps: 3 minutos ≈ 0,7 MB, suficiente para voz y liviano con datos móviles.
      const rec = new MediaRecorder(stream, { ...(tipo ? { mimeType: tipo } : {}), audioBitsPerSecond: 32_000 })
      trozos.current = []
      rec.ondataavailable = e => { if (e.data.size > 0) trozos.current.push(e.data) }
      rec.onstop = () => {
        soltarMicrofono()
        const duracion = (Date.now() - inicio.current) / 1000
        const blob = new Blob(trozos.current, { type: rec.mimeType || tipo || 'audio/webm' })
        if (blob.size < 1024 || duracion < 1) {
          setError('La grabación quedó vacía o muy corta. Vuelve a grabar.')
          setEstado('inicial')
          return
        }
        const url = URL.createObjectURL(blob)
        urlActual.current = url
        // Un id por grabación: si se reenvía, el servidor no la transcribe dos veces.
        setAudio({ blob, url, duracion, id: crypto.randomUUID() })
        setEstado('grabado')
      }
      grabador.current = rec
      rec.start(1000)
      inicio.current = Date.now()
      setSegundos(0)
      setEstado('grabando')
      reloj.current = window.setInterval(() => {
        const s = (Date.now() - inicio.current) / 1000
        setSegundos(s)
        if (s >= MAX_SEGUNDOS) detener()
      }, 250)
    } catch (e) {
      soltarMicrofono()
      setError(mensajeMicrofono(e))
      setEstado('inicial')
    }
  }

  function detener() {
    window.clearInterval(reloj.current)
    if (grabador.current?.state === 'recording') grabador.current.stop()
  }

  async function transcribir() {
    if (!audio) return
    if (!navigator.onLine) {
      setError('Sin conexión: no se puede transcribir ahora. Escribe el reporte abajo o espera a tener señal.')
      return
    }
    setEstado('enviando')
    setError(null)
    const form = new FormData()
    form.append('audio', audio.blob, 'dictado')
    form.append('dictado_id', audio.id)
    form.append('actividad_id', actividadId)
    form.append('duracion', String(Math.round(audio.duracion * 10) / 10))
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api/dictado`, { method: 'POST', body: form, credentials: 'same-origin' })
      const cuerpo = await r.json().catch(() => null) as { ok?: boolean; error?: string; transcripcion?: string; campos?: CamposDictado; extraido?: boolean } | null
      if (!r.ok || !cuerpo?.ok || !cuerpo.campos) {
        setError(cuerpo?.error ?? (r.status === 404 ? 'El dictado no está disponible en esta versión de la app.' : 'No se pudo transcribir el audio. Inténtalo de nuevo o escribe el reporte.'))
        setEstado('grabado')
        return
      }
      setResultado({ transcripcion: cuerpo.transcripcion ?? '', campos: cuerpo.campos, extraido: cuerpo.extraido !== false })
      setEstado('listo')
    } catch {
      setError('No se pudo conectar con el servidor. Inténtalo de nuevo o escribe el reporte.')
      setEstado('grabado')
    }
  }

  const mencionados = resultado ? ETIQUETAS.filter(e => resultado.campos[e.id]) : []
  const ocupado = disabled || estado === 'pidiendo' || estado === 'enviando'

  return (
    <section aria-label="Dictar reporte" className="rounded-xl border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Mic size={15} className="text-muted-foreground" /> Dictar reporte <span className="font-normal text-muted-foreground">(opcional)</span>
        </p>
        {estado === 'grabando' && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-red-600" role="status">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" /> {mmss(segundos)} / {mmss(MAX_SEGUNDOS)}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Di el área, qué encontraste, qué hiciste, productos, recomendaciones y pendientes. Revisarás los datos antes de guardar.
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {(estado === 'inicial' || estado === 'pidiendo') && (
          <button type="button" onClick={() => void grabar()} disabled={ocupado}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
            {estado === 'pidiendo' ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />} Grabar
          </button>
        )}
        {estado === 'grabando' && (
          <button type="button" onClick={detener}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-foreground px-4 text-sm font-semibold text-background">
            <Square size={14} /> Detener
          </button>
        )}
        {audio && estado !== 'grabando' && (
          <>
            {estado !== 'listo' && (
              <button type="button" onClick={() => void transcribir()} disabled={ocupado}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                {estado === 'enviando' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {estado === 'enviando' ? 'Transcribiendo…' : 'Transcribir'}
              </button>
            )}
            <button type="button" onClick={() => void grabar()} disabled={ocupado}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-60">
              <RotateCcw size={15} /> Volver a grabar
            </button>
            <button type="button" onClick={descartar} disabled={ocupado} aria-label="Eliminar grabación"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:text-red-300 dark:hover:bg-red-950">
              <Trash2 size={15} /> Eliminar
            </button>
          </>
        )}
      </div>

      {audio && estado !== 'grabando' && (
        <audio controls src={audio.url} className="mt-2 w-full" />
      )}

      {error && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {resultado && (
        <div className="mt-3 space-y-2 rounded-lg bg-muted/50 p-3 text-xs">
          <p className="font-semibold text-foreground">Transcripción</p>
          <p className="whitespace-pre-wrap italic text-muted-foreground">«{resultado.transcripcion}»</p>
          {mencionados.length > 0 ? (
            <dl className="space-y-1">
              {mencionados.map(e => (
                <div key={e.id}>
                  <dt className="font-semibold text-foreground">{e.titulo}</dt>
                  <dd className="whitespace-pre-wrap text-foreground/80">{resultado.campos[e.id]}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-muted-foreground">
              {resultado.extraido ? 'No se identificaron datos del reporte en el audio.' : 'No se pudieron separar los datos automáticamente.'} Escribe los campos abajo.
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {mencionados.length > 0 && (
              <button type="button" disabled={disabled} onClick={() => { onAplicar(resultado.campos, audio!.id); setAplicado(true) }}
                className={cn('inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 font-semibold disabled:opacity-60',
                  aplicado ? 'border border-emerald-500 text-emerald-800 dark:text-emerald-300' : 'bg-emerald-600 text-white hover:bg-emerald-700')}>
                <CheckCircle2 size={14} /> {aplicado ? 'Datos pasados al reporte' : 'Usar en el reporte'}
              </button>
            )}
            {!resultado.extraido && resultado.transcripcion && (
              <button type="button" disabled={disabled}
                onClick={() => { onAplicar({ area: '', hallazgos: resultado.transcripcion, trabajo_realizado: '', productos: '', recomendaciones: '', pendientes: '' }, audio!.id); setAplicado(true) }}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-border px-3 font-semibold hover:bg-muted disabled:opacity-60">
                Copiar texto a hallazgos
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
