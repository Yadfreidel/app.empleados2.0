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

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}
const LETRA_DIA: Record<string, number> = { D: 0, L: 1, M: 2, MI: 3, J: 4, V: 5, S: 6 }
const texto = (valor: unknown) => (valor == null ? '' : String(valor).trim())

function leerTitulo(titulo: string) {
  const coincidencia = titulo.match(/SERVICIO\s+(.+?)\s*-\s*([A-Za-zÁÉÍÓÚáéíóú]+)\s+(\d{4})/i)
  if (!coincidencia) return { hotel: null, mes: null, anio: null }
  return {
    hotel: coincidencia[1].trim(),
    mes: MESES[coincidencia[2].toLowerCase()] ?? null,
    anio: Number(coincidencia[3]),
  }
}

export function parsearCalendarioExcel(buffer: ArrayBuffer | Buffer): CalendarioParseado {
  const libro = XLSX.read(buffer, { type: 'buffer' })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  if (!hoja) throw new Error('El archivo Excel no contiene hojas.')

  const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: null })
  const avisos: string[] = []
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

  if (anio && mes) {
    const diasDelMes = new Date(anio, mes, 0).getDate()
    const sobrantes = columnasDia.filter(({ dia }) => dia > diasDelMes).map(({ dia }) => dia)
    if (sobrantes.length) {
      avisos.push(`El Excel tiene días ${sobrantes.join(', ')} pero ${titulo.split('-').pop()?.trim()} solo tiene ${diasDelMes} días.`)
    }

    const errores = columnasDia.filter(({ columna, dia }) => {
      const letra = texto(letras[columna]).toUpperCase()
      return letra in LETRA_DIA && dia <= diasDelMes && new Date(anio, mes - 1, dia).getDay() !== LETRA_DIA[letra]
    })
    if (errores.length) {
      avisos.push(`Las letras de los días no coinciden con el mes del título en ${errores.length} columnas.`)
    }
  }

  const areas: AreaParseada[] = []
  const vistos = new Map<string, number>()
  for (let indice = indiceEncabezado + 1; indice < filas.length; indice++) {
    const fila = filas[indice]
    const nombre = texto(fila?.[0]).replace(/\s+/g, ' ')
    if (!nombre) break
    const dias = columnasDia
      .filter(({ columna }) => texto(fila[columna]).toLowerCase() === 'x')
      .map(({ dia }) => dia)
    const clave = nombre.toLowerCase()

    if (vistos.has(clave)) {
      const areaPrevia = areas[vistos.get(clave)!]
      avisos.push(`"${nombre}" aparece dos veces; se unieron sus fechas en una sola área.`)
      areaPrevia.dias = [...new Set([...areaPrevia.dias, ...dias])].sort((a, b) => a - b)
      continue
    }

    if (dias.length === 0) avisos.push(`"${nombre}" no tiene ninguna fecha marcada.`)
    vistos.set(clave, areas.length)
    areas.push({
      nombre,
      horario: columnaHorario >= 0 ? texto(fila[columnaHorario]) || null : null,
      orden: areas.length,
      dias,
    })
  }

  return { titulo, hotel, anio, mes, areas, avisos }
}