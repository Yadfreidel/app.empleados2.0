'use client'
// components/perfil/MenuUsuario.tsx
// Avatar en el encabezado con el menú de usuario: Mi perfil, panel admin
// (solo administradores) y cerrar sesión.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LayoutDashboard, LogOut, UserRound } from 'lucide-react'
import Avatar from './Avatar'
import { cerrarSesion, nombreVisible, usePerfil } from '@/lib/perfil/perfil'

export default function MenuUsuario() {
  const { perfil, avatarUrl } = usePerfil()
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])

  if (!perfil) return null
  const nombre = nombreVisible(perfil)
  const item = 'flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold text-foreground hover:bg-muted'

  return (
    <div ref={caja} className="relative">
      <button type="button" onClick={() => setAbierto(v => !v)} aria-expanded={abierto} aria-haspopup="menu" aria-label={`Menú de ${nombre}`}
        className="flex min-h-[44px] items-center gap-2 rounded-full p-1 pr-1 hover:bg-muted sm:pr-3">
        <Avatar url={avatarUrl} nombre={nombre} tamano={34} />
        <span className="hidden max-w-[10rem] truncate text-sm font-semibold text-foreground sm:block">{nombre}</span>
      </button>
      {abierto && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-border bg-card p-2 shadow-lg fm-animate-scalein">
          <div className="flex items-center gap-3 border-b border-border px-2 pb-3 pt-1">
            <Avatar url={avatarUrl} nombre={nombre} tamano={44} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-foreground">{nombre}</p>
              <p className="truncate text-xs text-muted-foreground">{perfil.email}</p>
              <p className="text-[11px] font-semibold text-fm-navy-600 dark:text-fm-navy-300">{perfil.role === 'admin' ? 'Administrador' : 'Supervisor'}</p>
            </div>
          </div>
          <div className="pt-2">
            <Link href="/perfil" role="menuitem" onClick={() => setAbierto(false)} className={item}><UserRound size={16} /> Mi perfil</Link>
            {perfil.role === 'admin' && (
              <Link href="/admin/dashboard" role="menuitem" onClick={() => setAbierto(false)} className={item}><LayoutDashboard size={16} /> Panel de administración</Link>
            )}
            <button type="button" role="menuitem" className={`${item} text-red-700 dark:text-red-300`}
              onClick={() => { setAbierto(false); void cerrarSesion().then(() => router.push('/login')) }}>
              <LogOut size={16} /> Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
