'use client'
// components/layout/BarraLateral.tsx
// Menú lateral azul marino del calendario (solo PC, ≥ lg). En el teléfono se
// usa el menú compacto del encabezado. Solo navega a rutas que ya existen.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, LayoutGrid, LogIn } from 'lucide-react'
import Logo from './Logo'

const ENLACES = [
  { href: '/', label: 'Calendario', icon: CalendarDays },
  { href: '/areas', label: 'Calendario por áreas', icon: LayoutGrid },
]

export default function BarraLateral() {
  const pathname = usePathname()
  return (
    <aside className="fm-sidebar hidden lg:flex sticky top-0 h-screen w-60 xl:w-64 shrink-0 flex-col border-r">
      <div className="px-5 py-5">
        <Link href="/" aria-label="Ir al calendario"><Logo size="sm" oscuro /></Link>
      </div>
      <nav aria-label="Navegación del calendario" className="flex flex-1 flex-col gap-1 px-3">
        {ENLACES.map(({ href, label, icon: Icon }) => {
          const activo = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link key={href} href={href} aria-current={activo ? 'page' : undefined}
              className={activo
                ? 'flex min-h-[44px] items-center gap-3 rounded-lg bg-fm-navy-700 px-3 text-sm font-semibold text-white shadow-sm'
                : 'flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white'}>
              <Icon size={18} /> {label}
            </Link>
          )
        })}
      </nav>
      <div className="space-y-3 border-t border-white/10 px-3 py-4">
        <Link href="/login"
          className="flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white">
          <LogIn size={18} /> Acceso administrador
        </Link>
        <p className="px-3 text-[11px] leading-snug text-slate-400">
          &copy; {new Date().getFullYear()} F&amp;M Fumigación<br />Sistema de gestión operativa
        </p>
      </div>
    </aside>
  )
}
