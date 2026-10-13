'use client'
// components/offline/PendienteSincronizacion.tsx
// Una confirmación guardada en el teléfono: su estado y, si hay conflicto, qué hacer.
import { useState } from 'react'
import { format } from 'date-fns'
import { AlertTriangle, Camera, CheckCircle2, Clock, CloudOff, Loader2, MessagesSquare, Trash2 } from 'lucide-react'
import { cn, STATUS_LABELS } from '@/lib/utils'
import type { ActivityStatus } from '@/types'
import { resolverConflicto, type ResumenPendiente } from '@/lib/offline/sincronizacion'
import type { TipoConflicto } from '@/lib/offline/almacen'

function textoConflicto(p: ResumenPendiente): string {
  const servidor = p.conflicto?.actividad as Record<string, string | null> | null | undefined
  const tipo = p.conflicto?.tipo as TipoConflicto
  switch (tipo) {
    case 'ya_confirmada':
      return `Esta actividad ya fue confirmada${servidor?.confirmado_nombre ? ` por ${servidor.confirmado_nombre}` : ''}${servidor?.confirmado_en ? ` el ${format(new Date(servidor.confirmado_en), 'dd/MM HH:mm')}` : ''} mientras estabas sin conexión.`
    case 'cancelada':
      return 'La actividad fue cancelada mientras estabas sin conexión.'
    case 'modificada': {
      const cambios: string[] = []
      if (servidor?.date && servidor.date !== p.actividad.fecha) cambios.push(`fecha: ${format(new Date(`${servidor.date}T12:00:00`), 'dd/MM/yyyy')}`)
      if ((servidor?.start_time ?? null)?.slice(0, 5) !== (p.actividad.hora ?? null)?.slice(0, 5)) cambios.push(`hora: ${servidor?.start_time?.slice(0, 5) ?? 'sin hora'}`)
      if (servidor?.title && servidor.title !== p.actividad.titulo) cambios.push(`título: «${servidor.title}»`)
      return `El administrador modificó la actividad mientras estabas sin conexión${cambios.length ? ` (${cambios.join(', ')})` : ''}. Revisa que tu confirmación siga siendo válida.`
    }
    case 'estado_cambiado':
      return `La actividad cambió a «${STATUS_LABELS[(servidor?.status ?? 'programado') as ActivityStatus] ?? servidor?.status}» mientras estabas sin conexión.`
    case 'no_disponible':
      return 'La actividad ya no está disponible (fue eliminada o retirada del calendario).'
    default:
      return 'La actividad cambió en el servidor.'
  }
}

export default function PendienteSincronizacion({ pendiente: p, compacto }: { pendiente: ResumenPendiente; compacto?: boolean }) {
  const [trabajando, setTrabajando] = useState(false)
  const [confirmarDescarte, setConfirmarDescarte] = useState(false)

  async function accion(tipo: 'confirmar_igual' | 'enviar_al_chat' | 'descartar') {
    setTrabajando(true)
    try { await resolverConflicto(p.id, tipo) } finally { setTrabajando(false); setConfirmarDescarte(false) }
  }

  const esConflicto = p.estado === 'conflicto'
  const esError = p.estado === 'error'
  const tipoConflicto = p.conflicto?.tipo

  return (
    <div className={cn('rounded-xl border p-3 text-sm',
      esConflicto || esError ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30' : 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30')}>
      {!compacto && (
        <div className="mb-1.5">
          <p className="font-semibold text-foreground">{p.actividad.titulo}</p>
          <p className="text-xs text-muted-foreground">
            {p.actividad.hotel ?? '—'} · {format(new Date(`${p.actividad.fecha}T12:00:00`), 'dd/MM/yyyy')}
          </p>
        </div>
      )}
      <p className={cn('flex items-start gap-1.5 text-xs font-semibold',
        esConflicto || esError ? 'text-red-800 dark:text-red-300' : 'text-amber-900 dark:text-amber-200')}>
        {esConflicto ? <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          : esError ? <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          : <CloudOff size={14} className="mt-0.5 shrink-0" />}
        {esConflicto ? 'Conflicto: no se confirmó'
          : esError ? 'Error al sincronizar'
          : p.modo === 'solo_chat' ? 'Pendiente de enviar al chat' : 'Pendiente de sincronización'}
      </p>
      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5"><Clock size={12} /> Guardada el {format(new Date(p.creadaEn), 'dd/MM HH:mm')}</li>
        {p.cantidadFotos > 0 && (
          <li className="flex items-center gap-1.5"><Camera size={12} /> {p.cantidadFotos} foto{p.cantidadFotos !== 1 ? 's' : ''} guardada{p.cantidadFotos !== 1 ? 's' : ''} en el teléfono{p.fotosSubidas > 0 ? ` (${p.fotosSubidas} ya subida${p.fotosSubidas !== 1 ? 's' : ''})` : ''}</li>
        )}
        {p.confirmadaEnServidor && <li className="flex items-center gap-1.5"><CheckCircle2 size={12} /> Confirmación recibida; falta publicar las fotos</li>}
        {p.nota && <li className="italic">«{p.nota}»</li>}
        {p.ultimoError && !esConflicto && <li className="text-red-700 dark:text-red-300">{p.ultimoError}{p.intentos > 0 ? ` (intento ${p.intentos})` : ''}</li>}
      </ul>

      {esConflicto && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-red-900 dark:text-red-200">{textoConflicto(p)}</p>
          {confirmarDescarte ? (
            <div className="space-y-2 rounded-lg border border-red-300 bg-card p-2 dark:border-red-900">
              <p className="text-xs font-semibold text-foreground">
                ¿Descartar? Se borrarán del teléfono la confirmación{p.cantidadFotos ? ` y ${p.cantidadFotos} foto${p.cantidadFotos !== 1 ? 's' : ''}` : ''}. No se puede deshacer.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={trabajando} onClick={() => void accion('descartar')}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                  {trabajando ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Sí, descartar
                </button>
                <button type="button" disabled={trabajando} onClick={() => setConfirmarDescarte(false)}
                  className="inline-flex min-h-[40px] items-center rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-muted">
                  Conservar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tipoConflicto === 'modificada' && (
                <button type="button" disabled={trabajando} onClick={() => void accion('confirmar_igual')}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                  {trabajando ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Confirmar de todos modos
                </button>
              )}
              {tipoConflicto !== 'no_disponible' && (p.cantidadFotos > 0 || p.nota) && (
                <button type="button" disabled={trabajando} onClick={() => void accion('enviar_al_chat')}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-muted disabled:opacity-60">
                  <MessagesSquare size={13} /> Enviar fotos y nota al chat
                </button>
              )}
              <button type="button" disabled={trabajando} onClick={() => setConfirmarDescarte(true)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60 dark:text-red-300 dark:hover:bg-red-950">
                <Trash2 size={13} /> Descartar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
