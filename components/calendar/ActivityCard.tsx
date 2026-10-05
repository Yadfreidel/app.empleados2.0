'use client'
// components/calendar/ActivityCard.tsx
import { useState } from 'react'
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
  const [nombre, setNombre] = useState('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState(false)

  const typeColor = activity.color_override || activity.operation_type?.color || '#16a34a'
  const textOnColor = getContrastText(typeColor)

  const esPendiente = activity.status === 'programado'
  const esRealizada = activity.status === 'completado' || (activity.status as string) === 'realizado'

  async function handleConfirmar() {
    setGuardando(true)
    setError(null)
    try {
      const res = await confirmarActividad({
        activityId: activity.id,
        nombre: nombre.trim() || undefined,
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
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors cursor-pointer"
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
        title="Confirmar Realización de Actividad"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground -mt-2">
            Registra que este trabajo fue completado. Se notificará de inmediato al administrador.
          </p>
          {/* Resumen del trabajo */}
          <div className="rounded-lg bg-muted/60 p-3.5 space-y-1.5 text-xs text-foreground border border-border/60">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Actividad:</span>
              <span className="font-semibold text-foreground">{activity.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Hotel:</span>
              <span className="font-medium">{activity.hotel?.name || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fecha programada:</span>
              <span>{activity.date}</span>
            </div>
            {activity.operation_type?.name && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Operación:</span>
                <span>{activity.operation_type.name}</span>
              </div>
            )}
          </div>

          {/* Formulario */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                <span className="flex items-center gap-1.5">
                  <User size={13} className="text-muted-foreground" />
                  Nombre del Técnico / Empleado
                </span>
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Carlos Martínez (o deja vacío si estás autenticado)"
                className="fm-input w-full text-xs"
                disabled={guardando || exito}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Si ya tienes sesión iniciada, se tomará automáticamente tu perfil.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                <span className="flex items-center gap-1.5">
                  <MessageSquare size={13} className="text-muted-foreground" />
                  Observaciones / Notas del trabajo (opcional)
                </span>
              </label>
              <textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                rows={3}
                placeholder="Indica detalles relevantes del servicio realizado..."
                className="fm-input w-full text-xs resize-none"
                disabled={guardando || exito}
              />
            </div>
          </div>

          {/* Alertas */}
          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              <AlertCircle size={15} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {exito && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 size={15} className="flex-shrink-0" />
              <span>¡Actividad confirmada! Se notificó al administrador.</span>
            </div>
          )}

          {/* Acciones */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowModal(false)}
              disabled={guardando || exito}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmar}
              loading={guardando}
              disabled={guardando || exito}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle2 size={14} className="mr-1.5" />
              {guardando ? 'Guardando...' : 'Confirmar Realización'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
