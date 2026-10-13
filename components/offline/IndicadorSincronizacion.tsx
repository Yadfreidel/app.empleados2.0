'use client'
// components/offline/IndicadorSincronizacion.tsx
// Estado de la sincronización en la cabecera y panel con los registros pendientes.
import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { AlertTriangle, CheckCircle2, CloudOff, CloudUpload, Loader2, LogIn, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import Modal from '@/components/ui/Modal'
import { sincronizarAhora, useSincronizacion, type EstadoSincronizacion } from '@/lib/offline/sincronizacion'
import PendienteSincronizacion from './PendienteSincronizacion'

const ESTILOS: Record<EstadoSincronizacion, { texto: string; clase: string; icono: typeof CloudOff }> = {
  sin_conexion: { texto: 'Sin conexión', clase: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200', icono: CloudOff },
  sincronizando: { texto: 'Sincronizando…', clase: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200', icono: Loader2 },
  pendiente: { texto: 'Pendiente de sincronización', clase: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200', icono: CloudUpload },
  error: { texto: 'Error', clase: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200', icono: AlertTriangle },
  sesion_expirada: { texto: 'Error: inicia sesión', clase: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200', icono: LogIn },
  sincronizado: { texto: 'Sincronizado', clase: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200', icono: CheckCircle2 },
}

export default function IndicadorSincronizacion() {
  const s = useSincronizacion()
  const [abierto, setAbierto] = useState(false)
  // Sin cuenta en este equipo solo interesa saber si hay conexión.
  if (!s.usuario && s.general !== 'sin_conexion') return null

  const estilo = ESTILOS[s.general]
  const Icono = estilo.icono
  const n = s.pendientes.length
  const conflictos = s.pendientes.filter(p => p.estado === 'conflicto').length
  const etiqueta = `${estilo.texto}${n ? ` · ${n} pendiente${n !== 1 ? 's' : ''}` : ''}`

  return (
    <>
      <button
        type="button"
        id="btn-estado-sincronizacion"
        onClick={() => setAbierto(true)}
        aria-label={`Estado de sincronización: ${etiqueta}`}
        title={etiqueta}
        className={cn('inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition-colors', estilo.clase)}
      >
        <Icono size={16} className={s.general === 'sincronizando' ? 'animate-spin' : ''} />
        <span className="hidden sm:inline">{estilo.texto}</span>
        {n > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-current/15 px-1 text-[11px] font-bold" data-testid="contador-pendientes">
            {n}
          </span>
        )}
      </button>

      <Modal open={abierto} onClose={() => setAbierto(false)} title="Sincronización" maxWidth="lg">
        <div className="space-y-4">
          <div className={cn('flex items-start gap-3 rounded-xl border p-3', estilo.clase)}>
            <Icono size={20} className={cn('mt-0.5 shrink-0', s.general === 'sincronizando' && 'animate-spin')} />
            <div className="min-w-0 text-sm">
              <p className="font-bold" data-testid="estado-sincronizacion">{estilo.texto}</p>
              <p className="mt-0.5 text-xs opacity-90">
                {s.general === 'sin_conexion' && (n
                  ? `${n} registro${n !== 1 ? 's' : ''} guardado${n !== 1 ? 's' : ''} en el teléfono. Se enviarán solos al recuperar la conexión.`
                  : 'Puedes consultar el calendario guardado y confirmar actividades; se enviarán al recuperar la conexión.')}
                {s.general === 'pendiente' && `${n} registro${n !== 1 ? 's' : ''} esperando para enviarse al servidor.`}
                {s.general === 'error' && (conflictos
                  ? `${conflictos} confirmación${conflictos !== 1 ? 'es' : ''} con conflicto: revisa qué hacer con cada una.`
                  : 'Algunos registros no se pudieron enviar. Se reintentará automáticamente.')}
                {s.general === 'sesion_expirada' && `Tu sesión expiró. Tus ${n} registro${n !== 1 ? 's' : ''} siguen guardados en el teléfono; inicia sesión para enviarlos.`}
                {s.general === 'sincronizado' && 'Todo lo confirmado en este teléfono está guardado en el servidor.'}
                {s.general === 'sincronizando' && 'Enviando registros al servidor…'}
              </p>
              {s.ultimaSincronizacion && (
                <p className="mt-1 text-[11px] opacity-75">Última sincronización: {format(new Date(s.ultimaSincronizacion), 'dd/MM/yyyy HH:mm')}</p>
              )}
            </div>
          </div>

          {s.aviso && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {s.aviso}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {s.general === 'sesion_expirada' ? (
              <Link href="/login?volver=/" className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700">
                <LogIn size={16} /> Iniciar sesión
              </Link>
            ) : (
              <button
                type="button"
                id="btn-sincronizar-ahora"
                onClick={() => void sincronizarAhora({ forzar: true })}
                disabled={s.sincronizando || !s.enLinea || !s.usuario}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {s.sincronizando ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                Sincronizar ahora
              </button>
            )}
            {!s.enLinea && <p className="self-center text-xs text-muted-foreground">Necesitas conexión para sincronizar.</p>}
          </div>

          {n > 0 && (
            <section aria-label="Registros guardados en el teléfono" className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Guardado en este teléfono</h3>
              {s.pendientes.map(p => <PendienteSincronizacion key={p.id} pendiente={p} />)}
            </section>
          )}
        </div>
      </Modal>
    </>
  )
}
