'use client'
// components/calendar/ActivityCard.tsx
import { startTransition, useCallback, useState } from 'react'
import {
  Clock, Building2, Tag, CheckCircle2, AlertCircle, User, MessageSquare, MessagesSquare, CalendarDays, Flag, Camera, ClipboardList, Phone,
} from 'lucide-react'
import { format } from 'date-fns'
import type { Activity, InformeCierre } from '@/types'
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ChatActividad from '@/components/chat/ChatActividad'
import { BotonesAdjuntar, MiniaturasPendientes } from '@/components/chat/SelectorFotos'
import { cn, formatTime, truncate, getContrastText, PRIORITY_LABELS } from '@/lib/utils'
import { useResumenChat } from '@/lib/chat/useChatActividad'
import { useArchivosPendientes } from '@/lib/chat/useArchivosPendientes'
import { useConfiguracion } from '@/lib/configuracion/useConfiguracion'
import { encolarConfirmacion } from '@/lib/offline/encolar'
import { ErrorAlmacen } from '@/lib/offline/almacen'
import { sincronizarAhora } from '@/lib/offline/sincronizacion'
import { useInformesDisponibles } from '@/lib/informes/informes'
import FormularioCierre, { useFormularioCierre } from '@/components/informes/FormularioCierre'
import EstadoInformeActividad from '@/components/informes/EstadoInformeActividad'
import { descargarInformePdf } from '@/lib/informes/descargar'
import { createClient } from '@/lib/supabase/client'

type Pestana = 'confirmar' | 'chat'

interface ActivityCardProps {
  activity: Activity
  compact?: boolean
  onActivityUpdated?: (activity: Activity) => void
}

