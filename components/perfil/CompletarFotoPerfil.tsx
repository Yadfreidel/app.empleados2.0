'use client'
// components/perfil/CompletarFotoPerfil.tsx
// Completar el registro: si la persona con sesión aún no tiene foto, se le
// pide al entrar (cuentas nuevas y actuales; no se borra ni recrea nada).
// No aparece sin conexión ni en la pantalla de inicio de sesión.
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut, UserRound } from 'lucide-react'
import SelectorFotoPerfil from './SelectorFotoPerfil'
import { cerrarSesion, nombreVisible, usePerfil } from '@/lib/perfil/perfil'

export default function CompletarFotoPerfil() {
  const { cargando, perfil, instalado } = usePerfil()
  const pathname = usePathname()
  const router = useRouter()
  const [enLinea, setEnLinea] = useState(true)

  useEffect(() => {
    const actualizar = () => setEnLinea(navigator.onLine)
    actualizar()
    window.addEventListener('online', actualizar)
    window.addEventListener('offline', actualizar)
    return () => { window.removeEventListener('online', actualizar); window.removeEventListener('offline', actualizar) }
  }, [])

  const pendiente = !cargando && instalado && enLinea && !!perfil && perfil.active && !perfil.avatar_path && !pathname.startsWith('/login')
  if (!pendiente) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-foto-perfil">
      <div className="max-h-[100dvh] w-full overflow-y-auto rounded-t-2xl bg-card p-5 shadow-2xl sm:max-w-md sm:rounded-2xl sm:p-6">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fm-navy-100 text-fm-navy-800 dark:bg-fm-navy-900 dark:text-white">
            <UserRound size={20} />
          </span>
          <div>
            <h2 id="titulo-foto-perfil" className="text-lg font-bold text-foreground">Completa tu registro</h2>
            <p className="text-sm text-muted-foreground">
              Hola, {nombreVisible(perfil)}. Para continuar, agrega una fotografía tuya. La verán tus compañeros y la administración.
            </p>
          </div>
        </div>
        <SelectorFotoPerfil nombre={nombreVisible(perfil)} fotoActual={null} />
        <button type="button" onClick={() => void cerrarSesion().then(() => router.push('/login'))}
          className="mx-auto mt-4 flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
          <LogOut size={15} /> Cerrar sesión
        </button>
      </div>
    </div>
  )
}
