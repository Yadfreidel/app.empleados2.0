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
  if (!validacion.success) {
    return { ok: false as const, error: 'Datos de confirmación inválidos.' }
  }

  const { activityId, nombre, nota } = validacion.data
  const supabase = await createClient()

  // 1. Obtener usuario actual si existe
  const { data: { user } } = await supabase.auth.getUser()
  let empleadoId: string | null = null
  let empleadoNombre = nombre.trim() || 'Empleado'

  if (user) {
    empleadoId = user.id
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, email')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.name) {
      empleadoNombre = profile.name
    } else if (profile?.email) {
      empleadoNombre = profile.email
    }
  }

  // 2. Obtener datos de la actividad
  const { data: act, error: actError } = await supabase
    .from('activities')
    .select('*, hotel:hotels(id, name), operation_type:operation_types(id, name)')
    .eq('id', activityId)
    .single()

  if (actError || !act) {
    return { ok: false as const, error: 'No se encontró la actividad.' }
  }

  const ahora = new Date().toISOString()

  // 3. Intentar RPC en base de datos si existe
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcResult, error: rpcError } = await (supabase.rpc as any)('confirmar_actividad_y_notificar', {
    p_actividad_id: activityId,
    p_nota: nota || null,
  })

  if (!rpcError && rpcResult?.ok) {
    revalidatePath('/')
    return { ok: true as const, activity: rpcResult.actividad as Activity }
  }

  // 4. Fallback resiliente: actualización directa + notificación
  const updatePayload: Record<string, unknown> = {
    status: 'completado',
    updated_at: ahora,
  }

  const { error: updateError } = await supabase
    .from('activities')
    .update({
      ...updatePayload,
      confirmado_por: empleadoId,
      confirmado_nombre: empleadoNombre,
      confirmado_en: ahora,
      confirmacion_nota: nota || null,
    })
    .eq('id', activityId)

  // Si falló por columnas no existentes en BD todavía, actualizamos solo status y notas
  if (updateError) {
    const notaAudit = `\n[Confirmado por: ${empleadoNombre} el ${new Date().toLocaleString('es-ES')}]${nota ? ' - ' + nota : ''}`
    const { error: fallbackErr } = await supabase
      .from('activities')
      .update({
        status: 'completado',
        notes: act.notes ? `${act.notes}${notaAudit}` : notaAudit,
        updated_at: ahora,
      })
      .eq('id', activityId)

    if (fallbackErr) {
      return { ok: false as const, error: 'No se pudo actualizar el estado de la actividad.' }
    }
  }

  // 5. Insertar en tabla notificaciones para alertar al administrador
  try {
    await supabase.from('notificaciones').insert({
      tipo: 'confirmacion',
      empleado_id: empleadoId,
      empleado_nombre: empleadoNombre,
      actividad_id: activityId,
      hotel_id: act.hotel_id,
      hotel_nombre: act.hotel?.name || 'Hotel',
      area_nombre: act.title,
      operacion_nombre: act.operation_type?.name || 'Operación',
      fecha_servicio: act.date,
      leida: false,
    })
  } catch (notifErr) {
    console.error('Error insertando notificación:', notifErr)
  }

  revalidatePath('/')

  const updatedActivity: Activity = {
    ...act,
    status: 'completado',
    confirmado_por: empleadoId,
    confirmado_nombre: empleadoNombre,
    confirmado_en: ahora,
    confirmacion_nota: nota || null,
  }

  return { ok: true as const, activity: updatedActivity }
}
