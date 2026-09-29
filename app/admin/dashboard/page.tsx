'use client'
// app/(admin)/dashboard/page.tsx
import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  CalendarDays, Building2, Tag, Activity,
  Clock, AlertTriangle, CheckCircle2,
} from 'lucide-react'
import { format, startOfWeek, endOfWeek, parseISO } from 'date-fns'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/Badge'
import type { ActivityStatus } from '@/types'

function StatCard({
  icon: Icon, label, value, sub, color, href, loading,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  color: string
  href: string
  loading?: boolean
}) {
  return (
    <Link href={href} className="fm-card fm-card-hover block p-4 sm:p-5 rounded-xl border border-border bg-card shadow-xs group">
      <div className="flex items-start justify-between mb-3 sm:mb-4">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110 shadow-2xs"
          style={{ background: `${color}18`, color }}
        >
          <Icon size={20} />
        </div>
      </div>
      {loading ? (
        <Skeleton className="h-8 w-16 mb-1 rounded" />
      ) : (
        <div className="text-2xl font-800 text-foreground mb-1">{value}</div>
      )}
      <div className="text-sm font-bold text-foreground/90">{label}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </Link>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState({
    today: 0, week: 0, urgent: 0, completed: 0,
    hotels: 0, opTypes: 0,
  })
  const [loading, setLoading] = useState(true)
  const [recentActivities, setRecentActivities] = useState<{id: string; title: string; date: string; status: ActivityStatus}[]>([])

  useEffect(() => {
    async function load() {
      try {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const today = format(new Date(), 'yyyy-MM-dd')
        const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
        const weekEnd   = format(endOfWeek(new Date(),   { weekStartsOn: 1 }), 'yyyy-MM-dd')

        const [
          { count: todayCount },
          { count: weekCount },
          { count: urgentCount },
          { count: completedCount },
          { count: hotelsCount },
          { count: opTypesCount },
          { data: recent },
        ] = await Promise.all([
          supabase.from('activities').select('*', { count: 'exact', head: true }).eq('date', today),
          supabase.from('activities').select('*', { count: 'exact', head: true }).gte('date', weekStart).lte('date', weekEnd),
          supabase.from('activities').select('*', { count: 'exact', head: true }).eq('priority', 'urgente').not('status', 'eq', 'completado'),
          supabase.from('activities').select('*', { count: 'exact', head: true }).eq('status', 'completado'),
          supabase.from('hotels').select('*', { count: 'exact', head: true }).eq('active', true),
          supabase.from('operation_types').select('*', { count: 'exact', head: true }).eq('active', true),
          supabase.from('activities').select('id,title,date,status').order('created_at', { ascending: false }).limit(5),
        ])
        setStats({
          today:     todayCount ?? 0,
          week:      weekCount ?? 0,
          urgent:    urgentCount ?? 0,
          completed: completedCount ?? 0,
          hotels:    hotelsCount ?? 0,
          opTypes:   opTypesCount ?? 0,
        })
        setRecentActivities((recent as {id: string; title: string; date: string; status: ActivityStatus}[]) ?? [])
      } catch (e) {
        console.error('Dashboard stats error:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="space-y-8 fm-animate-fadein">
      <div>
        <h1 className="text-2xl md:text-3xl font-800 text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Resumen operativo de F&amp;M Fumigación</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon={CalendarDays} label="Actividades hoy"   value={stats.today}     color="#15803d" href="/admin/actividades" loading={loading} />
        <StatCard icon={Clock}        label="Esta semana"        value={stats.week}      color="#2563eb" href="/admin/actividades" loading={loading} />
        <StatCard icon={AlertTriangle} label="Urgentes activas" value={stats.urgent}    color="#dc2626" href="/admin/actividades" loading={loading} />
        <StatCard icon={CheckCircle2}  label="Completadas"      value={stats.completed} color="#0891b2" href="/admin/actividades" loading={loading} />
      </div>

      {/* Quick links */}
      <div>
        <h2 className="text-base font-bold text-foreground mb-3">Acceso rápido</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { href: '/admin/actividades', icon: Activity,  label: 'Actividades', desc: 'Crear y gestionar trabajos' },
            { href: '/admin/hoteles',     icon: Building2, label: `Hoteles (${loading ? '…' : stats.hotels})`, desc: 'Administrar hoteles' },
            { href: '/admin/operaciones', icon: Tag,       label: `Operaciones (${loading ? '…' : stats.opTypes})`, desc: 'Tipos y colores' },
          ].map(({ href, icon: Icon, label, desc }) => (
            <Link key={href} href={href} className="fm-card fm-card-hover flex items-center gap-4 px-4 sm:px-5 py-4 rounded-xl border border-border bg-card shadow-xs group min-h-[44px]">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110 bg-fm-green-100 text-fm-green-800 dark:bg-fm-green-950 dark:text-fm-green-300"
              >
                <Icon size={20} />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">{label}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent activities */}
      {recentActivities.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-foreground mb-3">Actividades recientes</h2>
          <div className="fm-card divide-y divide-border border border-border bg-card rounded-xl shadow-xs overflow-hidden">
            {recentActivities.map(a => (
              <div key={a.id} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 hover:bg-muted/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-foreground truncate">{a.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{format(parseISO(a.date), 'dd/MM/yyyy')}</div>
                </div>
                <div className="flex-shrink-0">
                  <StatusBadge status={a.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
