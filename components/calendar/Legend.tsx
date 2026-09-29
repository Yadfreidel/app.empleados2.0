// components/calendar/Legend.tsx
import type { OperationType } from '@/types'

interface LegendProps {
  operationTypes: OperationType[]
}

export default function Legend({ operationTypes }: LegendProps) {
  const active = operationTypes.filter(o => o.active)
  if (active.length === 0) return null

  return (
    <div className="fm-card px-4 py-3 border border-border bg-card">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
        Tipos de operación
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {active.map(op => (
          <div key={op.id} className="flex items-center gap-2 text-xs font-medium text-foreground">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-2xs"
              style={{ background: op.color }}
              aria-hidden="true"
            />
            <span>{op.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
