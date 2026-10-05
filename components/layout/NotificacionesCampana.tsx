'use client'
// components/layout/NotificacionesCampana.tsx
import { useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import { Bell, Check, CheckCheck, X } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { useNotificaciones } from '@/lib/notificaciones/useNotificaciones'

interface Props {
  isAdmin: boolean
}

export default function NotificacionesCampana({ isAdmin }: Props) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { notificaciones, noLeidas, loading, marcarLeida, marcarTodasLeidas } = useNotificaciones(isAdmin)

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!abierto) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [abierto])

  if (!isAdmin) return null

  return (
    <div ref={ref} className="relative">
      <button
        id="btn-notificaciones-campana"
        onClick={() => setAbierto(v => !v)}
        aria-label={`Notificaciones${noLeidas > 0 ? ` (${noLeidas} sin leer)` : ''}`}
        aria-expanded={abierto}
        aria-haspopup="true"
        className={cn(
          'relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors',
          'text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-fm-green-600',
          abierto && 'bg-muted text-foreground'
        )}
      >
        <Bell size={20} />
        {noLeidas > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none"
            aria-hidden="true"
          >
            {noLeidas > 99 ? '99+' : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div
          className={cn(
            'absolute right-0 top-12 z-50 w-80 max-h-[28rem] flex flex-col',
            'rounded-xl border border-border bg-card shadow-2xl fm-animate-scalein overflow-hidden'
          )}
          role="dialog"
          aria-label="Panel de notificaciones"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-muted-foreground" />
              <h3 className="text-sm font-bold text-foreground">Notificaciones</h3>
              {noLeidas > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px] font-bold">
                  {noLeidas} nuevas
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {noLeidas > 0 && (
                <button
                  onClick={marcarTodasLeidas}
                  title="Marcar todas como leídas"
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <CheckCheck size={14} />
                  Todas
                </button>
              )}
              <button
                onClick={() => setAbierto(false)}
                className="flex items-center justify-center w-7 h-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Cerrar panel"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
            ) : notificaciones.length === 0 ? (
              <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
                <Bell size={28} className="opacity-30" />
                <p className="text-sm">Sin notificaciones</p>
              </div>
            ) : (
              <ul role="list">
                {notificaciones.map(n => (
                  <NotificacionItem
                    key={n.id}
                    n={n}
                    onMarcarLeida={marcarLeida}
                    onClose={() => setAbierto(false)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function NotificacionItem({
  n,
  onMarcarLeida,
  onClose,
}: {
  n: ReturnType<typeof useNotificaciones>['notificaciones'][number]
  onMarcarLeida: (id: string) => Promise<void>
  onClose: () => void
}) {
  const href = n.area_id
    ? `/admin/hoteles/${n.hotel_id ?? ''}/calendario`
    : '/admin/dashboard'

  const fechaLabel = n.fecha_servicio
    ? format(new Date(`${n.fecha_servicio}T00:00:00`), "d 'de' MMMM yyyy", { locale: es })
    : ''

  return (
    <li className={cn(
      'group relative border-b border-border/60 last:border-0 transition-colors',
      n.leida ? 'bg-card' : 'bg-fm-green-50/40 dark:bg-fm-green-950/20'
    )}>
      {!n.leida && (
        <span
          className="absolute left-0 top-0 bottom-0 w-0.5 bg-fm-green-600 rounded-r"
          aria-hidden="true"
        />
      )}
      <div className="flex items-start gap-3 px-4 py-3 pl-5">
        <div className="flex-1 min-w-0">
          <Link
            href={href}
            onClick={onClose}
            className="block hover:underline underline-offset-2"
          >
            <p className="text-xs font-semibold text-foreground leading-snug">
              {n.empleado_nombre ?? 'Empleado'} confirmó un servicio
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug truncate">
              {[n.hotel_nombre, n.area_nombre, n.operacion_nombre || null].filter(Boolean).join(' · ')}
            </p>
            {fechaLabel && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{fechaLabel}</p>
            )}
          </Link>
          <p className="mt-1 text-[10px] text-muted-foreground/70">
            {format(new Date(n.created_at), 'dd/MM/yyyy HH:mm', { locale: es })}
          </p>
        </div>
        {!n.leida && (
          <button
            onClick={() => onMarcarLeida(n.id)}
            title="Marcar como leída"
            className="flex-shrink-0 mt-0.5 w-7 h-7 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <Check size={13} />
          </button>
        )}
      </div>
    </li>
  )
}
