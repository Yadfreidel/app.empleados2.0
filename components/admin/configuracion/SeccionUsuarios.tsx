'use client'
// components/admin/configuracion/SeccionUsuarios.tsx
// Alta, edición, desactivación y cambio de contraseña de usuarios.
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { KeyRound, Pencil, Search, ShieldCheck, UserPlus, Users, HardHat } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { UserRole, UsuarioAdmin } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useConfiguracion } from '@/lib/configuracion/useConfiguracion'
import { llamarAdminUsuarios } from '@/lib/usuarios/adminUsuarios'
import { cn } from '@/lib/utils'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Alerta, BotonCopiar, CampoContrasena, Interruptor, Tarjeta, esFuncionNoInstalada, generarContrasena } from './comunes'

export const ROLES: Record<UserRole, { label: string; descripcion: string }> = {
  consulta: { label: 'Supervisor', descripcion: 'Ve el calendario, confirma actividades y usa el chat.' },
  admin: { label: 'Administrador', descripcion: 'Acceso completo al panel, incluida esta configuración.' },
}

function iniciales(u: UsuarioAdmin) {
  const base = (u.name || u.email).trim()
  return base.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?'
}

function textoCredenciales(empresa: string, nombre: string, email: string, password: string) {
  const url = typeof window !== 'undefined' ? `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/login` : ''
  return `Hola ${nombre}, estos son tus datos de acceso a la app de ${empresa}:\n\nEnlace: ${url}\nCorreo: ${email}\nContraseña temporal: ${password}`
}

