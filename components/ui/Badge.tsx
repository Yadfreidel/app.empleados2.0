'use client'
// components/ui/Badge.tsx
import { cn } from '@/lib/utils'
import { STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS } from '@/lib/utils'
import type { ActivityStatus, ActivityPriority } from '@/types'

interface BadgeProps {
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export function Badge({ children, className, style }: BadgeProps) {
  return (
    <span className={cn('fm-badge', className)} style={style}>
      {children}
    </span>
  )
}

const STATUS_DARK_CLASSES: Record<ActivityStatus, string> = {
  programado:  'dark:!bg-blue-950/70 dark:!text-blue-300 dark:!border-blue-800/80',
  en_progreso: 'dark:!bg-amber-950/70 dark:!text-amber-300 dark:!border-amber-800/80',
  completado:  'dark:!bg-emerald-950/70 dark:!text-emerald-300 dark:!border-emerald-800/80',
  cancelado:   'dark:!bg-red-950/70 dark:!text-red-300 dark:!border-red-800/80',
  postpuesto:  'dark:!bg-purple-950/70 dark:!text-purple-300 dark:!border-purple-800/80',
}

const PRIORITY_DARK_CLASSES: Record<ActivityPriority, string> = {
  baja:    'dark:!bg-slate-800 dark:!text-slate-300 dark:!border dark:!border-slate-700',
  normal:  'dark:!bg-emerald-950/70 dark:!text-emerald-300 dark:!border dark:!border-emerald-800/80',
  alta:    'dark:!bg-orange-950/70 dark:!text-orange-300 dark:!border dark:!border-orange-800/80',
  urgente: 'dark:!bg-red-950/70 dark:!text-red-300 dark:!border dark:!border-red-800/80',
}

interface StatusBadgeProps {
  status: ActivityStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const colors = STATUS_COLORS[status]
  return (
    <Badge
      className={cn(STATUS_DARK_CLASSES[status], className)}
      style={{ backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
    >
      {STATUS_LABELS[status]}
    </Badge>
  )
}

interface PriorityBadgeProps {
  priority: ActivityPriority
  className?: string
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const colors = PRIORITY_COLORS[priority]
  return (
    <Badge
      className={cn(PRIORITY_DARK_CLASSES[priority], className)}
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {PRIORITY_LABELS[priority]}
    </Badge>
  )
}
