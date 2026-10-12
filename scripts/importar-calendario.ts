import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { parsearCalendarioExcel } from '../lib/calendario-hotel/parsear-excel'

try {
  process.loadEnvFile('.env.local')
} catch {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= ''
}

const argumentos = process.argv.slice(2)
const archivo = argumentos.find((argumento) => !argumento.startsWith('--'))
const opcion = (nombre: string) => {
  const indice = argumentos.indexOf(`--${nombre}`)
  return indice >= 0 && argumentos[indice + 1] && !argumentos[indice + 1].startsWith('--')
    ? argumentos[indice + 1]
    : null
}
const bandera = (nombre: string) => argumentos.includes(`--${nombre}`)

async function main() {
  if (!archivo) throw new Error('Indica la ruta del Excel.')
  const calendario = parsearCalendarioExcel(readFileSync(archivo))
  const nombreHotel = opcion('hotel') ?? calendario.hotel
  const [anio, mes] = (opcion('mes')?.split('-').map(Number) ?? [calendario.anio, calendario.mes]) as [number, number]
  if (!nombreHotel || !anio || !mes) throw new Error('No pude deducir hotel o mes: usa --hotel y --mes.')

  const avisosFecha = opcion('mes') ? [] : calendario.avisos.filter((aviso) => /días|letras/.test(aviso))
  calendario.avisos
    .filter((aviso) => !opcion('mes') || !/días|letras/.test(aviso))
    .forEach((aviso) => console.log(`Aviso: ${aviso}`))
  if (avisosFecha.length && !bandera('forzar')) {
    throw new Error('Las fechas no cuadran. Corrige el título, usa --mes AAAA-MM o añade --forzar.')
  }

  const diasDelMes = new Date(anio, mes, 0).getDate()
  const fecha = (dia: number) => `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  const total = calendario.areas.reduce((suma, area) => suma + area.dias.filter((dia) => dia <= diasDelMes).length, 0)
  console.log(`${calendario.titulo}\n${nombreHotel} · ${anio}-${String(mes).padStart(2, '0')} · ${calendario.areas.length} áreas · ${total} servicios`)
  if (bandera('prueba')) return

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !clave) throw new Error('Configura NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local.')
  const supabase = createClient(url, clave, { auth: { persistSession: false } })

  const busqueda = await supabase.from('hotels').select('id, name').ilike('name', nombreHotel).maybeSingle()
  if (busqueda.error) throw busqueda.error
  let hotel = busqueda.data
  if (!hotel) {
    const creado = await supabase.from('hotels').insert({ name: nombreHotel }).select('id, name').single()
    if (creado.error) throw creado.error
    hotel = creado.data
  }

  const { data: existentes, error: errorAreas } = await supabase.from('hotel_areas').select('id, nombre').eq('hotel_id', hotel.id)
  if (errorAreas) throw errorAreas
  const porNombre = new Map((existentes ?? []).map((area) => [area.nombre.toLowerCase(), area.id as string]))
  for (const area of calendario.areas) {
    const id = porNombre.get(area.nombre.toLowerCase())
    if (id) {
      const actualizada = await supabase.from('hotel_areas').update({ orden: area.orden, horario: area.horario }).eq('id', id)
      if (actualizada.error) throw actualizada.error
    } else {
      const creada = await supabase.from('hotel_areas')
        .insert({ hotel_id: hotel.id, nombre: area.nombre, horario: area.horario, orden: area.orden })
        .select('id').single()
      if (creada.error) throw creada.error
      porNombre.set(area.nombre.toLowerCase(), creada.data.id)
    }
  }

  const areaIds = calendario.areas.map((area) => porNombre.get(area.nombre.toLowerCase())!)
  if (bandera('reemplazar') && areaIds.length) {
    const borrados = await supabase.from('area_servicios').delete()
      .in('area_id', areaIds).gte('fecha', fecha(1)).lte('fecha', fecha(diasDelMes))
    if (borrados.error) throw borrados.error
  }

  const servicios = calendario.areas.flatMap((area) => area.dias
    .filter((dia) => dia <= diasDelMes)
    .map((dia) => ({ area_id: porNombre.get(area.nombre.toLowerCase())!, fecha: fecha(dia), estado: 'programado' })))
  if (servicios.length) {
    const guardados = await supabase.from('area_servicios')
      .upsert(servicios, { onConflict: 'area_id,fecha', ignoreDuplicates: true })
    if (guardados.error) throw guardados.error
  }
  console.log(`Importados ${servicios.length} servicios para ${hotel.name}.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})