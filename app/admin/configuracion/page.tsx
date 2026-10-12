'use client'
// app/admin/configuracion/page.tsx
import { useState } from 'react'
import { Users, SlidersHorizontal, UserCog, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import SeccionUsuarios from '@/components/admin/configuracion/SeccionUsuarios'
import SeccionGeneral from '@/components/admin/configuracion/SeccionGeneral'
import SeccionCuenta from '@/components/admin/configuracion/SeccionCuenta'
import SeccionSistema from '@/components/admin/configuracion/SeccionSistema'

const SECCIONES = [
  { id: 'usuarios', label: 'Usuarios', icon: Users },
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'cuenta', label: 'Mi cuenta', icon: UserCog },
  { id: 'sistema', label: 'Sistema', icon: Activity },
] as const

type Seccion = typeof SECCIONES[number]['id']

export default function ConfiguracionPage() {
  const [seccion, setSeccion] = useState<Seccion>('usuarios')

  return (
    <div className="space-y-6 fm-animate-fadein">
      <div>
        <h1 className="text-xl md:text-2xl font-800 text-foreground">Configuración</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Usuarios, datos de la empresa y ajustes de la app</p>
      </div>

      <div role="tablist" aria-label="Secciones de configuración"
        className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 sm:inline-grid sm:grid-cols-4">
        {SECCIONES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={`tab-config-${id}`}
            type="button"
            role="tab"
            aria-selected={seccion === id}
            onClick={() => setSeccion(id)}
            className={cn(
              'flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors',
              seccion === id ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-labelledby={`tab-config-${seccion}`}>
        {seccion === 'usuarios' && <SeccionUsuarios />}
        {seccion === 'general' && <SeccionGeneral />}
        {seccion === 'cuenta' && <SeccionCuenta />}
        {seccion === 'sistema' && <SeccionSistema />}
      </div>
    </div>
  )
}
