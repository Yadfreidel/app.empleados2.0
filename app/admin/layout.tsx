'use client'
// app/(admin)/layout.tsx — Layout compartido del panel administrador
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard, CalendarDays, Building2, Tag,
  LogOut, Menu, X, ChevronRight
} from 'lucide-react'
import Logo from '@/components/layout/Logo'
import Button from '@/components/ui/Button'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/admin/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/admin/actividades', label: 'Actividades', icon: CalendarDays },
  { href: '/admin/hoteles',     label: 'Hoteles',     icon: Building2 },
  { href: '/admin/operaciones', label: 'Operaciones', icon: Tag },
]

interface NavListProps {
  pathname: string
  onItemClick?: () => void
}

function NavList({ pathname, onItemClick }: NavListProps) {
  return (
    <nav className="flex flex-col gap-1 flex-1" aria-label="Navegación de administrador">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== '/admin' && pathname.startsWith(href))
        return (
          <Link
            key={href}
            href={href}
            onClick={onItemClick}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-fm text-sm font-semibold transition-all group min-h-[44px]',
              active
                ? 'bg-fm-green-700 text-white shadow-sm dark:bg-fm-green-800'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={18} className={cn(!active && 'text-muted-foreground group-hover:text-foreground')} />
            <span>{label}</span>
            {active && <ChevronRight size={15} className="ml-auto opacity-70" />}
          </Link>
        )
      })}
    </nav>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userEmail, setUserEmail]     = useState<string | null>(null)
  const [roleStatus, setRoleStatus]   = useState<'loading' | 'admin' | 'not_admin' | 'no_profile' | 'unauthenticated' | 'error'>('loading')

  // Get current user email and profile
  useEffect(() => {
    async function getUser() {
      try {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          setUserEmail(user.email ?? null)
          const { data: profile } = await supabase
            .from('profiles')
            .select('role, active')
            .eq('id', user.id)
            .maybeSingle()

          if (!profile) {
            setRoleStatus('no_profile')
          } else if (profile.role === 'admin' && profile.active) {
            setRoleStatus('admin')
          } else {
            setRoleStatus('not_admin')
          }
        } else {
          setUserEmail(null)
          setRoleStatus('unauthenticated')
        }
      } catch {
        setUserEmail(null)
        setRoleStatus('error')
      }
    }
    getUser()
  }, [])

  useEffect(() => {
    if (roleStatus === 'unauthenticated') router.replace('/login')
  }, [roleStatus, router])

  async function handleLogout() {
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch { /* ignore */ }
    router.push('/login')
  }

  if (roleStatus !== 'admin') {
    const statusMessage = roleStatus === 'loading' || roleStatus === 'unauthenticated'
      ? 'Verificando acceso…'
      : roleStatus === 'error'
      ? 'No se pudo verificar tu sesión. Revisa la conexión e inténtalo de nuevo.'
      : 'Esta sección requiere una cuenta de administrador activa.'

    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
        <p role="status" aria-live="polite">{statusMessage}</p>
        {roleStatus !== 'loading' && roleStatus !== 'unauthenticated' && (
          <Link href="/" className="text-sm text-primary underline underline-offset-4">
            Volver al calendario
          </Link>
        )}
      </main>
    )
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* ── Desktop Sidebar ── */}
      <aside className="hidden lg:flex flex-col w-60 xl:w-64 flex-shrink-0 h-screen sticky top-0 bg-card border-r border-border">
        {/* Logo & Theme Toggle */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <Link href="/">
            <Logo size="sm" />
          </Link>
          <ThemeToggle />
        </div>

        {/* Nav */}
        <div className="flex-1 px-3 py-4 overflow-y-auto">
          <NavList pathname={pathname} />
        </div>

        {/* User profile & Logout */}
        <div className="px-3 py-4 border-t border-border">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-semibold text-foreground truncate">{userEmail || '…'}</p>
            <p className="text-xs text-muted-foreground">
              {roleStatus === 'admin'
                ? 'Administrador'
                : roleStatus === 'loading'
                ? 'Verificando rol…'
                : roleStatus === 'no_profile'
                ? 'Sin perfil en BD'
                : 'Rol: Consulta'}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-fm text-sm font-semibold text-destructive hover:bg-destructive/10 transition-colors min-h-[44px]"
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ── Mobile Sheet Sidebar ── */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs z-40 lg:hidden fm-animate-fadein"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="fixed inset-y-0 left-0 w-72 max-w-[85vw] z-50 flex flex-col lg:hidden bg-card border-r border-border shadow-2xl fm-animate-scalein"
            role="dialog"
            aria-modal="true"
            aria-label="Menú de navegación"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <Logo size="sm" />
              <Button
                variant="ghost"
                size="icon"
                className="min-w-[44px] min-h-[44px]"
                onClick={() => setSidebarOpen(false)}
                aria-label="Cerrar menú"
              >
                <X size={20} />
              </Button>
            </div>
            <div className="flex-1 px-3 py-4 overflow-y-auto">
              <NavList pathname={pathname} onItemClick={() => setSidebarOpen(false)} />
            </div>
            <div className="px-3 py-4 border-t border-border">
              <div className="flex items-center justify-between px-3 py-1 mb-2">
                <div className="truncate">
                  <p className="text-xs font-semibold text-foreground truncate">{userEmail || '…'}</p>
                  <p className="text-xs text-muted-foreground">
                    {roleStatus === 'admin' ? 'Administrador' : 'Rol no admin'}
                  </p>
                </div>
                <ThemeToggle />
              </div>
              <button
                onClick={() => { setSidebarOpen(false); handleLogout() }}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-fm text-sm font-semibold text-destructive hover:bg-destructive/10 transition-colors min-h-[44px]"
              >
                <LogOut size={16} />
                Cerrar sesión
              </button>
            </div>
          </aside>
        </>
      )}

      {/* ── Main content area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center justify-between px-4 h-16 flex-shrink-0 sticky top-0 z-20 bg-card/90 border-b border-border backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Button
              id="btn-mobile-menu"
              variant="ghost"
              size="icon"
              className="min-w-[44px] min-h-[44px]"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu size={20} />
            </Button>
            <Logo size="sm" />
          </div>
          <ThemeToggle />
        </header>

        {/* Page content */}
        <main className="flex-1 fm-container py-6 md:py-8 w-full max-w-7xl mx-auto px-4 md:px-6">
          {children}
        </main>
      </div>
    </div>
  )
}
