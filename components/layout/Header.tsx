'use client'
// components/layout/Header.tsx
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, LayoutDashboard, LayoutGrid, LogIn, Menu, X } from 'lucide-react'
import { useState } from 'react'
import Logo from './Logo'
import Button from '@/components/ui/Button'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { cn } from '@/lib/utils'
import NotificacionesCampana from './NotificacionesCampana'
import IndicadorSincronizacion from '@/components/offline/IndicadorSincronizacion'
import MenuUsuario from '@/components/perfil/MenuUsuario'
import { cerrarSesion, usePerfil } from '@/lib/perfil/perfil'
import { useRouter } from 'next/navigation'
import { UserRound } from 'lucide-react'

interface HeaderProps {
  isAdmin?: boolean
  onAdminLogout?: () => void
  /** En PC el logo y la navegación están en el menú lateral: el encabezado solo muestra el título y las acciones. */
  conBarraLateral?: boolean
  titulo?: string
}

export default function Header({ isAdmin, onAdminLogout, conBarraLateral, titulo }: HeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  // Con sesión iniciada se muestra el avatar y el menú de usuario en lugar del botón «Admin».
  const { perfil } = usePerfil()

  const navItems = isAdmin
    ? [
        { href: '/admin/dashboard',  label: 'Dashboard',    icon: LayoutDashboard },
        { href: '/admin/actividades', label: 'Actividades', icon: CalendarDays },
      ]
    : [
        { href: '/', label: 'Calendario', icon: CalendarDays },
        { href: '/areas', label: 'Calendario por áreas', icon: LayoutGrid },
      ]

  return (
    <header className="sticky top-0 z-30 w-full bg-card/90 border-b border-border backdrop-blur-md transition-colors">
      <div className={conBarraLateral ? 'w-full px-4 md:px-6 xl:px-8' : 'fm-container'}>
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className={cn('flex-shrink-0 focus-visible:outline-offset-4', conBarraLateral && 'lg:hidden')}>
            <Logo size="sm" />
          </Link>
          {conBarraLateral && titulo && (
            <p className="hidden lg:block text-lg font-bold tracking-tight text-foreground">{titulo}</p>
          )}

          {/* Desktop nav */}
          <nav className={cn('hidden md:flex items-center gap-1', conBarraLateral && 'lg:hidden')} aria-label="Navegación principal">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-fm text-sm font-semibold transition-colors min-h-[44px]',
                  pathname === href || (href !== '/' && pathname.startsWith(href))
                    ? 'bg-fm-green-100 text-fm-green-800 dark:bg-fm-green-950 dark:text-fm-green-300'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon size={16} />
                {label}
              </Link>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Estado de sincronización sin conexión */}
            <IndicadorSincronizacion />

            {/* Theme Toggle Button */}
            <ThemeToggle />

            {/* Campana de notificaciones (solo admin) */}
            <NotificacionesCampana isAdmin={!!isAdmin} />

            {perfil && !isAdmin ? (
              <MenuUsuario />
            ) : isAdmin ? (
              <Button variant="ghost" size="sm" onClick={onAdminLogout} className="hidden md:inline-flex min-h-[44px]">
                Cerrar sesión
              </Button>
            ) : (
              <Link href="/login" className="hidden md:inline-block">
                <Button variant="outline" size="sm" leftIcon={<LogIn size={14} />} className="min-h-[44px]">
                  Admin
                </Button>
              </Link>
            )}

            {/* Mobile menu toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden min-w-[44px] min-h-[44px]"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Menú"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-card fm-animate-fadein">
          <div className="fm-container py-3 flex flex-col gap-1">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-3 rounded-fm text-sm font-semibold transition-colors min-h-[44px]',
                  pathname === href || (href !== '/' && pathname.startsWith(href))
                    ? 'bg-fm-green-100 text-fm-green-800 dark:bg-fm-green-950 dark:text-fm-green-300'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            ))}
            <hr className="fm-divider my-2 border-border" />
            {isAdmin ? (
              <button
                onClick={() => { setMobileOpen(false); onAdminLogout?.() }}
                className="flex items-center gap-3 px-3 py-3 rounded-fm text-sm font-semibold text-destructive hover:bg-destructive/10 transition-colors w-full text-left min-h-[44px]"
              >
                Cerrar sesión
              </button>
            ) : perfil ? (
              <>
                <Link href="/perfil" onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-fm text-sm font-semibold text-foreground hover:bg-muted transition-colors min-h-[44px]">
                  <UserRound size={18} /> Mi perfil
                </Link>
                <button type="button" onClick={() => { setMobileOpen(false); void cerrarSesion().then(() => router.push('/login')) }}
                  className="flex items-center gap-3 px-3 py-3 rounded-fm text-sm font-semibold text-destructive hover:bg-destructive/10 transition-colors w-full text-left min-h-[44px]">
                  Cerrar sesión
                </button>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-fm text-sm font-semibold text-fm-green-700 dark:text-fm-green-400 hover:bg-fm-green-50 dark:hover:bg-fm-green-950/40 transition-colors min-h-[44px]"
              >
                <LogIn size={18} />
                Acceso administrador
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
