'use client'
// components/calendar/DayPanel.tsx
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { X, Calendar } from 'lucide-react'
import type { Activity } from '@/types'
import ActivityCard from './ActivityCard'
import Button from '@/components/ui/Button'
import { EmptyCalendarDay } from '@/components/ui/EmptyState'
import { ActivityCardSkeleton } from '@/components/ui/Skeleton'
import { capitalize } from '@/lib/utils'

interface DayPanelProps {
  date: Date | null
  activities: Activity[]
  loading?: boolean
  onClose: () => void
}

export default function DayPanel({ date, activities, loading, onClose }: DayPanelProps) {
  if (!date) return null

  const dateLabel = capitalize(format(date, "EEEE d 'de' MMMM", { locale: es }))

  return (
    <section
      className="fm-card flex flex-col overflow-hidden h-full max-h-[85vh] lg:max-h-[calc(100vh-10rem)] border border-border bg-card shadow-lg lg:shadow-sm fm-animate-scalein"
      aria-label={`Actividades del ${dateLabel}`}
    >
      {/* Mobile drag handle for bottom sheet feel */}
      <div className="pt-2 pb-1 flex justify-center lg:hidden">
        <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-border flex-shrink-0 bg-card">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-fm flex items-center justify-center flex-shrink-0 bg-fm-green-100 text-fm-green-800 dark:bg-fm-green-950 dark:text-fm-green-300"
            aria-hidden="true"
          >
            <Calendar size={18} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground leading-snug">{dateLabel}</h2>
            <p className="text-xs text-muted-foreground">
              {loading ? '…' : `${activities.length} actividad${activities.length !== 1 ? 'es' : ''}`}
            </p>
          </div>
        </div>
        <Button
          id="btn-close-day-panel"
          variant="ghost"
          size="icon"
          className="min-w-[44px] min-h-[44px] text-muted-foreground hover:text-foreground"
          onClick={onClose}
          aria-label="Cerrar panel del día"
        >
          <X size={18} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
        {loading ? (
          <>
            <ActivityCardSkeleton />
            <ActivityCardSkeleton />
          </>
        ) : activities.length === 0 ? (
          <EmptyCalendarDay />
        ) : (
          activities.map(activity => (
            <ActivityCard key={activity.id} activity={activity} />
          ))
        )}
      </div>
    </section>
  )
}
