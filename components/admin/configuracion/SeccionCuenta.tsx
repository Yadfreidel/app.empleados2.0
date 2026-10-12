'use client'
// components/admin/configuracion/SeccionCuenta.tsx
// Cambio de contraseña de la cuenta con la sesión iniciada.
import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import { Alerta, CampoContrasena, Tarjeta } from './comunes'

export default function SeccionCuenta() {
  const [email, setEmail] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null)

  useEffect(() => {
    void createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null))
  }, [])

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setMensaje({ tipo: 'error', texto: 'La contraseña debe tener al menos 8 caracteres.' })
      return
    }
    if (password !== confirmacion) {
      setMensaje({ tipo: 'error', texto: 'Las contraseñas no coinciden.' })
      return
    }
    setGuardando(true)
    setMensaje(null)
    const { error } = await createClient().auth.updateUser({ password })
    setGuardando(false)
    if (error) {
      setMensaje({ tipo: 'error', texto: error.code === 'same_password' ? 'La nueva contraseña debe ser distinta de la actual.' : 'No se pudo cambiar la contraseña.' })
      return
    }
    setPassword('')
    setConfirmacion('')
    setMensaje({ tipo: 'exito', texto: 'Tu contraseña se cambió correctamente.' })
  }

  return (
    <Tarjeta titulo="Mi cuenta" descripcion={email ? `Sesión iniciada como ${email}` : undefined}>
      <form onSubmit={guardar} className="max-w-md space-y-4">
        {mensaje && <Alerta tipo={mensaje.tipo}>{mensaje.texto}</Alerta>}
        <div>
          <label htmlFor="cuenta-password" className="fm-label">Nueva contraseña</label>
          <CampoContrasena id="cuenta-password" valor={password} onChange={setPassword} disabled={guardando} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="cuenta-confirmacion" className="fm-label">Repite la nueva contraseña</label>
          <CampoContrasena id="cuenta-confirmacion" valor={confirmacion} onChange={setConfirmacion} disabled={guardando} autoComplete="off" />
        </div>
        <Button type="submit" loading={guardando} disabled={!password || !confirmacion} leftIcon={<KeyRound size={15} />} className="min-h-[44px]">
          Cambiar mi contraseña
        </Button>
      </form>
    </Tarjeta>
  )
}
