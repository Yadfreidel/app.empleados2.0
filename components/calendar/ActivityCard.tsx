'use client'
// components/calendar/ActivityCard.tsx
import { startTransition, useState } from 'react'
import { Clock, Building2, Tag, CheckCircle2, AlertCircle, User, MessageSquare } from 'lucide-react'
import { format } from 'date-fns'
import type { Activity } from '@/types'
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { formatTime, truncate, getContrastText } from '@/lib/utils'
import { confirmarActividad } from '@/lib/actividades/confirmar'

interface ActivityCardProps {
  activity: Activity
  compact?: boolean
  onActivityUpdated?: (activity: Activity) => void
}

export default function ActivityCard({ activity: initialActivity, compact, onActivityUpdated }: ActivityCardProps) {
  const [activity, setActivity] = useState<Activity>(initialActivity)
  const [showModal, setShowModal] = useState(false)
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState(false)

  const typeColor = activity.color_override || activity.operation_type?.color || '#16a34a'
  const textOnColor = getContrastText(typeColor)

  const esPendiente = activity.status === 'programado'
  const esRealizada = activity.status === 'completado' || (activity.status as string) === 'realizado'

  async function handleConfirmar() {
    if (guardando || exito) return
    setGuardando(true)
    setError(null)
    try {
      const res = await confirmarActividad({
        activityId: activity.id,
        nota: nota.trim() || undefined,
      })

      if (!res.ok) {
        setError(res.error || 'No se pudo confirmar la realización.')
        setGuardando(false)
        return
      }

      setActivity(res.activity)
      onActivityUpdated?.(res.activity)
      setExito(true)
      setTimeout(() => {
        setShowModal(false)
        setExito(false)
      }, 1200)
    } catch (err) {
      console.error(err)
      setError('Ocurrió un error inesperado al confirmar la actividad.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <article
        className="fm-card fm-card-hover overflow-hidden rounded-xl border border-border bg-card shadow-xs transition-all"
        style={{ borderLeftWidth: 4, borderLeftColor: typeColor }}
      >
        <div className="p-3.5 sm:p-4">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2 mb-2.5 flex-wrap">
            {/* Operation type pill */}
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 shadow-2xs"
              style={{ background: typeColor, color: textOnColor }}
            >
              <Tag size={11} />
              <span>{activity.operation_type?.name || 'Operación'}</span>
            </span>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <StatusBadge status={activity.status} />
              <PriorityBadge priority={activity.priority} />
            </div>
          </div>

          {/* Title */}
          <h3 className="text-sm font-bold text-foreground mb-1 leading-snug">
            {activity.title}
          </h3>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mb-2">
            {/* Hotel */}
            <span className="flex items-center gap-1">
              <Building2 size={13} className="text-muted-foreground/80" />
              <span className="font-medium text-foreground/80">{activity.hotel?.name || '—'}</span>
            </span>
            {/* Time */}
            {activity.start_time && (
              <span className="flex items-center gap-1">
                <Clock size={13} className="text-muted-foreground/80" />
                <span>
                  {formatTime(activity.start_time)}
                  {activity.end_time && ` – ${formatTime(activity.end_time)}`}
                </span>
              </span>
            )}
          </div>

          {/* Description (truncated) */}
          {!compact && activity.description && (
            <p className="text-xs text-muted-foreground leading-relaxed mb-2">
              {truncate(activity.description, 120)}
            </p>
          )}

          {/* Notes preview */}
          {!compact && activity.notes && (
            <p className="text-xs text-muted-foreground/75 italic leading-relaxed">
              {truncate(activity.notes, 80)}
            </p>
          )}

          {/* Botón de Confirmación para Empleados si está pendiente */}
          {!compact && esPendiente && (
            <div className="mt-3 pt-2.5 border-t border-border/60">
              <button
                type="button"
                id={`btn-confirmar-${activity.id}`}
                onClick={() => {
                  setError(null)
                  setShowModal(true)
                }}
                className="flex min-h-[44px] w-full shrink-0 touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle2 size={15} />
                <span>Confirmar realización</span>
              </button>
            </div>
          )}

          {/* Estado de confirmación si ya fue realizada */}
          {!compact && esRealizada && (
            <div className="mt-3 pt-2.5 border-t border-emerald-500/20">
              <div className="flex items-start gap-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200">
                <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                    Actividad realizada
                  </p>
                  {activity.confirmado_nombre && (
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400/90 mt-0.5">
                      Confirmada por <span className="font-medium">{activity.confirmado_nombre}</span>
                      {activity.confirmado_en && ` el ${format(new Date(activity.confirmado_en), 'dd/MM/yyyy HH:mm')}`}
                    </p>
                  )}
                  {activity.confirmacion_nota && (
                    <p className="text-[11px] italic text-muted-foreground mt-0.5">
                      &quot;{activity.confirmacion_nota}&quot;
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </article>

      {/* Modal de confirmación para el empleado */}
      <Modal
        open={showModal}
        onClose={() => !guardando && setShowModal(false)}
        title="Confirmar actividad realizada"
        maxWidth="lg"
        footer={
          <div className="w-full space-y-3">
            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                <AlertCircle size={18} className="shrink-0" />{error}
              </p>
            )}
            {exito && <p role="status" className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">¡Actividad confirmada correctamente!</p>}
            <div className="flex w-full flex-col gap-2 sm:flex-row-reverse">
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => startTransition(handleConfirmar)}
              loading={guardando}
              disabled={guardando || exito}
              className="w-full bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 sm:min-w-44 sm:w-auto"
            >
              <CheckCircle2 size={14} />
              {guardando ? 'Guardando...' : exito ? 'Actividad confirmada' : 'Confirmar actividad'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setShowModal(false)}
              disabled={guardando || exito}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm leading-relaxed text-emerald-900 dark:text-emerald-200">
              Confirma que el trabajo se completó. Se notificará al administrador.
            </p>
          </div>
          <section aria-label="Resumen del servicio" className="rounded-2xl border border-border bg-muted/40 p-4 sm:p-5">
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Servicio a confirmar</h3>
            <p className="mb-4 break-words text-xl font-bold text-foreground">{activity.title}</p>
            <div className="space-y-3 text-sm text-foreground">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <span className="shrink-0 text-muted-foreground">Hotel:</span>
                <span className="min-w-0 break-words text-right font-medium">{activity.hotel?.name || '—'}</span>
              </div>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <span className="shrink-0 text-muted-foreground">Fecha programada:</span>
                <span className="min-w-0 break-words text-right">{format(new Date(`${activity.date}T12:00:00`), 'dd/MM/yyyy')}</span>
              </div>
              {activity.operation_type?.name && (
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <span className="shrink-0 text-muted-foreground">Operación:</span>
                  <span className="min-w-0 break-words text-right">{activity.operation_type.name}</span>
                </div>
              )}
            </div>
          </section>
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 block text-sm font-semibold text-foreground">
                <span className="flex items-center gap-1.5">
                  <User size={14} className="text-muted-foreground" />
                  Identificación del empleado
                </span>
              </p>
              <p className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                La confirmación se registrará con el nombre de tu cuenta. Necesitas iniciar sesión para notificar al administrador.
              </p>
            </div>

            <div>
              <label htmlFor={`nota-confirmacion-${activity.id}`} className="mb-1.5 block text-sm font-semibold text-foreground">
                <span className="flex items-center gap-1.5">
                  <MessageSquare size={14} className="text-muted-foreground" />
                  Observaciones <span className="font-normal text-muted-foreground">(opcional)</span>
                </span>
              </label>
              <textarea
                id={`nota-confirmacion-${activity.id}`}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Añade detalles relevantes del servicio..."
                className="fm-input w-full resize-y text-sm"
                disabled={guardando || exito}
              />
              <p className="mt-1 text-right text-xs text-muted-foreground">{nota.length}/500 caracteres</p>
            </div>
          </div>

        </div>
      </Modal>
    </>
  )
}
