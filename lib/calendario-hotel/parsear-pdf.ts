// lib/calendario-hotel/parsear-pdf.ts
// Lee un calendario de servicio en PDF (el mismo formato del Excel, exportado a PDF).
// Reconstruye la tabla con la posición del texto y de los bordes de las celdas:
// Excel suele repartir la tabla en varias páginas (áreas en la primera, días en las
// siguientes) y partir nombres largos en dos líneas; ambos casos se unen aquí.
import { armarAreas, avisosDeDias, leerTitulo, type CalendarioParseado, type FilaArea } from './parsear-excel'

/** Texto con su posición. `top` es la línea base medida desde el borde superior. */
export type TextoPdf = { str: string; x: number; top: number; ancho: number; alto: number }
/** Segmento horizontal dibujado (borde de celda). */
export type BordePdf = { top: number; x1: number; x2: number }
export type PaginaPdf = { textos: TextoPdf[]; bordes: BordePdf[] }

const MARCAS = new Set(['x', '✓', '✔', '•', '●'])
const LETRAS = new Set(['D', 'L', 'M', 'MI', 'J', 'V', 'S', 'X'])
const esMarca = (t: TextoPdf) => MARCAS.has(t.str.trim().toLowerCase())
const numeroDia = (t: TextoPdf) => {
  const s = t.str.trim()
  if (!/^\d{1,2}$/.test(s)) return null
  const n = Number(s)
  return n >= 1 && n <= 31 ? n : null
}
const centro = (t: TextoPdf) => t.x + t.ancho / 2

function mediana(valores: number[]) {
  if (valores.length === 0) return 0
  const orden = [...valores].sort((a, b) => a - b)
  return orden[Math.floor(orden.length / 2)]
}

/** Agrupa textos que están en la misma línea horizontal. */
function agruparEnLineas(items: TextoPdf[], tolerancia = 2.5) {
  const lineas: TextoPdf[][] = []
  for (const item of [...items].sort((a, b) => a.top - b.top)) {
    const linea = lineas.find(l => Math.abs(l[0].top - item.top) <= tolerancia)
    if (linea) linea.push(item)
    else lineas.push([item])
  }
  return lineas.map(l => l.sort((a, b) => a.x - b.x))
}

type ColumnaDia = { dia: number; cx: number; letra: string }
type Encabezado = { top: number; columnas: ColumnaDia[]; separacion: number }

/** Busca la fila de números de día (1, 2, 3…) y la fila de letras encima. */
function buscarEncabezado(textos: TextoPdf[]): Encabezado | null {
  let mejor: TextoPdf[] | null = null
  for (const linea of agruparEnLineas(textos)) {
    const numeros = linea.filter(t => numeroDia(t) !== null)
    if (numeros.length >= 2 && numeros.length > (mejor?.length ?? 0)) {
      const crecientes = numeros.every((t, i) => i === 0 || numeroDia(t)! > numeroDia(numeros[i - 1])!)
      if (crecientes) mejor = numeros
    }
  }
  if (!mejor) return null
  const top = mediana(mejor.map(t => t.top))
  const centros = mejor.map(centro)
  const separacion = mediana(centros.slice(1).map((c, i) => c - centros[i])) || 20
  const letrasArriba = textos.filter(t => t.top < top - 1 && t.top > top - 30 && LETRAS.has(t.str.trim().toUpperCase()))
  const columnas = mejor.map(t => {
    const cx = centro(t)
    const letra = letrasArriba
      .filter(l => Math.abs(centro(l) - cx) < separacion / 2)
      .sort((a, b) => Math.abs(centro(a) - cx) - Math.abs(centro(b) - cx))[0]
    return { dia: numeroDia(t)!, cx, letra: letra?.str.trim() ?? '' }
  })
  return { top, columnas, separacion }
}

/** Une fragmentos que se solapan: "…SERVICIO DREAMS" + "ERVICIO DREAMS ONYX…". */
function unirFragmentos(fragmentos: string[]) {
  return fragmentos.reduce((acumulado, fragmento) => {
    for (let k = Math.min(acumulado.length, fragmento.length); k >= 3; k--) {
      if (acumulado.endsWith(fragmento.slice(0, k))) return acumulado + fragmento.slice(k)
    }
    return acumulado ? `${acumulado} ${fragmento}` : fragmento
  }, '')
}

