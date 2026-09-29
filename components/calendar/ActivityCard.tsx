// components/calendar/ActivityCard.tsx
import { Clock, Building2, Tag } from 'lucide-react'
import type { Activity } from '@/types'
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge'
import { formatTime, truncate, getContrastText } from '@/lib/utils'

interface ActivityCardProps {
  activity: Activity
  compact?: boolean
}

export default function ActivityCard({ activity, compact }: ActivityCardProps) {
  const typeColor = activity.color_override || activity.operation_type?.color || '#16a34a'
  const textOnColor = getContrastText(typeColor)

  return (
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
      </div>
    </article>
  )
}
