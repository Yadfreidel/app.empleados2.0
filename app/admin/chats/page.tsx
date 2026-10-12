'use client'
// app/admin/chats/page.tsx — Bandeja de conversaciones por actividad
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { format, isToday, isYesterday } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, ArrowUpRight, Building2, CalendarDays, MessagesSquare, RefreshCw, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import ChatActividad from '@/components/chat/ChatActividad'
import { useBandejaChats, type ConversacionActividad } from '@/lib/chat/useBandejaChats'

function horaCorta(fecha: string) {
  const d = new Date(fecha)
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return 'Ayer'
  return format(d, 'dd/MM/yy')
}

function fechaActividad(fecha: string) {
  return format(new Date(`${fecha}T12:00:00`), "d 'de' MMM yyyy", { locale: es })
}

export default function ChatsPage() {
  return <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}><ChatsContent /></Suspense>
}

function ChatsContent() {
  const searchParams = useSearchParams()
  const [seleccionada, setSeleccionada] = useState<string | null>(searchParams.get('actividad'))
  const [busqueda, setBusqueda] = useState('')
  const [soloNoLeidos, setSoloNoLeidos] = useState(false)
  const { conversaciones, estado, totalNoLeidos, recargar } = useBandejaChats()

  const termino = busqueda.trim().toLowerCase()
  const visibles = conversaciones.filter(c =>
    (!soloNoLeidos || c.noLeidos > 0) &&
    (!termino || c.titulo.toLowerCase().includes(termino) || (c.hotel ?? '').toLowerCase().includes(termino)),
  )
  const actual = conversaciones.find(c => c.actividadId === seleccionada) ?? null

  return (
    <div className="space-y-4 fm-animate-fadein">
      <div className={cn('flex flex-wrap items-center justify-between gap-3', seleccionada && 'hidden lg:flex')}>
        <div>
          <h1 className="text-xl md:text-2xl font-800 text-foreground">Chats</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Conversaciones de los supervisores en cada actividad</p>
        </div>
      </div>

      <div className="flex h-[calc(100dvh-9rem)] min-h-[480px] overflow-hidden rounded-xl border border-border bg-card shadow-xs lg:h-[calc(100dvh-12rem)]">
        {/* ── Lista de conversaciones ── */}
        <aside className={cn('flex w-full flex-col border-border lg:w-[360px] lg:shrink-0 lg:border-r', seleccionada && 'hidden lg:flex')}>
          <div className="space-y-2 border-b border-border p-3">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input className="fm-input pl-10" placeholder="Buscar actividad u hotel…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            </div>
            <div className="flex items-center gap-1">
              {[
                { id: false, label: 'Todas' },
                { id: true, label: `Sin leer${totalNoLeidos ? ` (${totalNoLeidos})` : ''}` },
              ].map(f => (
                <button key={String(f.id)} type="button" onClick={() => setSoloNoLeidos(f.id)} aria-pressed={soloNoLeidos === f.id}
                  className={cn('min-h-[36px] rounded-full px-3 text-xs font-semibold transition-colors',
                    soloNoLeidos === f.id ? 'bg-fm-green-700 text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}>
                  {f.label}
                </button>
              ))}
              <button type="button" onClick={() => void recargar()} className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Actualizar">
                <RefreshCw size={15} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {estado === 'cargando' && (
              <div className="space-y-2 p-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
            )}
            {estado === 'no_disponible' && (
              <p className="p-4 text-sm text-muted-foreground">
                El chat aún no está instalado. Ejecuta <code className="font-mono text-xs">006_chat_actividades.sql</code> en Supabase.
              </p>
            )}
            {estado === 'error' && (
              <p className="p-4 text-sm text-muted-foreground">
                No se pudieron cargar los chats. <button type="button" className="font-semibold underline" onClick={() => void recargar()}>Reintentar</button>
              </p>
            )}
            {estado === 'listo' && visibles.length === 0 && (
              <div className="p-4">
                <EmptyState
                  icon={MessagesSquare}
                  title={termino || soloNoLeidos ? 'Sin resultados' : 'Aún no hay conversaciones'}
                  description={termino || soloNoLeidos
                    ? 'Prueba con otra búsqueda o filtro.'
                    : 'Aparecen aquí cuando alguien escribe en el chat de una actividad. Para iniciar una, usa el botón de chat en Actividades.'}
                />
              </div>
            )}
            {estado === 'listo' && visibles.length > 0 && (
              <ul className="divide-y divide-border">
                {visibles.map(c => (
                  <li key={c.actividadId}>
                    <FilaConversacion conversacion={c} activa={c.actividadId === seleccionada} onClick={() => setSeleccionada(c.actividadId)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* ── Conversación seleccionada ── */}
        <section className={cn('min-w-0 flex-1 flex-col', seleccionada ? 'flex' : 'hidden lg:flex')}>
          {seleccionada ? (
            <>
              <header className="flex items-center gap-2 border-b border-border px-2 py-2 sm:px-4">
                <button type="button" onClick={() => setSeleccionada(null)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted lg:hidden" aria-label="Volver a la lista">
                  <ArrowLeft size={20} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{actual?.titulo ?? 'Actividad'}</p>
                  {actual && (
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {actual.hotel && <span className="flex items-center gap-1"><Building2 size={12} />{actual.hotel}</span>}
                      <span className="flex items-center gap-1"><CalendarDays size={12} />{fechaActividad(actual.fecha)}</span>
                    </p>
                  )}
                </div>
                {actual && <span className="hidden sm:block"><StatusBadge status={actual.estado} /></span>}
                <Link href={`/admin/actividades?actividad=${seleccionada}`}
                  className="inline-flex min-h-[40px] shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-emerald-700 hover:bg-muted dark:text-emerald-400">
                  <span className="hidden sm:inline">Ver actividad</span><ArrowUpRight size={15} />
                </Link>
              </header>
              <div className="min-h-0 flex-1 p-2 sm:p-3">
                <ChatActividad key={seleccionada} actividadId={seleccionada} abierto alto="h-full" />
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-muted-foreground">
              <MessagesSquare size={36} className="mb-3 opacity-50" />
              <p className="font-semibold text-foreground">Selecciona una conversación</p>
              <p className="mt-1 text-sm">Lee los mensajes y fotos de los supervisores y responde desde aquí.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function FilaConversacion({ conversacion: c, activa, onClick }: { conversacion: ConversacionActividad; activa: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-current={activa ? 'true' : undefined}
      className={cn('flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/60', activa && 'bg-emerald-50 dark:bg-emerald-950/40')}>
      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.colorTipo ?? '#16a34a' }} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn('truncate text-sm text-foreground', c.noLeidos > 0 ? 'font-bold' : 'font-semibold')}>{c.titulo}</span>
          <span className={cn('shrink-0 text-[11px]', c.noLeidos > 0 ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>
            {horaCorta(c.ultimoEn)}
          </span>
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {c.hotel ?? '—'} · {fechaActividad(c.fecha)}
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className={cn('truncate text-xs', c.noLeidos > 0 ? 'text-foreground' : 'text-muted-foreground')}>
            <span className="font-medium">{c.ultimoEsMio ? 'Tú' : c.ultimoAutor ?? 'Usuario'}:</span> {c.ultimoTexto}
          </span>
          {c.noLeidos > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[11px] font-bold text-white" aria-label={`${c.noLeidos} sin leer`}>
              {c.noLeidos > 99 ? '99+' : c.noLeidos}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}
