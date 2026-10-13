'use client'
// components/admin/configuracion/SeccionSistema.tsx
// Comprueba qué piezas de Supabase (migraciones y Edge Function) están instaladas.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2, CircleAlert, Loader2, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { llamarAdminUsuarios } from '@/lib/usuarios/adminUsuarios'
import { llamarInformes } from '@/lib/informes/informes'
import Button from '@/components/ui/Button'
import { Tarjeta, esFuncionNoInstalada } from './comunes'

type Resultado = 'cargando' | 'ok' | 'falta' | 'error'

interface Chequeo {
  id: string
  nombre: string
  falta: ReactNode
  probar: () => Promise<Resultado>
}

async function probarConsulta(consulta: PromiseLike<{ error: { code?: string; message?: string } | null }>): Promise<Resultado> {
  const { error } = await consulta
  return !error ? 'ok' : esFuncionNoInstalada(error) ? 'falta' : 'error'
}

const migracion = (archivo: string) => (
  <>Falta ejecutar <code className="font-mono">supabase/migrations/{archivo}</code> en el SQL Editor.</>
)

const CHEQUEOS: Chequeo[] = [
  {
    id: 'notificaciones',
    nombre: 'Confirmación con notificaciones al administrador',
    falta: migracion('20261005165015_actividad_notificaciones_admin.sql'),
    probar: () => probarConsulta(createClient().from('notificaciones').select('id', { head: true, count: 'exact' }).limit(1)),
  },
  {
    id: 'chat',
    nombre: 'Chat de actividades con fotos',
    falta: migracion('006_chat_actividades.sql'),
    probar: () => probarConsulta(createClient().from('actividad_mensajes').select('id', { head: true, count: 'exact' }).limit(1)),
  },
  {
    id: 'config',
    nombre: 'Configuración y listado de usuarios',
    falta: migracion('007_configuracion_y_usuarios.sql'),
    probar: () => probarConsulta(createClient().rpc('admin_listar_usuarios').limit(1)),
  },
  {
    id: 'funcion',
    nombre: 'Creación y edición de usuarios (Edge Function)',
    falta: <>Falta desplegar <code className="font-mono">admin-usuarios</code>. Pasos en <code className="font-mono">supabase/functions/README.md</code>.</>,
    probar: async () => {
      const res = await llamarAdminUsuarios({ accion: 'estado' })
      return res.ok ? 'ok' : res.noDesplegada ? 'falta' : 'error'
    },
  },
  {
    id: 'informes',
    nombre: 'Informes de cierre con PDF descargable',
    falta: migracion('009_informes_cierre.sql'),
    probar: () => probarConsulta(createClient().from('informes_cierre').select('id', { head: true, count: 'exact' }).limit(1)),
  },
  {
    id: 'revision-informes',
    nombre: 'Revisión de informes por el supervisor',
    falta: migracion('010_informes_descarga_local.sql'),
    probar: () => probarConsulta(createClient().rpc('revisar_informe_cierre', { p_informe_id: '00000000-0000-0000-0000-000000000000', p_analisis: {}, p_nota: null })),
  },
  {
    id: 'funcion-informes',
    nombre: 'Análisis con IA de los informes (opcional, Edge Function)',
    falta: <>Falta desplegar <code className="font-mono">informes-cierre</code>. Pasos en <code className="font-mono">supabase/functions/README.md</code>.</>,
    probar: async () => {
      const res = await llamarInformes({ accion: 'estado' })
      return res.ok ? 'ok' : res.noDesplegada ? 'falta' : 'error'
    },
  },
  {
    id: 'claves-informes',
    nombre: 'Clave de IA para informes (opcional, en el servidor)',
    falta: <>Configura el secreto <code className="font-mono">ANTHROPIC_API_KEY</code> en Supabase → Edge Functions → Secrets.</>,
    probar: async () => {
      const res = await llamarInformes({ accion: 'estado' })
      if (!res.ok) return res.noDesplegada ? 'falta' : 'error'
      return res.datos.ia ? 'ok' : 'falta'
    },
  },
]

export default function SeccionSistema() {
  const [resultados, setResultados] = useState<Record<string, Resultado>>({})

  const comprobar = useCallback(async () => {
    setResultados({})
    const pares = await Promise.all(CHEQUEOS.map(async c => {
      try {
        return [c.id, await c.probar()] as const
      } catch {
        return [c.id, 'error' as Resultado] as const
      }
    }))
    setResultados(Object.fromEntries(pares))
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => { void comprobar() }, 0)
    return () => window.clearTimeout(t)
  }, [comprobar])

  const proyecto = (() => {
    try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname.split('.')[0] } catch { return '—' }
  })()

  return (
    <Tarjeta
      titulo="Estado del sistema"
      descripcion={`Proyecto de Supabase: ${proyecto}`}
      acciones={<Button variant="secondary" size="sm" leftIcon={<RefreshCw size={14} />} onClick={() => void comprobar()} className="min-h-[40px]">Comprobar</Button>}
    >
      <ul className="divide-y divide-border rounded-xl border border-border">
        {CHEQUEOS.map(c => {
          const r: Resultado = resultados[c.id] ?? 'cargando'
          return (
            <li key={c.id} className="flex items-start gap-3 p-3 sm:p-4">
              {r === 'cargando' && <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-muted-foreground" />}
              {r === 'ok' && <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />}
              {(r === 'falta' || r === 'error') && <CircleAlert size={18} className="mt-0.5 shrink-0 text-amber-600" />}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{c.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {r === 'cargando' && 'Comprobando…'}
                  {r === 'ok' && 'Instalado y funcionando.'}
                  {r === 'falta' && c.falta}
                  {r === 'error' && 'No se pudo comprobar. Revisa la conexión o los registros en Supabase.'}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </Tarjeta>
  )
}
