'use client'
// components/admin/configuracion/comunes.tsx
// Piezas compartidas por las secciones de Configuración.
import { useState, type ReactNode } from 'react'
import { AlertCircle, Check, CheckCircle2, Copy, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Tarjeta({ titulo, descripcion, children, acciones }: {
  titulo: string
  descripcion?: string
  children: ReactNode
  acciones?: ReactNode
}) {
  return (
    <section className="fm-card rounded-xl border border-border bg-card shadow-xs">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-foreground">{titulo}</h2>
          {descripcion && <p className="mt-0.5 text-sm text-muted-foreground">{descripcion}</p>}
        </div>
        {acciones}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

export function Interruptor({ id, activo, onChange, titulo, descripcion, disabled }: {
  id: string
  activo: boolean
  onChange: (valor: boolean) => void
  titulo: string
  descripcion?: string
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-semibold text-foreground">{titulo}</span>
        {descripcion && <span className="mt-0.5 block text-xs text-muted-foreground">{descripcion}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={activo}
        disabled={disabled}
        onClick={() => onChange(!activo)}
        className={cn(
          'relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
          activo ? 'bg-emerald-600' : 'bg-muted-foreground/30',
        )}
      >
        <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', activo ? 'translate-x-6' : 'translate-x-1')} />
      </button>
    </div>
  )
}

export function Alerta({ tipo, children }: { tipo: 'error' | 'exito' | 'aviso'; children: ReactNode }) {
  const estilos = {
    error: 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200',
    exito: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
    aviso: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200',
  }[tipo]
  const Icono = tipo === 'exito' ? CheckCircle2 : AlertCircle
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-2 rounded-lg border p-3 text-sm', estilos)}>
      <Icono size={17} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

const CARACTERES = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

export function generarContrasena(largo = 10) {
  const valores = crypto.getRandomValues(new Uint32Array(largo))
  return Array.from(valores, v => CARACTERES[v % CARACTERES.length]).join('')
}

export function CampoContrasena({ id, valor, onChange, disabled, autoComplete = 'new-password' }: {
  id: string
  valor: string
  onChange: (valor: string) => void
  disabled?: boolean
  autoComplete?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className="fm-input pr-11"
          value={valor}
          onChange={e => onChange(e.target.value)}
          minLength={8}
          maxLength={72}
          autoComplete={autoComplete}
          disabled={disabled}
        />
        <button type="button" onClick={() => setVisible(v => !v)}
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {autoComplete === 'new-password' && (
        <button type="button" onClick={() => { onChange(generarContrasena()); setVisible(true) }} disabled={disabled}
          className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50"
          aria-label="Generar contraseña">
          <RefreshCw size={14} /> <span className="hidden sm:inline">Generar</span>
        </button>
      )}
    </div>
  )
}

export function BotonCopiar({ texto, etiqueta = 'Copiar' }: { texto: string; etiqueta?: string }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2000)
    } catch { /* el navegador no permite copiar; el texto sigue visible */ }
  }
  return (
    <button type="button" onClick={copiar}
      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-muted">
      {copiado ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
      {copiado ? 'Copiado' : etiqueta}
    </button>
  )
}

export function esFuncionNoInstalada(error: { code?: string; message?: string } | null) {
  return !!error && (error.code === 'PGRST202' || error.code === '42883' || error.code === 'PGRST205' || error.code === '42P01')
}
