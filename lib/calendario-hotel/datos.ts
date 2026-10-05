'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type EstadoServicio = 'programado' | 'realizado' | 'reprogramado' | 'cancelado'

export type AreaHotel = { id: string; nombre: string; horario: string | null; orden: number }
export type ServicioArea = {
  id: string
  area_id: string
  fecha: string
  estado: EstadoServicio
  notas: string | null
  confirmado_por: string | null
  confirmado_nombre: string | null
  confirmado_en: string | null
  confirmacion_nota: string | null
}

export type MatrizMensual = {
  hotel: { id: string; name: string }
  anio: number
  mes: number
  areas: AreaHotel[]
  servicios: ServicioArea[]
}

function rangoMes(anio: number, mes: number) {
  const mm = String(mes).padStart(2, '0')
  const ultimo = new Date(anio, mes, 0).getDate()
  return { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${ultimo}` }
}

async function esAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: perfil } = await supabase.from('profiles').select('role, active').eq('id', user.id).maybeSingle()
  return perfil?.role === 'admin' && perfil.active === true
}

export async function obtenerMatrizMensual(hotelId: string, anio: number, mes: number): Promise<MatrizMensual> {
  const supabase = await createClient()
  const { desde, hasta } = rangoMes(anio, mes)
  const [hotel, areas] = await Promise.all([
    supabase.from('hotels').select('id, name').eq('id', hotelId).single(),
    supabase.from('hotel_areas').select('id, nombre, horario, orden')
      .eq('hotel_id', hotelId).eq('activo', true).order('orden'),
  ])

  if (hotel.error) throw hotel.error
  if (areas.error) throw areas.error

  const ids = areas.data.map((area) => area.id)
  const servicios = ids.length
    ? await supabase.from('area_servicios')
      .select('id, area_id, fecha, estado, notas, confirmado_por, confirmado_nombre, confirmado_en, confirmacion_nota')
      .in('area_id', ids).gte('fecha', desde).lte('fecha', hasta)
    : { data: [], error: null }
  if (servicios.error) throw servicios.error

  return { hotel: hotel.data, anio, mes, areas: areas.data, servicios: servicios.data as ServicioArea[] }
}

const esquemaCelda = z.object({
  areaId: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  estadoActual: z.enum(['vacio', 'programado', 'realizado', 'reprogramado', 'cancelado']),
  ruta: z.string().startsWith('/'),
})

const siguienteEstado: Record<string, EstadoServicio | null> = {
  vacio: 'programado',
  programado: 'realizado',
  realizado: null,
  reprogramado: 'realizado',
  cancelado: null,
}

export async function alternarCelda(input: z.infer<typeof esquemaCelda>) {
  const { areaId, fecha, estadoActual, ruta } = esquemaCelda.parse(input)
  if (!(await esAdmin())) return { ok: false as const, error: 'Solo un administrador puede editar el calendario.' }

  const supabase = await createClient()
  const siguiente = siguienteEstado[estadoActual]
  const { error } = siguiente
    ? await supabase.from('area_servicios').upsert(
      { area_id: areaId, fecha, estado: siguiente },
      { onConflict: 'area_id,fecha' },
    )
    : await supabase.from('area_servicios').delete().eq('area_id', areaId).eq('fecha', fecha)

  if (error) return { ok: false as const, error: 'No se pudo guardar el servicio.' }
  revalidatePath(ruta)
  return { ok: true as const, estado: siguiente }
}

const fechaValida = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((valor) => {
  const fecha = new Date(`${valor}T00:00:00.000Z`)
  return Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
})

const esquemaConfirmacion = z.object({
  areaId: z.string().uuid(),
  fecha: fechaValida,
  nota: z.string().trim().max(500).optional().default(''),
})

export async function confirmarServicio(input: unknown) {
  const validacion = esquemaConfirmacion.safeParse(input)
  if (!validacion.success) return { ok: false as const, error: 'Los datos de confirmación no son válidos.' }

  const { areaId, fecha, nota } = validacion.data
  const supabase = await createClient()

  // Validar sesión (mínima: el RPC valida permisos en BD, fuente de verdad)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Inicia sesión para confirmar el servicio.' }

  // Llamada RPC transaccional: confirma + crea notificación en una sola TX.
  // El rol se verifica en la función SECURITY DEFINER contra public.profiles,
  // nunca contra user_metadata, para evitar escalación de privilegios.
  const { data: resultado, error } = await supabase.rpc('confirmar_y_notificar', {
    p_area_id: areaId,
    p_fecha:   fecha,
    p_nota:    nota || null,
  })

  if (error) return { ok: false as const, error: 'No se pudo confirmar el servicio.' }

  const res = resultado as { ok: boolean; error?: string; servicio?: ServicioArea }
  if (!res.ok) return { ok: false as const, error: res.error ?? 'No se pudo confirmar el servicio.' }

  revalidatePath('/')
  return { ok: true as const, servicio: res.servicio! }
}