import * as XLSX from 'xlsx'

export type AreaParseada = {
  nombre: string
  horario: string | null
  orden: number
  dias: number[]
}

export type CalendarioParseado = {
  titulo: string
  hotel: string | null
  anio: number | null
  mes: number | null
  areas: AreaParseada[]
  avisos: string[]
}

/** Fila leída de la tabla antes de unir duplicados (compartida por los lectores Excel y PDF). */
export type FilaArea = { nombre: string; horario: string | null; dias: number[] }

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}
const LETRA_DIA: Record<string, number> = { D: 0, L: 1, M: 2, MI: 3, J: 4, V: 5, S: 6 }
const texto = (valor: unknown) => (valor == null ? '' : String(valor).trim())

/** Excel guarda las horas como fracción del día (0.3333 = 8:00 AM). */
function horarioDeCelda(valor: unknown): string | null {
  if (typeof valor === 'number' && valor >= 0 && valor < 1) {
    const minutos = Math.round(valor * 24 * 60)
    const h = Math.floor(minutos / 60) % 24
    const m = String(minutos % 60).padStart(2, '0')
    return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`
  }
  return texto(valor) || null
}

export function leerTitulo(titulo: string) {
  const coincidencia = titulo.match(/SERVICIO\s+(.+?)\s*-\s*([A-Za-zÁÉÍÓÚáéíóú]+)\s+(\d{4})/i)
  if (!coincidencia) return { hotel: null, mes: null, anio: null }
  return {
    hotel: coincidencia[1].trim(),
    mes: MESES[coincidencia[2].toLowerCase()] ?? null,
    anio: Number(coincidencia[3]),
  }
}

/** Avisa si las columnas de días no encajan con el mes del título. */
export function avisosDeDias(
  titulo: string,
  anio: number | null,
  mes: number | null,
  columnas: { dia: number; letra: string }[],
): string[] {
  if (!anio || !mes) return []
  const avisos: string[] = []
  const diasDelMes = new Date(anio, mes, 0).getDate()
  const sobrantes = columnas.filter(({ dia }) => dia > diasDelMes).map(({ dia }) => dia)
  if (sobrantes.length) {
    avisos.push(`El Excel tiene días ${sobrantes.join(', ')} pero ${titulo.split('-').pop()?.trim()} solo tiene ${diasDelMes} días.`)
  }
  const errores = columnas.filter(({ dia, letra }) => {
    const l = letra.toUpperCase()
    return l in LETRA_DIA && dia <= diasDelMes && new Date(anio, mes - 1, dia).getDay() !== LETRA_DIA[l]
  })
  if (errores.length) {
    avisos.push(`Las letras de los días no coinciden con el mes del título en ${errores.length} columnas.`)
  }
  return avisos
}

/** Une áreas repetidas y avisa de las que no tienen fechas. */
export function armarAreas(filas: FilaArea[], avisos: string[]): AreaParseada[] {
  const areas: AreaParseada[] = []
  const vistos = new Map<string, number>()
  for (const fila of filas) {
    const clave = fila.nombre.toLowerCase()
    if (vistos.has(clave)) {
      const areaPrevia = areas[vistos.get(clave)!]
      avisos.push(`"${fila.nombre}" aparece dos veces; se unieron sus fechas en una sola área.`)
      areaPrevia.dias = [...new Set([...areaPrevia.dias, ...fila.dias])].sort((a, b) => a - b)
      continue
    }
    if (fila.dias.length === 0) avisos.push(`"${fila.nombre}" no tiene ninguna fecha marcada.`)
    vistos.set(clave, areas.length)
    areas.push({ nombre: fila.nombre, horario: fila.horario, orden: areas.length, dias: fila.dias })
  }
  return areas
}

export function parsearCalendarioExcel(buffer: ArrayBuffer | Buffer): CalendarioParseado {
  const libro = XLSX.read(buffer, { type: 'buffer' })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  if (!hoja) throw new Error('El archivo Excel no contiene hojas.')

  const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: null })
  const titulo = texto(filas.find((fila) => /calendario/i.test(texto(fila?.[0])))?.[0])
  const { hotel, mes, anio } = leerTitulo(titulo)
  const indiceEncabezado = filas.findIndex((fila) => /^[áa]reas?$/i.test(texto(fila?.[0])))
  if (indiceEncabezado < 0) throw new Error('No encontré la fila de encabezado con "Areas" en la columna A.')

  const encabezado = filas[indiceEncabezado]
  const letras = filas[indiceEncabezado - 1] ?? []
  const columnaHorario = encabezado.findIndex((valor) => /horario/i.test(texto(valor)))
  const columnasDia: { columna: number; dia: number }[] = []
  encabezado.forEach((valor, columna) => {
    const dia = Number(valor)
    if (Number.isInteger(dia) && dia >= 1 && dia <= 31) columnasDia.push({ columna, dia })
  })

  const avisos = avisosDeDias(titulo, anio, mes, columnasDia.map(({ columna, dia }) => ({ dia, letra: texto(letras[columna]) })))

  const filasArea: FilaArea[] = []
  for (let indice = indiceEncabezado + 1; indice < filas.length; indice++) {
    const fila = filas[indice]
    const nombre = texto(fila?.[0]).replace(/\s+/g, ' ')
    if (!nombre) break
    filasArea.push({
      nombre,
      horario: columnaHorario >= 0 ? horarioDeCelda(fila[columnaHorario]) : null,
      dias: columnasDia
        .filter(({ columna }) => texto(fila[columna]).toLowerCase() === 'x')
        .map(({ dia }) => dia),
    })
  }

  return { titulo, hotel, anio, mes, areas: armarAreas(filasArea, avisos), avisos }
}
