'use client'

import { useId, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, Check, CheckCheck, CheckCircle2, Building2, CalendarDays, ArrowUpRight, RefreshCw, AlertCircle, Loader2 } from 'lucide-react'
import { format, isValid } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { useNotificaciones, type Notificacion } from '@/lib/notificaciones/useNotificaciones'

export default function NotificacionesCampana({ isAdmin }: { isAdmin: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const [filtro, setFiltro] = useState<'todas' | 'pendientes'>('todas')
  const trigger = useRef<HTMLButtonElement>(null)
  const triggerId = useId()
  const { notificaciones, noLeidas, loading, error, guardando, marcarLeida, marcarTodasLeidas, recargar } = useNotificaciones(isAdmin, filtro === 'pendientes')
  const visibles = filtro === 'pendientes' ? notificaciones.filter(n => !n.leida) : notificaciones

  function cerrar() {
    setAbierto(false)
    trigger.current?.focus()
  }

  if (!isAdmin) return null

  return (
    <>
      <button
        ref={trigger}
        id={`btn-notificaciones-${triggerId}`}
        type="button"
        onClick={() => { setAbierto(true); void recargar() }}
        aria-label={`Notificaciones${noLeidas > 0 ? ` (${noLeidas} sin leer)` : ''}`}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Bell size={20} />
        {noLeidas > 0 && (
          <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white ring-2 ring-card">
            {noLeidas > 99 ? '99+' : noLeidas}
          </span>
        )}
      </button>

      <Modal open={abierto} onClose={cerrar} title="Notificaciones" maxWidth="lg" footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Hasta 50 notificaciones {filtro === 'pendientes' ? 'sin leer' : 'recientes'}.</p>
          <Button variant="ghost" size="sm" onClick={cerrar}>Cerrar</Button>
        </div>
      }>
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white"><CheckCircle2 size={23} /></div>
            <div className="min-w-0">
              <p className="font-semibold text-emerald-950 dark:text-emerald-100">Seguimiento de trabajos realizados</p>
              <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">{noLeidas > 0 ? `${noLeidas} ${noLeidas === 1 ? 'confirmación pendiente' : 'confirmaciones pendientes'} de revisar` : 'Estás al día con las confirmaciones'}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-xl bg-muted p-1" role="group" aria-label="Filtrar notificaciones">
              {(['todas', 'pendientes'] as const).map(valor => (
                <button type="button" key={valor} aria-pressed={filtro === valor} onClick={() => setFiltro(valor)} className={cn('min-h-10 rounded-lg px-3 text-sm font-semibold transition-colors', filtro === valor ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                  {valor === 'todas' ? 'Todas' : 'Sin leer'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => void recargar()} aria-label="Actualizar notificaciones"><RefreshCw size={17} /></Button>
              <Button variant="outline" size="sm" disabled={noLeidas === 0 || guardando || loading} loading={guardando} onClick={() => void marcarTodasLeidas()}><CheckCheck size={16} />Marcar todas leídas</Button>
            </div>
          </div>

          {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"><AlertCircle size={18} className="shrink-0" />{error}</div>}

          {loading ? (
            <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 size={20} className="animate-spin" />Cargando notificaciones…</div>
          ) : visibles.length === 0 && !error ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
              <Bell size={32} className="mx-auto mb-3 text-muted-foreground" />
              <p className="font-semibold text-foreground">{filtro === 'pendientes' ? 'No hay confirmaciones sin leer' : 'Aún no hay notificaciones'}</p>
              <p className="mt-2 text-sm text-muted-foreground">Aquí aparecerán los trabajos que confirme el personal.</p>
            </div>
          ) : (
            <ul className="space-y-3" aria-label="Confirmaciones de actividades">
              {visibles.map(n => <NotificacionItem key={n.id} n={n} guardando={guardando} onMarcarLeida={marcarLeida} onClose={cerrar} />)}
            </ul>
          )}
        </div>
      </Modal>
    </>
  )
}

function fecha(value: string | null, servicio = false) {
  if (!value) return ''
  const date = new Date(servicio ? `${value}T12:00:00` : value)
  return isValid(date) ? format(date, servicio ? "d 'de' MMMM yyyy" : 'dd/MM/yyyy HH:mm', { locale: es }) : ''
}

function NotificacionItem({ n, guardando, onMarcarLeida, onClose }: {
  n: Notificacion
  guardando: boolean
  onMarcarLeida: (id: string) => Promise<void>
  onClose: () => void
}) {
  const href = n.actividad_id ? `/admin/actividades?actividad=${encodeURIComponent(n.actividad_id)}`
    : n.hotel_id && n.area_id ? `/admin/hoteles/${n.hotel_id}/calendario` : '/admin/actividades'
  return (
    <li className={cn('rounded-2xl border p-4 transition-colors', n.leida ? 'border-border bg-card' : 'border-emerald-300 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20')}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"><CheckCircle2 size={19} /></div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{n.actividad_id ? 'Actividad realizada' : 'Servicio realizado'}</p>
            {!n.leida && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">Nueva</span>}
          </div>
          <p className="break-words text-base font-bold text-foreground">{n.area_nombre || 'Trabajo confirmado'}</p>
          <p className="break-words text-sm text-muted-foreground">Confirmado por <span className="font-medium text-foreground">{n.empleado_nombre || 'Empleado'}</span></p>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            {n.hotel_nombre && <p className="flex items-start gap-1.5"><Building2 size={14} className="shrink-0" /><span className="break-words">{n.hotel_nombre}</span></p>}
            {n.operacion_nombre && <p className="break-words">{n.operacion_nombre}</p>}
            {n.fecha_servicio && <p className="flex items-start gap-1.5"><CalendarDays size={14} className="shrink-0" />{fecha(n.fecha_servicio, true)}</p>}
          </div>
          <p className="text-xs text-muted-foreground">Recibida el {fecha(n.created_at)}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
        <Link href={href} onClick={onClose} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-emerald-700 hover:bg-muted dark:text-emerald-400">Ver actividad<ArrowUpRight size={14} /></Link>
        {!n.leida ? <Button variant="ghost" size="sm" disabled={guardando} onClick={() => void onMarcarLeida(n.id)}><Check size={15} />Marcar leída</Button> : <span className="flex items-center gap-1 text-xs text-muted-foreground"><CheckCheck size={14} />Leída</span>}
      </div>
    </li>
  )
}
