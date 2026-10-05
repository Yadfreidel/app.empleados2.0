'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { parsearCalendarioExcel } from './parsear-excel'

export type ResultadoImportacion =
  | { ok: true; servicios: number; areas: number; avisos: string[] }
  | { ok: false; error: string; avisos?: string[] }

export async function importarCalendarioExcel(_: unknown, form: FormData): Promise<ResultadoImportacion> {
  const archivo = form.get('archivo')
  const hotelId = String(form.get('hotelId') ?? '')
  const [anio, mes] = String(form.get('mes') ?? '').split('-').map(Number)
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: 'Selecciona un archivo .xlsx.' }
  if (!hotelId || !anio || mes < 1 || mes > 12) return { ok: false, error: 'Elige el hotel y el mes.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Inicia sesión como administrador para importar.' }
  const { data: perfil } = await supabase.from('profiles').select('role, active').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin' || perfil.active !== true) {
    return { ok: false, error: 'Solo un administrador activo puede importar calendarios.' }
  }

  let calendario
  try {
    calendario = parsearCalendarioExcel(Buffer.from(await archivo.arrayBuffer()))
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo leer el Excel.' }
  }

  const diasDelMes = new Date(anio, mes, 0).getDate()
  const fecha = (dia: number) => `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  const { data: existentes, error: errorAreas } = await supabase
    .from('hotel_areas').select('id, nombre').eq('hotel_id', hotelId)
  if (errorAreas) return { ok: false, error: 'No tienes permiso o el hotel no existe.' }

  const porNombre = new Map((existentes ?? []).map((area) => [area.nombre.toLowerCase(), area.id as string]))
  for (const area of calendario.areas) {
    const id = porNombre.get(area.nombre.toLowerCase())
    const resultado = id
      ? await supabase.from('hotel_areas').update({ orden: area.orden, horario: area.horario })
        .eq('id', id).select('id').single()
      : await supabase.from('hotel_areas').insert({
        hotel_id: hotelId, nombre: area.nombre, horario: area.horario, orden: area.orden,
      }).select('id').single()
    if (resultado.error) return { ok: false, error: `No se pudo guardar el área "${area.nombre}".` }
    porNombre.set(area.nombre.toLowerCase(), resultado.data.id)
  }

  const areaIds = [...porNombre.values()]
  if (form.get('reemplazar') && areaIds.length) {
    const { error } = await supabase.from('area_servicios').delete()
      .in('area_id', areaIds).gte('fecha', fecha(1)).lte('fecha', fecha(diasDelMes))
    if (error) return { ok: false, error: 'No se pudieron reemplazar los servicios existentes.' }
  }

  const filas = calendario.areas.flatMap((area) => area.dias
    .filter((dia) => dia <= diasDelMes)
    .map((dia) => ({ area_id: porNombre.get(area.nombre.toLowerCase())!, fecha: fecha(dia), estado: 'programado' })))
  if (filas.length) {
    const { error } = await supabase.from('area_servicios')
      .upsert(filas, { onConflict: 'area_id,fecha', ignoreDuplicates: true })
    if (error) return { ok: false, error: 'No se pudieron guardar los servicios.', avisos: calendario.avisos }
  }

  revalidatePath(`/admin/hoteles/${hotelId}/calendario`)
  revalidatePath('/')
  return {
    ok: true,
    servicios: filas.length,
    areas: calendario.areas.length,
    avisos: calendario.avisos.filter((aviso) => !/días|letras/.test(aviso)),
  }
}