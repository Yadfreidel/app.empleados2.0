'use client'
// components/chat/ChatActividad.tsx
// Chat de una actividad: texto, fotos (cámara o galería) y PDFs.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { format, isToday, isYesterday } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  AlertCircle, FileText, Loader2, LogIn, MessagesSquare, RefreshCw, SendHorizontal, ShieldCheck, X,
} from 'lucide-react'
import type { ActividadMensaje } from '@/types'
import { cn } from '@/lib/utils'
import { esImagen, formatearTamano } from '@/lib/chat/adjuntos'
import { useChatActividad } from '@/lib/chat/useChatActividad'
import { useArchivosPendientes } from '@/lib/chat/useArchivosPendientes'
import { BotonesAdjuntar, MiniaturasPendientes } from './SelectorFotos'

const MAX_ARCHIVOS = 6

function etiquetaDia(fecha: Date) {
  if (isToday(fecha)) return 'Hoy'
  if (isYesterday(fecha)) return 'Ayer'
  return format(fecha, "d 'de' MMMM", { locale: es })
}

function etiquetaRol(rol: ActividadMensaje['autor_rol']) {
  return rol === 'admin' ? 'Administración' : 'Supervisor'
}

interface ChatActividadProps {
  actividadId: string
  abierto: boolean
  /** Clases de alto del contenedor; por defecto, tamaño para modal. */
  alto?: string
}