/** El título puede venir partido entre páginas; se prueba cada fragmento y luego unidos. */
function buscarTitulo(paginas: PaginaPdf[], encabezados: (Encabezado | null)[]) {
  const candidatos = paginas.flatMap(p => p.textos.filter(t => /servicio|calendario/i.test(t.str)).map(t => t.str))
  const arriba = paginas.flatMap((p, i) => {
    const limite = encabezados[i]?.top ?? Infinity
    const textos = p.textos.filter(t => t.top < limite - 8 && /[a-z]/i.test(t.str))
    const altoMax = Math.max(0, ...textos.map(t => t.alto))
    return textos.filter(t => t.alto >= altoMax * 0.85).sort((a, b) => a.top - b.top || a.x - b.x).map(t => t.str.trim())
  })
  for (const texto of [...candidatos, unirFragmentos(arriba)]) {
    const datos = leerTitulo(texto)
    if (datos.mes && datos.anio) {
      const inicio = texto.search(/servicio/i)
      return { titulo: `CALENDARIO DE ${texto.slice(inicio).trim()}`, ...datos }
    }
  }
  return { titulo: '', ...leerTitulo('') }
}

type Linea = { texto: string; top: number; ancho: number; alto: number }

/** Filas delimitadas por los bordes horizontales que cruzan la columna de nombres. */
function filasPorBordes(lineas: Linea[], bordes: BordePdf[], izquierda: number, anchoColumna: number, topEncabezado: number) {
  const tops = bordes
    .filter(b => b.top > topEncabezado && b.x1 <= izquierda + 6 && b.x2 >= izquierda + anchoColumna * 0.5)
    .map(b => b.top)
    .sort((a, b) => a - b)
    .filter((t, i, arr) => i === 0 || t - arr[i - 1] > 1.5)
  if (tops.length < 3) return null
  const intervalos = tops.slice(1).map((fin, i) => ({ inicio: tops[i], fin }))
  const filas = intervalos
    .map(iv => ({ ...iv, lineas: lineas.filter(l => l.top > iv.inicio && l.top <= iv.fin).map(l => l.texto) }))
    .filter(f => f.lineas.length > 0)
  // Si muchas líneas quedan fuera de los bordes, estos no describen la tabla.
  const ubicadas = filas.reduce((n, f) => n + f.lineas.length, 0)
  if (filas.length === 0 || ubicadas < lineas.length * 0.6) return null
  return filas.map(f => ({ lineas: f.lineas, dentro: (top: number) => top > f.inicio && top <= f.fin + 1 }))
}

/** Respaldo sin bordes: separa filas con pistas del texto. */
function filasPorTexto(lineas: Linea[], anchoColumna: number, hayMarcaEn: (top: number) => boolean, ultimaMarca: number) {
  const altoLinea = mediana(lineas.map(l => l.alto)) || 9
  // Notas al pie: texto que desborda la columna, por debajo de la última marca.
  const utiles = lineas.filter(l => !(l.ancho > anchoColumna * 1.15 && l.top > ultimaMarca + altoLinea))
  const grupos: { lineas: string[]; top: number }[] = []
  utiles.forEach((linea, i) => {
    const previa = utiles[i - 1]
    let continua = false
    if (previa && grupos.length > 0 && linea.top - previa.top <= altoLinea * 1.6) {
      // Dos líneas con sus propias marcas son filas distintas, sea cual sea la alineación.
      if (!(hayMarcaEn(previa.top) && hayMarcaEn(linea.top))) {
        const primeraPalabra = linea.texto.split(' ')[0]
        const anchoPalabra = linea.ancho * (primeraPalabra.length / Math.max(linea.texto.length, 1))
        continua = previa.ancho + altoLinea * 0.3 + anchoPalabra > anchoColumna * 0.98
      }
    }
    if (continua) grupos[grupos.length - 1].lineas.push(linea.texto)
    else grupos.push({ lineas: [linea.texto], top: linea.top })
  })
  const fin = (utiles[utiles.length - 1]?.top ?? 0) + altoLinea * 2
  return grupos.map((g, i) => {
    const siguiente = grupos[i + 1]?.top ?? fin
    return { lineas: g.lineas, dentro: (top: number) => top >= g.top - 3 && top < siguiente - 3 }
  })
}