export default function ActivityCard({ activity: initialActivity, compact, onActivityUpdated }: ActivityCardProps) {
  const [activity, setActivity] = useState<Activity>(initialActivity)
  const [showModal, setShowModal] = useState(false)
  const [pestana, setPestana] = useState<Pestana>('confirmar')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [progreso, setProgreso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  // 'enviado': llegó al servidor. 'guardado': quedó en el teléfono y se enviará solo.
  const [exito, setExito] = useState<null | 'enviado' | 'guardado'>(null)
  const mostrarError = useCallback((mensaje: string) => setError(mensaje), [])
  const { config } = useConfiguracion()
  const maxFotos = config.max_fotos_evidencia
  const fotos = useArchivosPendientes(maxFotos, mostrarError)
  const resumenChat = useResumenChat(activity.id, !compact)
  const chat = { ...resumenChat, disponible: resumenChat.disponible && config.chat_habilitado }
  const faltaFoto = chat.disponible && config.foto_obligatoria_confirmar && fotos.archivos.length === 0
  // Con la migración 009 instalada, cerrar un operativo exige el informe completo.
  const informesDisponibles = useInformesDisponibles()
  const conInforme = informesDisponibles === true
  const cierre = useFormularioCierre(mostrarError)

  const typeColor = activity.color_override || activity.operation_type?.color || '#16a34a'
  const textOnColor = getContrastText(typeColor)

  const esPendiente = activity.status === 'programado'
  const esRealizada = activity.status === 'completado' || (activity.status as string) === 'realizado'

  function abrir(destino: Pestana) {
    setError(null)
    setAviso(null)
    setPestana(destino)
    setShowModal(true)
  }

  function cerrar() {
    if (guardando) return
    setShowModal(false)
    if (exito) {
      setExito(null)
      setNota('')
      fotos.limpiar()
      cierre.limpiar()
    }
    void chat.recargar()
  }

  async function handleConfirmar() {
    if (guardando || exito) return
    if (conInforme) {
      const falta = cierre.validar()
      if (falta) { setError(falta); return }
    } else if (faltaFoto) {
      setError('Adjunta al menos una foto de evidencia para confirmar la actividad.')
      return
    }
    setGuardando(true)
    setError(null)
    setAviso(null)
    try {
      // 1. Guardar primero en el teléfono (fotos incluidas): nada se pierde si se corta la conexión.
      setProgreso('Guardando en el teléfono…')
      const datosCierre = conInforme ? cierre.datos() : null
      const pendiente = await encolarConfirmacion(
        activity, nota, datosCierre ? datosCierre.archivos : fotos.archivos, datosCierre?.informe,
      )

      // 2. Enviar ahora si hay conexión (fotos → cierre/confirmación → evidencia en el chat).
      setProgreso(conInforme ? 'Enviando el cierre y las fotos…' : 'Enviando confirmación…')
      const r = await sincronizarAhora({ soloId: pendiente.id })
      if (r.resultado === 'sincronizada') {
        const actualizada = { ...activity, ...(r.actividad as Partial<Activity> | null ?? { status: 'completado' as const }), hotel: activity.hotel, operation_type: activity.operation_type }
        setActivity(actualizada)
        onActivityUpdated?.(actualizada)
        setExito('enviado')
        // El informe se genera y descarga automáticamente al cerrar.
        if (conInforme) {
          setProgreso('Generando el informe en PDF…')
          try {
            const { data } = await createClient().from('informes_cierre').select('*').eq('id', pendiente.id).single()
            if (data) await descargarInformePdf(data as InformeCierre)
          } catch {
            setAviso('El operativo quedó cerrado, pero el PDF no se pudo descargar ahora. Usa el botón «Descargar PDF».')
          }
        }
      } else if (r.resultado === 'conflicto') {
        setError('La actividad cambió en el servidor y no se cerró. Revisa el aviso en el indicador de sincronización (arriba) para decidir qué hacer.')
      } else {
        setExito('guardado')
        if (r.resultado === 'sesion') setAviso('Tu sesión expiró. Quedó guardado en el teléfono: inicia sesión para enviarlo.')
        else if (r.resultado === 'error') setAviso('Quedó guardado en el teléfono, pero el servidor lo rechazó. Revisa el detalle en el indicador de sincronización.')
      }
    } catch (err) {
      console.error(err)
      setError(err instanceof ErrorAlmacen ? err.message : 'Ocurrió un error inesperado al guardar. Inténtalo de nuevo.')
    } finally {
      setGuardando(false)
      setProgreso(null)
    }
  }

  const etiquetaChat = chat.nuevos > 0 ? `${chat.nuevos} nuevo${chat.nuevos !== 1 ? 's' : ''}` : chat.total > 0 ? String(chat.total) : null

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

          {/* Acciones: confirmar (si está pendiente) y chat */}
          {!compact && (
            <div className={cn('mt-3 flex gap-2', !esRealizada && 'pt-2.5 border-t border-border/60')}>
              {esPendiente && (
                <button
                  type="button"
                  id={`btn-confirmar-${activity.id}`}
                  onClick={() => abrir('confirmar')}
                  className="flex min-h-[44px] flex-1 touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer bg-emerald-600 hover:bg-emerald-700"
                >
                  <CheckCircle2 size={15} />
                  <span>Confirmar realización</span>
                </button>
              )}
              {chat.disponible && (
                <button
                  type="button"
                  id={`btn-chat-${activity.id}`}
                  onClick={() => abrir('chat')}
                  aria-label={`Abrir chat de la actividad${etiquetaChat ? ` (${etiquetaChat})` : ''}`}
                  className={cn(
                    'relative flex min-h-[44px] touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer',
                    esPendiente ? 'shrink-0' : 'flex-1',
                    chat.nuevos > 0
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'border-border bg-card text-foreground hover:bg-muted',
                  )}
                >
                  <MessagesSquare size={15} />
                  <span>Chat</span>
                  {etiquetaChat && (
                    <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                      chat.nuevos > 0 ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground')}>
                      {etiquetaChat}
                    </span>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </article>

      {/* Panel de la actividad: confirmación + chat */}
      <Modal
        open={showModal}
        onClose={cerrar}
        title={pestana === 'chat' ? 'Chat de la actividad' : esPendiente ? 'Confirmar actividad realizada' : 'Detalle de la actividad'}
        maxWidth="lg"
        footer={pestana === 'confirmar' && (esPendiente || exito) ? (
          <div className="w-full space-y-3">
            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                <AlertCircle size={18} className="shrink-0" />{error}
              </p>
            )}
            {aviso && (
              <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                <AlertCircle size={18} className="shrink-0" />{aviso}
              </p>
            )}
            {progreso && <p role="status" className="text-sm font-medium text-muted-foreground">{progreso}</p>}
            <div className="flex w-full flex-col gap-2 sm:flex-row-reverse">
              {exito ? (
                <>
                  <Button type="button" variant="primary" size="md" onClick={() => setPestana('chat')}
                    className="w-full bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 sm:min-w-44 sm:w-auto">
                    <MessagesSquare size={14} /> Abrir chat
                  </Button>
                  <Button type="button" variant="outline" size="md" onClick={cerrar} className="w-full sm:w-auto">
                    Cerrar
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={() => startTransition(handleConfirmar)}
                    loading={guardando}
                    disabled={guardando || (!conInforme && faltaFoto) || informesDisponibles === null}
                    className="w-full bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 sm:min-w-44 sm:w-auto"
                  >
                    <CheckCircle2 size={14} />
                    {guardando
                      ? 'Guardando...'
                      : conInforme
                        ? 'Cerrar y generar informe'
                        : fotos.archivos.length > 0
                        ? `Confirmar con ${fotos.archivos.length} foto${fotos.archivos.length !== 1 ? 's' : ''}`
                        : 'Confirmar actividad'}
                  </Button>
                  <Button type="button" variant="outline" size="md" onClick={cerrar} disabled={guardando} className="w-full sm:w-auto">
                    Cancelar
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : undefined}
      >
        <div className="space-y-4">
          {/* Pestañas */}
          {chat.disponible && (
            <div role="tablist" aria-label="Secciones de la actividad" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
              {([
                { id: 'confirmar', label: esPendiente && !exito ? 'Confirmar' : 'Detalles', icon: ClipboardList },
                { id: 'chat', label: 'Chat', icon: MessagesSquare },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={pestana === tab.id}
                  onClick={() => !guardando && setPestana(tab.id)}
                  className={cn(
                    'flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors',
                    pestana === tab.id ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <tab.icon size={15} /> {tab.label}
                  {tab.id === 'chat' && chat.nuevos > 0 && pestana !== 'chat' && (
                    <span className="h-2 w-2 rounded-full bg-emerald-500" aria-label="Mensajes nuevos" />
                  )}
                </button>
              ))}
            </div>
          )}

          {pestana === 'chat' ? (
            <>
              <ResumenCompacto activity={activity} typeColor={typeColor} />
              <ChatActividad actividadId={activity.id} abierto={showModal && pestana === 'chat'} />
            </>
          ) : (
            <>
              {exito && (
                <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/40">
                  <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    {exito === 'enviado' ? (
                      <>
                        <p className="font-bold text-emerald-900 dark:text-emerald-200">{conInforme ? '¡Operativo cerrado!' : '¡Actividad confirmada correctamente!'}</p>
                        <p className="mt-0.5 text-sm text-emerald-800 dark:text-emerald-300">
                          {conInforme
                            ? 'Se notificó al administrador. Ya puedes descargar el informe en PDF aquí abajo.'
                            : 'Se notificó al administrador. Puedes seguir compartiendo información en el chat.'}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-bold text-emerald-900 dark:text-emerald-200">Guardado en el teléfono</p>
                        <p className="mt-0.5 text-sm text-emerald-800 dark:text-emerald-300">
                          No hay conexión con el servidor. {conInforme ? 'El cierre y las fotos' : 'La confirmación'} se enviará{conInforme ? 'n' : ''} automáticamente al recuperar la conexión. No cierres sesión ni borres los datos del navegador.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              <DetalleActividad activity={activity} typeColor={typeColor} textOnColor={textOnColor} />

              {conInforme && (esRealizada || exito === 'enviado') && (
                <EstadoInformeActividad actividadId={activity.id} habilitado={showModal} />
              )}

              {esPendiente && !exito && (
                <div className="space-y-4">
                  {conInforme ? (
                    <FormularioCierre form={cierre} activity={activity} disabled={guardando} />
                  ) : (
                  <section aria-label="Fotos de evidencia" className="space-y-2.5">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <Camera size={14} className="text-muted-foreground" />
                      Fotos de evidencia{' '}
                      <span className="font-normal text-muted-foreground">
                        {config.foto_obligatoria_confirmar && chat.disponible ? `(obligatoria, hasta ${maxFotos})` : `(opcional, hasta ${maxFotos})`}
                      </span>
                    </p>
                    {chat.disponible ? (
                      <>
                        <div className="flex gap-2">
                          <BotonesAdjuntar variante="boton" onArchivos={fotos.agregar} disabled={guardando || fotos.archivos.length >= maxFotos} />
                        </div>
                        <MiniaturasPendientes grande pendientes={fotos.pendientes} onQuitar={fotos.quitar} disabled={guardando} />
                        {fotos.archivos.length > 0 && (
                          <p className="text-xs text-muted-foreground">Las fotos se reducen automáticamente para ahorrar datos y quedarán en el chat de la actividad.</p>
                        )}
                      </>
                    ) : (
                      <p className="rounded-xl border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                        Las fotos de evidencia estarán disponibles cuando el administrador habilite el chat de actividades.
                      </p>
                    )}
                  </section>
                  )}

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
                      placeholder="Ej.: áreas tratadas, productos usados, incidencias…"
                      className="fm-input w-full resize-y text-sm"
                      disabled={guardando}
                    />
                    <p className="mt-1 text-right text-xs text-muted-foreground">{nota.length}/500 caracteres</p>
                  </div>

                  <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                    <User size={14} className="mt-0.5 shrink-0" />
                    La confirmación se registrará con el nombre de tu cuenta y se notificará al administrador. Necesitas haber iniciado sesión.
                  </p>
                  {config.telefono_oficina && (
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <Phone size={14} className="shrink-0" />
                      ¿Algún problema? Oficina de {config.nombre_empresa}:
                      <a href={`tel:${config.telefono_oficina.replace(/[^\d+]/g, '')}`} className="font-semibold text-emerald-700 underline underline-offset-2 dark:text-emerald-400">
                        {config.telefono_oficina}
                      </a>
                    </p>
                  )}
                </div>
              )}

              {esRealizada && !exito && (
                <section aria-label="Confirmación" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
                  <p className="flex items-center gap-2 font-semibold text-emerald-900 dark:text-emerald-200">
                    <CheckCircle2 size={16} /> Actividad realizada
                  </p>
                  {activity.confirmado_nombre && (
                    <p className="mt-1 text-emerald-800 dark:text-emerald-300">
                      Confirmada por <span className="font-medium">{activity.confirmado_nombre}</span>
                      {activity.confirmado_en && ` el ${format(new Date(activity.confirmado_en), 'dd/MM/yyyy HH:mm')}`}
                    </p>
                  )}
                  {activity.confirmacion_nota && (
                    <p className="mt-1 whitespace-pre-wrap break-words italic text-muted-foreground">&quot;{activity.confirmacion_nota}&quot;</p>
                  )}
                  {chat.disponible && (
                    <button type="button" onClick={() => setPestana('chat')}
                      className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-emerald-300 bg-card px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950">
                      <MessagesSquare size={14} /> Ver fotos y mensajes en el chat
                    </button>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </Modal>
    </>
  )
}

function DetalleActividad({ activity, typeColor, textOnColor }: { activity: Activity; typeColor: string; textOnColor: string }) {
  const filas: { icon: typeof Building2; label: string; valor: string }[] = [
    { icon: Building2, label: 'Hotel', valor: activity.hotel?.name || '—' },
    { icon: CalendarDays, label: 'Fecha', valor: format(new Date(`${activity.date}T12:00:00`), 'dd/MM/yyyy') },
  ]
  if (activity.start_time) {
    filas.push({
      icon: Clock,
      label: 'Horario',
      valor: `${formatTime(activity.start_time)}${activity.end_time ? ` – ${formatTime(activity.end_time)}` : ''}`,
    })
  }
  filas.push({ icon: Flag, label: 'Prioridad', valor: PRIORITY_LABELS[activity.priority] ?? activity.priority })

  return (
    <section aria-label="Resumen del servicio" className="rounded-2xl border border-border bg-muted/40 p-4 sm:p-5">
      <span
        className="mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
        style={{ background: typeColor, color: textOnColor }}
      >
        <Tag size={11} /> {activity.operation_type?.name || 'Operación'}
      </span>
      <p className="mb-4 break-words text-xl font-bold text-foreground">{activity.title}</p>
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        {filas.map(f => (
          <div key={f.label} className="flex min-w-0 items-start gap-2.5">
            <f.icon size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{f.label}</dt>
              <dd className="break-words font-medium text-foreground">{f.valor}</dd>
            </div>
          </div>
        ))}
      </dl>
      {activity.description && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Descripción</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">{activity.description}</p>
        </div>
      )}
      {activity.notes && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">Indicaciones del administrador</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-amber-950 dark:text-amber-100">{activity.notes}</p>
        </div>
      )}
    </section>
  )
}

function ResumenCompacto({ activity, typeColor }: { activity: Activity; typeColor: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2" style={{ borderLeftWidth: 4, borderLeftColor: typeColor }}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">{activity.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {activity.hotel?.name || '—'} · {format(new Date(`${activity.date}T12:00:00`), 'dd/MM/yyyy')}
          {activity.start_time && ` · ${formatTime(activity.start_time)}`}
        </p>
      </div>
      <StatusBadge status={activity.status} />
    </div>
  )
}