// Al cambiar de actividad, montar con key={actividadId} para no mezclar mensajes.
export default function ChatActividad({ actividadId, abierto, alto = 'h-[min(62dvh,560px)] min-h-[340px]' }: ChatActividadProps) {
  const { mensajes, urls, usuario, estado, enviando, error, setError, enviar, recargar } = useChatActividad(actividadId, abierto)
  const [texto, setTexto] = useState('')
  const [ampliada, setAmpliada] = useState<string | null>(null)
  const lista = useRef<HTMLDivElement>(null)
  const { pendientes, archivos, agregar, quitar, limpiar } = useArchivosPendientes(MAX_ARCHIVOS, setError)

  // Mantener visible el último mensaje.
  useEffect(() => {
    const el = lista.current
    if (el) el.scrollTop = el.scrollHeight
  }, [mensajes.length, estado])

  async function handleEnviar(e?: FormEvent) {
    e?.preventDefault()
    if (enviando) return
    if (await enviar(texto, archivos)) {
      limpiar()
      setTexto('')
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void handleEnviar()
    }
  }

  if (estado === 'sin_sesion') {
    return (
      <AvisoChat icon={LogIn} titulo="Inicia sesión para usar el chat">
        El chat de la actividad es solo para supervisores y administración.
        <Link href="/login" className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700">
          Iniciar sesión
        </Link>
      </AvisoChat>
    )
  }
  if (estado === 'no_disponible') {
    return (
      <AvisoChat icon={MessagesSquare} titulo="El chat aún no está habilitado">
        El administrador debe ejecutar la migración <code className="font-mono text-xs">006_chat_actividades.sql</code> en Supabase.
      </AvisoChat>
    )
  }
  if (estado === 'error') {
    return (
      <AvisoChat icon={AlertCircle} titulo="No se pudo cargar el chat">
        Revisa tu conexión.
        <button type="button" onClick={() => void recargar()} className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted">
          <RefreshCw size={15} /> Reintentar
        </button>
      </AvisoChat>
    )
  }

  let diaAnterior = ''

  return (
    <div className={cn('flex flex-col overflow-hidden rounded-xl border border-border bg-muted/30', alto)}>
      {/* Mensajes */}
      <div ref={lista} className="flex-1 space-y-2 overflow-y-auto overscroll-contain p-3" aria-live="polite" aria-label="Mensajes de la actividad">
        {estado === 'cargando' ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 size={18} className="mr-2 animate-spin" /> Cargando mensajes…
          </div>
        ) : mensajes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sm text-muted-foreground">
            <MessagesSquare size={28} className="mb-2 opacity-60" />
            <p className="font-semibold text-foreground">Sin mensajes todavía</p>
            <p className="mt-1 text-xs">Comparte avances, incidencias o fotos del servicio con el equipo.</p>
          </div>
        ) : (
          mensajes.map(m => {
            const fecha = new Date(m.created_at)
            const dia = etiquetaDia(fecha)
            const mostrarDia = dia !== diaAnterior
            diaAnterior = dia
            const propio = m.autor_id === usuario?.id
            const url = m.adjunto_path ? urls[m.adjunto_path] : undefined
            return (
              <div key={m.id}>
                {mostrarDia && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-full bg-card px-3 py-1 text-[11px] font-semibold text-muted-foreground shadow-2xs">{dia}</span>
                  </div>
                )}
                <div className={cn('flex', propio ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-2xs',
                      propio
                        ? 'rounded-br-md bg-emerald-600 text-white'
                        : 'rounded-bl-md border border-border bg-card text-foreground',
                    )}
                  >
                    {!propio && (
                      <p className="mb-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                        {m.autor_nombre || 'Usuario'}
                        <span className="font-medium text-muted-foreground">· {etiquetaRol(m.autor_rol)}</span>
                      </p>
                    )}
                    {m.es_evidencia && (
                      <p className={cn('mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                        propio ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300')}>
                        <ShieldCheck size={11} /> Evidencia
                      </p>
                    )}
                    {m.adjunto_path && esImagen(m.adjunto_tipo) && (
                      url ? (
                        <button type="button" onClick={() => setAmpliada(url)} className="mb-1 block overflow-hidden rounded-lg" aria-label={`Ver foto ${m.adjunto_nombre ?? ''}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage */}
                          <img src={url} alt={m.adjunto_nombre ?? 'Foto'} loading="lazy" className="max-h-60 w-full max-w-[240px] object-cover" />
                        </button>
                      ) : (
                        <div className="mb-1 flex h-32 w-[200px] items-center justify-center rounded-lg bg-black/10">
                          <Loader2 size={18} className="animate-spin opacity-70" />
                        </div>
                      )
                    )}
                    {m.adjunto_path && !esImagen(m.adjunto_tipo) && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn('mb-1 flex min-h-[44px] items-center gap-2 rounded-lg px-2 py-1.5',
                          propio ? 'bg-white/15' : 'bg-muted')}
                      >
                        <FileText size={18} className="shrink-0" />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold">{m.adjunto_nombre || 'Documento'}</span>
                          <span className="block text-[10px] opacity-80">{formatearTamano(m.adjunto_tamano)}</span>
                        </span>
                      </a>
                    )}
                    {m.contenido && <p className="whitespace-pre-wrap break-words leading-relaxed">{m.contenido}</p>}
                    <p className={cn('mt-0.5 text-right text-[10px]', propio ? 'text-white/75' : 'text-muted-foreground')}>
                      {format(fecha, 'HH:mm')}
                    </p>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Redacción */}
      <form onSubmit={handleEnviar} className="border-t border-border bg-card p-2">
        {error && (
          <p role="alert" className="mb-2 flex items-start gap-2 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Cerrar aviso"><X size={14} /></button>
          </p>
        )}
        <div className="mb-2 empty:hidden">
          <MiniaturasPendientes pendientes={pendientes} onQuitar={quitar} disabled={enviando} />
        </div>
        <div className="flex items-end gap-1.5">
          <BotonesAdjuntar onArchivos={agregar} disabled={enviando || estado !== 'listo'} />
          <label htmlFor={`chat-texto-${actividadId}`} className="sr-only">Mensaje</label>
          <textarea
            id={`chat-texto-${actividadId}`}
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            maxLength={2000}
            placeholder="Escribe un mensaje…"
            disabled={enviando || estado !== 'listo'}
            className="fm-input max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl py-2.5 text-sm"
          />
          <button
            type="submit"
            disabled={enviando || estado !== 'listo' || (!texto.trim() && pendientes.length === 0)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
            aria-label="Enviar mensaje"
          >
            {enviando ? <Loader2 size={18} className="animate-spin" /> : <SendHorizontal size={18} />}
          </button>
        </div>
      </form>

      {ampliada && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label="Foto ampliada"
          onClick={() => setAmpliada(null)}>
          <button type="button" onClick={() => setAmpliada(null)} className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white" aria-label="Cerrar foto"
            style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}>
            <X size={22} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage */}
          <img src={ampliada} alt="Foto ampliada" className="max-h-full max-w-full rounded-lg object-contain" onClick={e => e.stopPropagation()} />
        </div>,
        document.body,
      )}
    </div>
  )
}

function AvisoChat({ icon: Icon, titulo, children }: { icon: typeof MessagesSquare; titulo: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 py-8 text-center">
      <Icon size={28} className="mb-2 text-muted-foreground" />
      <p className="font-semibold text-foreground">{titulo}</p>
      <div className="mt-1 flex flex-col items-center text-sm text-muted-foreground">{children}</div>
    </div>
  )
}
