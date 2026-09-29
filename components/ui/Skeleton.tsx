// components/ui/Skeleton.tsx
import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
  style?: React.CSSProperties
}

export function Skeleton({ className, style }: SkeletonProps) {
  return <div className={cn('fm-skeleton', className)} style={style} aria-hidden="true" />
}

export function CalendarSkeleton() {
  return (
    <div className="fm-card p-4 fm-animate-fadein border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-9 w-9 rounded-fm" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-9 w-9 rounded-fm" />
      </div>
      {/* Days of week */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-5 rounded" />
        ))}
      </div>
      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square md:aspect-auto md:min-h-[5.5rem] rounded-fm" />
        ))}
      </div>
    </div>
  )
}

export function ActivityCardSkeleton() {
  return (
    <div className="fm-card p-4 fm-animate-fadein border border-border bg-card">
      <div className="flex items-start gap-3">
        <Skeleton className="w-10 h-10 rounded-fm flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <div className="flex gap-2 mt-3">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 fm-card border border-border bg-card fm-animate-fadein" style={{ animationDelay: `${i * 60}ms` }}>
          <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-7 w-16 rounded-fm" />
        </div>
      ))}
    </div>
  )
}