export default function SeccionUsuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([])
  const [miId, setMiId] = useState<string | null>(null)
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'no_instalado' | 'error'>('cargando')
  const [busqueda, setBusqueda] = useState('')
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<UsuarioAdmin | null>(null)
  const [cambiandoClave, setCambiandoClave] = useState<UsuarioAdmin | null>(null)
  const [funcionLista, setFuncionLista] = useState<boolean | null>(null)

  const cargar = useCallback(async () => {
    const supabase = createClient()
    const [{ data: { user } }, { data, error }, funcion] = await Promise.all([
      supabase.auth.getUser(),
      supabase.rpc('admin_listar_usuarios'),
      llamarAdminUsuarios({ accion: 'estado' }),
    ])
    setMiId(user?.id ?? null)
    setFuncionLista(funcion.ok)
    if (error) {
      setEstado(esFuncionNoInstalada(error) ? 'no_instalado' : 'error')
      return
    }
    setUsuarios((data ?? []) as UsuarioAdmin[])
    setEstado('listo')
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => { void cargar() }, 0)
    return () => window.clearTimeout(t)
  }, [cargar])

  const termino = busqueda.trim().toLowerCase()
  const visibles = usuarios.filter(u => !termino || u.email.toLowerCase().includes(termino) || (u.name ?? '').toLowerCase().includes(termino))
  const activos = usuarios.filter(u => u.active)

  return (
    <Tarjeta
      titulo="Usuarios"
      descripcion="Crea cuentas para supervisores y administradores, y controla quién tiene acceso."
      acciones={estado === 'listo' && (
        <Button id="btn-nuevo-usuario" leftIcon={<UserPlus size={16} />} onClick={() => setCreando(true)} disabled={funcionLista === false} className="min-h-[44px]">
          Nuevo usuario
        </Button>
      )}
    >
      {estado === 'cargando' && (
        <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      )}
      {estado === 'no_instalado' && (
        <Alerta tipo="aviso">
          La gestión de usuarios necesita la migración <code className="font-mono text-xs">007_configuracion_y_usuarios.sql</code>.
          Ejecútala en Supabase → SQL Editor y vuelve a cargar esta página.
        </Alerta>
      )}
      {estado === 'error' && (
        <Alerta tipo="error">
          No se pudieron cargar los usuarios.{' '}
          <button type="button" className="font-semibold underline" onClick={() => { setEstado('cargando'); void cargar() }}>Reintentar</button>
        </Alerta>
      )}

      {estado === 'listo' && (
        <div className="space-y-4">
          {funcionLista === false && (
            <Alerta tipo="aviso">
              Para crear y editar usuarios falta desplegar la función <code className="font-mono text-xs">admin-usuarios</code> en Supabase.
              Sigue los pasos de <code className="font-mono text-xs">supabase/functions/README.md</code>. Mientras tanto solo puedes ver la lista.
            </Alerta>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-48 flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input className="fm-input pl-10" placeholder="Buscar por nombre o correo…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              {activos.length} activo{activos.length !== 1 ? 's' : ''} · {activos.filter(u => u.role === 'consulta').length} supervisor{activos.filter(u => u.role === 'consulta').length !== 1 ? 'es' : ''}
            </p>
          </div>

          {visibles.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center text-sm text-muted-foreground">
              <Users size={28} className="mb-2 opacity-60" />
              {termino ? 'Ningún usuario coincide con la búsqueda.' : 'Aún no hay usuarios.'}
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {visibles.map(u => (
                <li key={u.id} className={cn('flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap sm:p-4', !u.active && 'opacity-60')}>
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                    u.role === 'admin' ? 'bg-fm-green-700 text-white' : 'bg-muted text-foreground')}>
                    {iniciales(u)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-foreground">
                      <span className="truncate">{u.name || 'Sin nombre'}</span>
                      {u.id === miId && <span className="text-xs font-normal text-muted-foreground">(tú)</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        u.role === 'admin'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300')}>
                        {u.role === 'admin' ? <ShieldCheck size={11} /> : <HardHat size={11} />}
                        {ROLES[u.role]?.label ?? u.role}
                      </span>
                      {!u.active && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800 dark:bg-red-950 dark:text-red-300">Desactivado</span>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {u.last_sign_in_at
                          ? `Último acceso: ${format(new Date(u.last_sign_in_at), "d MMM yyyy, HH:mm", { locale: es })}`
                          : 'Nunca ha iniciado sesión'}
                      </span>
                    </div>
                  </div>
                  <div className="flex w-full justify-end gap-1 sm:w-auto">
                    <Button variant="ghost" size="sm" leftIcon={<KeyRound size={14} />} onClick={() => setCambiandoClave(u)} disabled={funcionLista === false} className="min-h-[40px]">
                      Contraseña
                    </Button>
                    <Button variant="ghost" size="sm" leftIcon={<Pencil size={14} />} onClick={() => setEditando(u)} disabled={funcionLista === false} className="min-h-[40px]">
                      Editar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ModalCrearUsuario abierto={creando} onCerrar={() => setCreando(false)} onCreado={cargar} />
      {editando && <ModalEditarUsuario usuario={editando} esYo={editando.id === miId} onCerrar={() => setEditando(null)} onGuardado={cargar} />}
      {cambiandoClave && <ModalContrasena usuario={cambiandoClave} onCerrar={() => setCambiandoClave(null)} />}
    </Tarjeta>
  )
}

function SelectorRol({ valor, onChange, disabled }: { valor: UserRole; onChange: (rol: UserRole) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Rol">
      {(Object.keys(ROLES) as UserRole[]).map(rol => (
        <button key={rol} type="button" role="radio" aria-checked={valor === rol} disabled={disabled} onClick={() => onChange(rol)}
          className={cn('rounded-xl border-2 p-3 text-left transition-colors disabled:opacity-50',
            valor === rol ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40' : 'border-border hover:bg-muted')}>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            {rol === 'admin' ? <ShieldCheck size={15} /> : <HardHat size={15} />} {ROLES[rol].label}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{ROLES[rol].descripcion}</span>
        </button>
      ))}
    </div>
  )
}

function ModalCrearUsuario({ abierto, onCerrar, onCreado }: { abierto: boolean; onCerrar: () => void; onCreado: () => void }) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(() => generarContrasena())
  const [rol, setRol] = useState<UserRole>('consulta')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creado, setCreado] = useState<{ nombre: string; email: string; password: string } | null>(null)
  const empresa = useConfiguracion().config.nombre_empresa

  function cerrar() {
    if (guardando) return
    onCerrar()
    setNombre(''); setEmail(''); setPassword(generarContrasena()); setRol('consulta'); setError(null); setCreado(null)
  }

  async function crear(e: FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    const res = await llamarAdminUsuarios({ accion: 'crear', email, password, nombre, rol })
    setGuardando(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setCreado({ nombre: nombre.trim(), email: email.trim().toLowerCase(), password })
    onCreado()
  }

  return (
    <Modal open={abierto} onClose={cerrar} title={creado ? 'Usuario creado' : 'Nuevo usuario'} maxWidth="lg"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row-reverse">
          {creado ? (
            <Button onClick={cerrar} className="w-full sm:w-auto min-h-[44px]">Listo</Button>
          ) : (
            <>
              <Button type="submit" form="form-nuevo-usuario" loading={guardando} className="w-full sm:w-auto min-h-[44px]" leftIcon={<UserPlus size={15} />}>
                Crear usuario
              </Button>
              <Button variant="secondary" onClick={cerrar} disabled={guardando} className="w-full sm:w-auto min-h-[44px]">Cancelar</Button>
            </>
          )}
        </div>
      }>
      {creado ? (
        <div className="space-y-4">
          <Alerta tipo="exito">La cuenta de <strong>{creado.nombre}</strong> está lista para usarse.</Alerta>
          <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4 text-sm">
            <p><span className="text-muted-foreground">Correo:</span> <span className="font-medium">{creado.email}</span></p>
            <p><span className="text-muted-foreground">Contraseña temporal:</span> <span className="font-mono font-semibold">{creado.password}</span></p>
          </div>
          <p className="text-xs text-muted-foreground">
            Compártele estos datos (por ejemplo por WhatsApp). Esta es la única vez que se muestra la contraseña; luego puede cambiarla desde Configuración → Mi cuenta.
          </p>
          <BotonCopiar texto={textoCredenciales(empresa, creado.nombre, creado.email, creado.password)} etiqueta="Copiar datos de acceso" />
        </div>
      ) : (
        <form id="form-nuevo-usuario" onSubmit={crear} className="space-y-4">
          {error && <Alerta tipo="error">{error}</Alerta>}
          <div>
            <label htmlFor="nuevo-nombre" className="fm-label">Nombre completo <span className="text-red-500">*</span></label>
            <input id="nuevo-nombre" className="fm-input" value={nombre} onChange={e => setNombre(e.target.value)} maxLength={100} required autoComplete="off" disabled={guardando} />
          </div>
          <div>
            <label htmlFor="nuevo-email" className="fm-label">Correo electrónico <span className="text-red-500">*</span></label>
            <input id="nuevo-email" type="email" inputMode="email" className="fm-input" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="off" disabled={guardando} />
          </div>
          <div>
            <label htmlFor="nuevo-password" className="fm-label">Contraseña temporal <span className="text-red-500">*</span></label>
            <CampoContrasena id="nuevo-password" valor={password} onChange={setPassword} disabled={guardando} />
            <p className="mt-1 text-xs text-muted-foreground">Mínimo 8 caracteres. Se generó una automáticamente.</p>
          </div>
          <div>
            <p className="fm-label">Rol</p>
            <SelectorRol valor={rol} onChange={setRol} disabled={guardando} />
          </div>
        </form>
      )}
    </Modal>
  )
}

function ModalEditarUsuario({ usuario, esYo, onCerrar, onGuardado }: {
  usuario: UsuarioAdmin
  esYo: boolean
  onCerrar: () => void
  onGuardado: () => void
}) {
  const [nombre, setNombre] = useState(usuario.name ?? '')
  const [rol, setRol] = useState<UserRole>(usuario.role)
  const [activo, setActivo] = useState(usuario.active)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    const res = await llamarAdminUsuarios({ accion: 'actualizar', id: usuario.id, nombre, rol, activo })
    setGuardando(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onGuardado()
    onCerrar()
  }

  return (
    <Modal open onClose={() => !guardando && onCerrar()} title="Editar usuario" maxWidth="lg"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row-reverse">
          <Button type="submit" form="form-editar-usuario" loading={guardando} className="w-full sm:w-auto min-h-[44px]">Guardar cambios</Button>
          <Button variant="secondary" onClick={onCerrar} disabled={guardando} className="w-full sm:w-auto min-h-[44px]">Cancelar</Button>
        </div>
      }>
      <form id="form-editar-usuario" onSubmit={guardar} className="space-y-4">
        {error && <Alerta tipo="error">{error}</Alerta>}
        <div>
          <p className="fm-label">Correo</p>
          <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">{usuario.email}</p>
        </div>
        <div>
          <label htmlFor="editar-nombre" className="fm-label">Nombre completo</label>
          <input id="editar-nombre" className="fm-input" value={nombre} onChange={e => setNombre(e.target.value)} maxLength={100} required disabled={guardando} />
        </div>
        <div>
          <p className="fm-label">Rol</p>
          <SelectorRol valor={rol} onChange={setRol} disabled={guardando || esYo} />
          {esYo && <p className="mt-1 text-xs text-muted-foreground">No puedes cambiar tu propio rol.</p>}
        </div>
        <div className="rounded-xl border border-border px-4">
          <Interruptor id="editar-activo" activo={activo} onChange={setActivo} disabled={guardando || esYo}
            titulo={activo ? 'Cuenta activa' : 'Cuenta desactivada'}
            descripcion={esYo ? 'No puedes desactivar tu propia cuenta.' : 'Una cuenta desactivada no puede iniciar sesión, confirmar actividades ni usar el chat.'} />
        </div>
      </form>
    </Modal>
  )
}

function ModalContrasena({ usuario, onCerrar }: { usuario: UsuarioAdmin; onCerrar: () => void }) {
  const [password, setPassword] = useState(() => generarContrasena())
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)
  const nombre = usuario.name || usuario.email
  const empresa = useConfiguracion().config.nombre_empresa

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    const res = await llamarAdminUsuarios({ accion: 'cambiar_contrasena', id: usuario.id, password })
    setGuardando(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setListo(true)
  }

  return (
    <Modal open onClose={() => !guardando && onCerrar()} title="Restablecer contraseña" maxWidth="md"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row-reverse">
          {listo ? (
            <Button onClick={onCerrar} className="w-full sm:w-auto min-h-[44px]">Listo</Button>
          ) : (
            <>
              <Button type="submit" form="form-contrasena" loading={guardando} className="w-full sm:w-auto min-h-[44px]">Cambiar contraseña</Button>
              <Button variant="secondary" onClick={onCerrar} disabled={guardando} className="w-full sm:w-auto min-h-[44px]">Cancelar</Button>
            </>
          )}
        </div>
      }>
      {listo ? (
        <div className="space-y-4">
          <Alerta tipo="exito">Contraseña actualizada para <strong>{nombre}</strong>.</Alerta>
          <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
            Nueva contraseña: <span className="font-mono font-semibold">{password}</span>
          </p>
          <BotonCopiar texto={textoCredenciales(empresa, nombre, usuario.email, password)} etiqueta="Copiar datos de acceso" />
        </div>
      ) : (
        <form id="form-contrasena" onSubmit={guardar} className="space-y-4">
          {error && <Alerta tipo="error">{error}</Alerta>}
          <p className="text-sm text-muted-foreground">Asigna una contraseña nueva a <strong className="text-foreground">{nombre}</strong>. Úsalo si olvidó la suya.</p>
          <div>
            <label htmlFor="contrasena-nueva" className="fm-label">Nueva contraseña</label>
            <CampoContrasena id="contrasena-nueva" valor={password} onChange={setPassword} disabled={guardando} />
          </div>
        </form>
      )}
    </Modal>
  )
}
