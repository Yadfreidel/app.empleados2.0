'use client'
// components/calendar/CalendarGrid.tsx
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday, format, addMonths, subMonths
} from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { useState, useCallback } from 'react'
import type { Activity } from '@/types'
import { cn, capitalize } from '@/lib/utils'
import Button from '@/components/ui/Button'

interface CalendarGridProps {
  activities: Activity[]
  onDaySelect: (date: Date) => void
  selectedDate: Date | null
  loading?: boolean
}

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export default function CalendarGrid({
  activities,
  onDaySelect,
  selectedDate,
}: CalendarGridProps) {
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date())

  const prevMonth = useCallback(() => setCurrentMonth(m => subMonths(m, 1)), [])
  const nextMonth = useCallback(() => setCurrentMonth(m => addMonths(m, 1)), [])
  const goToday   = useCallback(() => setCurrentMonth(new Date()), [])

  // Build days grid (6 weeks)
  const monthStart = startOfMonth(currentMonth)
  const monthEnd   = endOfMonth(currentMonth)
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd    = endOfWeek(monthEnd,   { weekStartsOn: 0 })
  const days       = eachDayOfInterval({ start: gridStart, end: gridEnd })

  // Index activities by date string
  const activityMap = new Map<string, Activity[]>()
  activities.forEach(act => {
    const key = act.date // YYYY-MM-DD
    if (!activityMap.has(key)) activityMap.set(key, [])
    activityMap.get(key)!.push(act)
  })

  function getDotsForDay(date: Date): { color: string; id: string }[] {
    const key = format(date, 'yyyy-MM-dd')
    const acts = activityMap.get(key) || []
    // Unique colors, max 3 dots
    const uniqueColors = [...new Set(acts.map(a =>
      a.color_override || a.operation_type?.color || '#16a34a'
    ))].slice(0, 3)
    return uniqueColors.map((color, i) => ({ color, id: `${key}-${i}` }))
  }

  return (
    <div className="fm-card overflow-hidden w-full border border-border bg-card">
      {/* ── Calendar Header (Compact on mobile) ── */}
      <div className="flex items-center justify-between gap-1 sm:gap-2 px-3 sm:px-5 py-3 sm:py-4 border-b border-border bg-card">
        <div className="flex items-center gap-1 sm:gap-2">
          <Button
            id="btn-prev-month"
            variant="ghost"
            size="icon"
            onClick={prevMonth}
            aria-label="Mes anterior"
            className="min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px]"
          >
            <ChevronLeft size={18} />
          </Button>
          <h2
            className="font-bold text-foreground text-sm sm:text-base md:text-lg min-w-[7.5rem] sm:min-w-[11rem] text-center capitalize select-none"
            aria-live="polite"
          >
            {capitalize(format(currentMonth, 'MMMM yyyy', { locale: es }))}
          </h2>
          <Button
            id="btn-next-month"
            variant="ghost"
            size="icon"
            onClick={nextMonth}
            aria-label="Mes siguiente"
            className="min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px]"
          >
            <ChevronRight size={18} />
          </Button>
        </div>
        <Button
          id="btn-today"
          variant="outline"
          size="sm"
          leftIcon={<CalendarDays size={14} />}
          onClick={goToday}
          className="min-h-[40px] sm:min-h-[44px] px-2.5 sm:px-3 text-xs sm:text-sm font-semibold"
        >
          Hoy
        </Button>
      </div>

      {/* ── Weekday labels ── */}
      <div className="grid grid-cols-7 text-center border-b border-border py-2 px-1 sm:px-2 bg-muted/30">
        {WEEKDAYS.map(day => (
          <div
            key={day}
            className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground select-none"
            aria-label={day}
          >
            {day}
          </div>
        ))}
      </div>

      {/* ── Days grid (7 columns, never overflows) ── */}
      <div className="grid grid-cols-7 p-1 sm:p-2 gap-1 sm:gap-1.5 w-full" aria-label="Calendario de actividades">
        {days.map(day => {
          const isCurrentMonth = isSameMonth(day, currentMonth)
          const dayIsToday     = isToday(day)
          const isSelected     = selectedDate ? isSameDay(day, selectedDate) : false
          const dateKey        = format(day, 'yyyy-MM-dd')
          const acts           = activityMap.get(dateKey) || []
          const dots           = getDotsForDay(day)
          const hasActivities  = acts.length > 0

          return (
            <button
              key={dateKey}
              id={`calendar-day-${dateKey}`}
              onClick={() => onDaySelect(day)}
              aria-label={`${format(day, 'EEEE d MMMM', { locale: es })}${hasActivities ? `, ${acts.length} actividad(es)` : ''}`}
              aria-pressed={isSelected}
              className={cn(
                'relative flex flex-col items-center md:items-start justify-start p-1 sm:p-1.5 rounded-lg transition-all duration-150 border w-full min-w-0 select-none cursor-pointer',
                // Mobile: square aspect ratio. Desktop: taller cells for short activity tags
                'aspect-square md:aspect-auto md:min-h-[5.5rem] lg:min-h-[6.25rem]',
                isSelected
                  ? 'border-fm-green-600 bg-fm-green-700 text-white shadow-md ring-2 ring-fm-green-500/60 dark:bg-fm-green-800'
                  : dayIsToday
                    ? 'border-fm-green-500 bg-fm-green-50/60 text-foreground ring-1 ring-fm-green-500 dark:bg-fm-green-950/40 dark:text-fm-green-300'
                    : hasActivities && isCurrentMonth
                      ? 'border-border bg-card hover:border-fm-green-400 hover:bg-muted/60 text-foreground'
                      : 'border-transparent bg-transparent hover:bg-muted/40 text-foreground',
                !isCurrentMonth && 'opacity-30'
              )}
            >
              {/* Day number header */}
              <div className="flex items-center justify-between w-full">
                <span
                  className={cn(
                    'w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full text-xs sm:text-sm font-semibold leading-none transition-colors mx-auto md:mx-0',
                    isSelected
                      ? 'text-white'
                      : dayIsToday
                        ? 'bg-fm-green-600 text-white font-bold'
                        : isCurrentMonth
                          ? 'text-foreground'
                          : 'text-muted-foreground'
                  )}
                >
                  {format(day, 'd')}
                </span>
                {/* On PC, show total count if multiple */}
                {hasActivities && !isSelected && (
                  <span className="hidden md:inline-block text-[10px] font-semibold text-muted-foreground px-1">
                    {acts.length}
                  </span>
                )}
              </div>

              {/* Mobile: Activity dots (max 3 dots + "+N") */}
              {hasActivities && (
                <div className="flex md:hidden items-center justify-center gap-0.5 mt-1 flex-wrap max-w-full px-0.5" aria-hidden="true">
                  {dots.slice(0, 3).map(dot => (
                    <span
                      key={dot.id}
                      className="fm-day-dot w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.9)' : dot.color }}
                    />
                  ))}
                  {acts.length > 3 && (
                    <span
                      className={cn(
                        'text-[9px] font-bold leading-none ml-0.5',
                        isSelected ? 'text-white' : 'text-muted-foreground'
                      )}
                    >
                      +{acts.length - 3}
                    </span>
                  )}
                </div>
              )}

              {/* PC: short activity labels */}
              {hasActivities && (
                <div className="hidden md:flex flex-col gap-1 w-full mt-1.5 px-0.5" aria-hidden="true">
                  {acts.slice(0, 2).map(act => {
                    const color = act.color_override || act.operation_type?.color || '#16a34a'
                    return (
                      <div
                        key={act.id}
                        className={cn(
                          'w-full truncate text-[11px] font-medium px-1.5 py-0.5 rounded leading-tight text-left',
                          isSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-muted/80 text-foreground dark:bg-muted/40'
                        )}
                        style={!isSelected ? { borderLeft: `2.5px solid ${color}` } : undefined}
                        title={`${act.title}${act.hotel ? ` · ${act.hotel.name}` : ''}`}
                      >
                        <span className="truncate block">
                          {act.hotel?.name ? `${act.hotel.name}: ` : ''}{act.title}
                        </span>
                      </div>
                    )
                  })}
                  {acts.length > 2 && (
                    <span
                      className={cn(
                        'text-[10px] font-semibold pl-1 text-left',
                        isSelected ? 'text-white/90' : 'text-muted-foreground'
                      )}
                    >
                      +{acts.length - 2} más
                    </span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
