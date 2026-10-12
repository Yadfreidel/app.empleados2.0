'use client'
// components/admin/configuracion/SeccionGeneral.tsx
// Datos de la empresa y reglas de confirmación/chat.
import { useEffect, useState, type FormEvent } from 'react'
import { Save } from 'lucide-react'
import { format } from 'date-fns'
import type { AppConfiguracion } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useConfiguracion, recargarConfiguracion } from '@/lib/configuracion/useConfiguracion'
import Button from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { Alerta, Interruptor, Tarjeta } from './comunes'

export default function SeccionGeneral() {
  const { config, instalada, cargando } = useConfiguracion()
  const [form, setForm] = useState<AppConfiguracion>(config)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null)

  useEffect(() => { setForm(config) }, [config])

  const set = <K extends keyof AppConfiguracion>(campo: K, valor: AppConfiguracion[K]) => {
    setForm(prev => ({ ...prev, [campo]: valor }))
    setMensaje(null)
  }
  const cambios = JSON.stringify(form) !== JSON.stringify(config)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!form.nombre_empresa.trim()) {
      setMensaje({ tipo: 'error', texto: 'El nombre de la empresa es obligatorio.' })
      return
    }
    setGuardando(true)
    setMensaje(null)
    const { error } = await createClient().from('app_configuracion').update({
      nombre_empresa: form.nombre_empresa.trim(),
      telefono_oficina: form.telefono_oficina?.trim() || null,
      correo_oficina: form.correo_oficina?.trim() || null,
      chat_habilitado: form.chat_habilitado,
      foto_obligatoria_confirmar: form.foto_obligatoria_confirmar,
      max_fotos_evidencia: form.max_fotos_evidencia,
    }).eq('id', 1)
    setGuardando(false)
    if (error) {
      setMensaje({ tipo: 'error', texto: 'No se pudo guardar la configuración. Revisa los datos e inténtalo de nuevo.' })
      return
    }
    await recargarConfiguracion()
    setMensaje({ tipo: 'exito', texto: 'Configuración guardada. Los teléfonos de los supervisores la aplican al recargar la app.' })
  }

  if (cargando) return <Skeleton className="h-96 rounded-xl" />
  if (!instalada) {
    return (
      <Tarjeta titulo="Configuración general">
        <Alerta tipo="aviso">
          Esta sección necesita la migración <code className="font-mono text-xs">007_configuracion_y_usuarios.sql</code>.
          Mientras tanto la app usa los valores por defecto.
        </Alerta>
      </Tarjeta>
    )
  }

  return (
    <form onSubmit={guardar} className="space-y-6">
      <Tarjeta titulo="Empresa" descripcion="Datos de contacto que verán los supervisores en el panel de confirmación.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="cfg-nombre" className="fm-label">Nombre de la empresa</label>
            <input id="cfg-nombre" className="fm-input" value={form.nombre_empresa} maxLength={80} required
              onChange={e => set('nombre_empresa', e.target.value)} disabled={guardando} />
          </div>
          <div>
            <label htmlFor="cfg-telefono" className="fm-label">Teléfono de la oficina</label>
            <input id="cfg-telefono" type="tel" inputMode="tel" className="fm-input" value={form.telefono_oficina ?? ''} maxLength={30}
              placeholder="Ej.: 809-555-0123" onChange={e => set('telefono_oficina', e.target.value)} disabled={guardando} />
          </div>
          <div>
            <label htmlFor="cfg-correo" className="fm-label">Correo de la oficina</label>
            <input id="cfg-correo" type="email" inputMode="email" className="fm-input" value={form.correo_oficina ?? ''} maxLength={120}
              onChange={e => set('correo_oficina', e.target.value)} disabled={guardando} />
          </div>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Confirmación de actividades y chat" descripcion="Reglas que aplican a los supervisores desde el teléfono.">
        <div className="divide-y divide-border">
          <Interruptor id="cfg-chat" activo={form.chat_habilitado} onChange={v => set('chat_habilitado', v)} disabled={guardando}
            titulo="Chat de actividades"
            descripcion="Permite enviar mensajes, fotos y PDFs en cada actividad. Al desactivarlo se oculta el chat; los mensajes no se borran." />
          <Interruptor id="cfg-foto" activo={form.foto_obligatoria_confirmar} onChange={v => set('foto_obligatoria_confirmar', v)}
            disabled={guardando || !form.chat_habilitado}
            titulo="Foto obligatoria al confirmar"
            descripcion={form.chat_habilitado
              ? 'El supervisor debe adjuntar al menos una foto de evidencia para confirmar la actividad.'
              : 'Requiere el chat activado, porque las fotos se guardan en el chat.'} />
          <div className="flex flex-wrap items-center justify-between gap-4 py-3">
            <label htmlFor="cfg-max-fotos" className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">Máximo de fotos de evidencia</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">Por confirmación (1 a 10).</span>
            </label>
            <input id="cfg-max-fotos" type="number" inputMode="numeric" min={1} max={10} className="fm-input w-24 text-center"
              value={form.max_fotos_evidencia} disabled={guardando}
              onChange={e => set('max_fotos_evidencia', Math.min(10, Math.max(1, Number(e.target.value) || 1)))} />
          </div>
        </div>
      </Tarjeta>

      <div className="space-y-3">
        {mensaje && <Alerta tipo={mensaje.tipo}>{mensaje.texto}</Alerta>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {config.updated_at && `Última modificación: ${format(new Date(config.updated_at), 'dd/MM/yyyy HH:mm')}`}
          </p>
          <Button type="submit" loading={guardando} disabled={!cambios} leftIcon={<Save size={15} />} className="min-h-[44px]">
            Guardar cambios
          </Button>
        </div>
      </div>
    </form>
  )
}
