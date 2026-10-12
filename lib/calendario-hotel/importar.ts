'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parsearCalendarioExcel, type AreaParseada } from './parsear-excel'

export type ResultadoImportacion =
  | { ok: true; servicios: number; areas: number; avisos: string[] }
  | { ok: false; error: string; avisos?: string[] }

type Supabase = Awaited<ReturnType<typeof createClient>>

async function verificarAdmin(): Promise<{ supabase: Supabase } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Inicia sesión como administrador para importar.' }
  const { data: perfil } = await supabase.from('profiles').select('role, active').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin' || perfil.active !== true) {
    return { error: 'Solo un administrador activo puede importar calendarios.' }
  }
  return { supabase }
}

/** Guarda áreas y servicios del mes. Compartido por la importación desde Excel y desde PDF. */
async function guardarCalendario(
  supabase: Supabase,
  hotelId: string,
  anio: number,
  mes: number,
  areas: AreaParseada[],
  avisos: string[],
  reemplazar: boolean,
): Promise<ResultadoImportacion> {
  const diasDelMes = new Date(anio, mes, 0).getDate()
  const fecha = (dia: number) => `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  const { data: existentes, error: errorAreas } = await supabase
    .from('hotel_areas').select('id, nombre').eq('hotel_id', hotelId)
  if (errorAreas) return { ok: false, error: 'No tienes permiso o el hotel no existe.' }

  const porNombre = new Map((existentes ?? []).map((area) => [area.nombre.toLowerCase(), area.id as string]))
  for (const area of areas) {
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
  if (reemplazar && areaIds.length) {
    const { error } = await supabase.from('area_servicios').delete()
      .in('area_id', areaIds).gte('fecha', fecha(1)).lte('fecha', fecha(diasDelMes))
    if (error) return { ok: false, error: 'No se pudieron reemplazar los servicios existentes.' }
  }

  const filas = areas.flatMap((area) => area.dias
    .filter((dia) => dia <= diasDelMes)
    .map((dia) => ({ area_id: porNombre.get(area.nombre.toLowerCase())!, fecha: fecha(dia), estado: 'programado' })))
  if (filas.length) {
    const { error } = await supabase.from('area_servicios')
      .upsert(filas, { onConflict: 'area_id,fecha', ignoreDuplicates: true })
    if (error) return { ok: false, error: 'No se pudieron guardar los servicios.', avisos }
  }

  revalidatePath(`/admin/hoteles/${hotelId}/calendario`)
  revalidatePath('/')
  return {
    ok: true,
    servicios: filas.length,
    areas: areas.length,
    avisos: avisos.filter((aviso) => !/días|letras/.test(aviso)),
  }
}

export async function importarCalendarioExcel(_: unknown, form: FormData): Promise<ResultadoImportacion> {
  const archivo = form.get('archivo')
  const hotelId = String(form.get('hotelId') ?? '')
  const [anio, mes] = String(form.get('mes') ?? '').split('-').map(Number)
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: 'Selecciona un archivo .xlsx.' }
  if (!hotelId || !anio || mes < 1 || mes > 12) return { ok: false, error: 'Elige el hotel y el mes.' }

  const acceso = await verificarAdmin()
  if ('error' in acceso) return { ok: false, error: acceso.error }

  let calendario
  try {
    calendario = parsearCalendarioExcel(Buffer.from(await archivo.arrayBuffer()))
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo leer el Excel.' }
  }

  return guardarCalendario(acceso.supabase, hotelId, anio, mes, calendario.areas, calendario.avisos, Boolean(form.get('reemplazar')))
}

// El PDF se lee en el navegador (pdf.js); aquí se valida lo recibido antes de guardar.
const esquemaParseado = z.object({
  hotelId: z.string().uuid(),
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  reemplazar: z.boolean().optional().default(false),
  avisos: z.array(z.string().max(500)).max(200).default([]),
  areas: z.array(z.object({
    nombre: z.string().trim().min(1).max(200),
    horario: z.string().trim().max(100).nullable(),
    orden: z.number().int().min(0).max(1000),
    dias: z.array(z.number().int().min(1).max(31)).max(31),
  })).min(1, 'El calendario no tiene áreas.').max(300),
})

export async function importarCalendarioParseado(input: unknown): Promise<ResultadoImportacion> {
  const validacion = esquemaParseado.safeParse(input)
  if (!validacion.success) return { ok: false, error: 'El calendario leído no es válido. Revisa el archivo.' }
  const { hotelId, mes: periodo, reemplazar, areas, avisos } = validacion.data
  const [anio, mes] = periodo.split('-').map(Number)

  const acceso = await verificarAdmin()
  if ('error' in acceso) return { ok: false, error: acceso.error }

  return guardarCalendario(acceso.supabase, hotelId, anio, mes, areas, avisos, reemplazar)
}