export function parsearCalendarioDesdePaginas(paginas: PaginaPdf[]): CalendarioParseado {
  if (paginas.every(p => p.textos.length === 0)) {
    throw new Error('El PDF no contiene texto (parece una imagen escaneada). Usa el Excel original o un PDF exportado desde Excel.')
  }

  const encabezados = paginas.map(p => buscarEncabezado(p.textos))
  if (encabezados.every(e => !e)) {
    throw new Error('No encontré la fila de días (1, 2, 3…) en el PDF. ¿Es un calendario de servicio exportado desde Excel?')
  }
  const { titulo, hotel, anio, mes } = buscarTitulo(paginas, encabezados)

  // La página con la columna "Areas" define las filas.
  const indiceAreas = paginas.findIndex(p => p.textos.some(t => /^[áa]reas?$/i.test(t.str.trim())))
  if (indiceAreas < 0 || !encabezados[indiceAreas]) {
    throw new Error('No encontré el encabezado "Areas" junto a la fila de días en el PDF.')
  }
  const paginaAreas = paginas[indiceAreas]
  const encabezado = encabezados[indiceAreas]!
  const primeraColumna = Math.min(...encabezado.columnas.map(c => c.cx)) - encabezado.separacion / 2
  const tituloHorario = paginaAreas.textos.find(t => /horario/i.test(t.str) && Math.abs(t.top - encabezado.top) < 6)
  const limiteNombres = tituloHorario ? tituloHorario.x - 1 : primeraColumna
  const debajo = (t: TextoPdf, enc: Encabezado) => t.top > enc.top + 3

  const textosNombre = paginaAreas.textos.filter(t =>
    debajo(t, encabezado) && t.x < limiteNombres && !esMarca(t) && numeroDia(t) === null)
  if (textosNombre.length === 0) throw new Error('No encontré nombres de áreas debajo del encabezado.')
  const izquierda = Math.min(...textosNombre.map(t => t.x))
  const anchoColumna = limiteNombres - izquierda
  const lineas: Linea[] = agruparEnLineas(textosNombre).map(l => ({
    texto: l.map(t => t.str.trim()).join(' ').replace(/\s+/g, ' '),
    top: mediana(l.map(t => t.top)),
    ancho: l[l.length - 1].x + l[l.length - 1].ancho - l[0].x,
    alto: Math.max(...l.map(t => t.alto)),
  }))

  // Marcas "x" de todas las páginas, ubicadas por día.
  const marcas: { dia: number; top: number }[] = []
  paginas.forEach((pagina, i) => {
    const enc = encabezados[i]
    if (!enc) return
    for (const t of pagina.textos) {
      if (!esMarca(t) || !debajo(t, enc)) continue
      const cx = centro(t)
      const columna = enc.columnas
        .filter(c => Math.abs(c.cx - cx) < enc.separacion * 0.6)
        .sort((a, b) => Math.abs(a.cx - cx) - Math.abs(b.cx - cx))[0]
      if (columna) marcas.push({ dia: columna.dia, top: t.top })
    }
  })

  const filas = filasPorBordes(lineas, paginaAreas.bordes, izquierda, anchoColumna, encabezado.top)
    ?? filasPorTexto(
      lineas,
      anchoColumna,
      top => marcas.some(m => Math.abs(m.top - top) <= 2.5),
      Math.max(0, ...marcas.map(m => m.top)),
    )
  const filaDe = (top: number) => filas.findIndex(f => f.dentro(top))

  const dias = filas.map(() => new Set<number>())
  for (const m of marcas) {
    const fila = filaDe(m.top)
    if (fila >= 0) dias[fila].add(m.dia)
  }

  // Horarios: texto entre la columna de nombres y la primera columna de días.
  const horarios = filas.map(() => [] as string[])
  if (tituloHorario) {
    for (const t of paginaAreas.textos) {
      if (!debajo(t, encabezado) || t.x < limiteNombres - 1 || centro(t) >= primeraColumna || esMarca(t)) continue
      const fila = filaDe(t.top)
      if (fila >= 0) horarios[fila].push(t.str.trim())
    }
  }

  let horariosIlegibles = 0
  const filasArea: FilaArea[] = filas.map((f, i) => {
    let horario = horarios[i].join(' ').trim() || null
    // Excel imprime "####" cuando la hora no cabe en la columna.
    if (horario && /^#+$/.test(horario)) { horariosIlegibles++; horario = null }
    return {
      nombre: f.lineas.join(' ').replace(/\s+/g, ' ').trim(),
      horario,
      dias: [...dias[i]].sort((a, b) => a - b),
    }
  })

  const columnas = encabezados.flatMap(e => e?.columnas ?? [])
  const unicas = [...new Map(columnas.map(c => [c.dia, c])).values()].sort((a, b) => a.dia - b.dia)
  const avisos = avisosDeDias(titulo, anio, mes, unicas).map(a => a.replace('El Excel tiene', 'El PDF tiene'))
  if (horariosIlegibles) {
    avisos.push(`${horariosIlegibles} horario(s) salen como "####" en el PDF (la columna era muy estrecha en Excel); quedarán vacíos. Usa el Excel para importarlos.`)
  }
  if (!titulo) avisos.push('No encontré el título con hotel, mes y año; revisa que el mes elegido sea el correcto.')
  const areas = armarAreas(filasArea, avisos)
  return { titulo, hotel, anio, mes, areas, avisos }
}

// ── Extracción con pdf.js ────────────────────────────────────────────────────

type Matriz = [number, number, number, number, number, number]
const multiplicar = (m: Matriz, n: Matriz): Matriz => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
]
const aplicar = (m: Matriz, x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

// Tipos mínimos de pdf.js para que la extracción funcione con la versión de navegador y la de Node.
interface PaginaPdfJs {
  getViewport(o: { scale: number }): { height: number }
  getTextContent(): Promise<{ items: unknown[] }>
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>
}
interface DocumentoPdfJs { numPages: number; getPage(n: number): Promise<PaginaPdfJs> }
type Ops = { save: number; restore: number; transform: number; constructPath: number }

/** Textos y bordes horizontales de cada página. */
export async function extraerPaginas(documento: DocumentoPdfJs, ops: Ops, maxPaginas = 20): Promise<PaginaPdf[]> {
  const paginas: PaginaPdf[] = []
  for (let n = 1; n <= Math.min(documento.numPages, maxPaginas); n++) {
    const pagina = await documento.getPage(n)
    const { height } = pagina.getViewport({ scale: 1 })
    const contenido = await pagina.getTextContent()
    const textos = contenido.items.flatMap(item => {
      const it = item as { str?: string; transform?: number[]; width?: number; height?: number }
      if (!it.str?.trim() || !it.transform) return []
      return [{ str: it.str, x: it.transform[4], top: height - it.transform[5], ancho: it.width ?? 0, alto: it.height ?? 0 }]
    })

    // Excel dibuja los bordes como rectángulos delgados; se guardan los horizontales.
    const bordes: BordePdf[] = []
    try {
      const lista = await pagina.getOperatorList()
      let ctm: Matriz = [1, 0, 0, 1, 0, 0]
      const pila: Matriz[] = []
      lista.fnArray.forEach((fn, i) => {
        const args = lista.argsArray[i]
        if (fn === ops.save) pila.push(ctm)
        else if (fn === ops.restore) ctm = pila.pop() ?? ctm
        else if (fn === ops.transform) ctm = multiplicar(ctm, args as Matriz)
        else if (fn === ops.constructPath) {
          const minMax = args?.[2] as ArrayLike<number> | undefined
          if (!minMax || minMax.length < 4) return
          const [ax, ay] = aplicar(ctm, minMax[0], minMax[1])
          const [bx, by] = aplicar(ctm, minMax[2], minMax[3])
          const alto = Math.abs(by - ay)
          const ancho = Math.abs(bx - ax)
          if (alto <= 2.5 && ancho >= 10) {
            bordes.push({ top: height - (ay + by) / 2, x1: Math.min(ax, bx), x2: Math.max(ax, bx) })
          }
        }
      })
    } catch {
      // Sin bordes se usa el método de respaldo basado en texto.
    }
    paginas.push({ textos, bordes })
  }
  return paginas
}

/** Lee un calendario en PDF desde el navegador. */
export async function parsearCalendarioPdf(datos: ArrayBuffer): Promise<CalendarioParseado> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const carga = pdfjs.getDocument({ data: new Uint8Array(datos) })
  try {
    return parsearCalendarioDesdePaginas(await extraerPaginas(await carga.promise, pdfjs.OPS))
  } finally {
    await carga.destroy()
  }
}
