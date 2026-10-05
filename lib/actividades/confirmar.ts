'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Activity } from '@/types'

const schemaConfirmar = z.object({
  activityId: z.string().uuid(),
  nombre: z.string().trim().max(100).optional().default(''),
  nota: z.string().trim().max(500).optional().default(''),
})

export async function confirmarActividad(input: unknown) {
  const validacion = schemaConfirmar.safeParse(input)
  if (!validacion.success) return { ok: false as const, error: 'Datos de confirmación inválidos.' }

  const { activityId, nota } = validacion.data
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false as const, error: 'Inicia sesión para confirmar la actividad y notificar al administrador.' }

  const { data: act, error: actError } = await supabase
    .from('activities')
    .select('*, hotel:hotels(id, name), operation_type:operation_types(id, name)')
    .eq('id', activityId)
    .single()

  if (actError || !act) return { ok: false as const, error: 'No se encontró la actividad o no tienes permiso para verla.' }

  // La función guarda la actividad y la notificación en una única transacción.
  // Si falla cualquiera de las dos escrituras, ninguna queda aplicada.
  const { data: result, error: rpcError } = await supabase.rpc('confirmar_actividad_y_notificar', {
    p_actividad_id: activityId,
    p_nota: nota || null,
  })

  if (rpcError) {
    console.error('Error confirmando actividad y notificando:', rpcError)
    return {
      ok: false as const,
      error: rpcError.code === 'PGRST202' || rpcError.code === '42883'
        ? 'La confirmación con notificaciones aún no está habilitada. Solicita al administrador que complete la configuración.'
        : 'No se pudo guardar la confirmación y su notificación. Inténtalo de nuevo.',
    }
  }

  if (!result?.ok || !result.actividad || result.actividad.status !== 'completado') {
    return { ok: false as const, error: result?.error || 'No se pudo confirmar la actividad.' }
  }

  revalidatePath('/')
  revalidatePath('/admin/actividades')
  revalidatePath('/admin/dashboard')
  return { ok: true as const, activity: { ...act, ...result.actividad } as Activity }
}
