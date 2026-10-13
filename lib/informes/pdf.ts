// lib/informes/pdf.ts
// PDF del informe de cierre (A4), generado en el navegador para descargarlo.
// Usa el logo original de F&M tal cual (mismo PNG, sin recortes ni cambios de proporción).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import type { AnalisisInforme, CategoriaFotoInforme as Categoria } from '@/types'

const ETIQUETA_CATEGORIA: Record<Categoria, string> = {
  area: 'Área intervenida',
  hallazgo: 'Hallazgo / inspección',
  trabajo: 'Trabajo realizado',
  estado_final: 'Estado final',
  adicional: 'Evidencia',
}

const ETIQUETA_RESULTADO: Record<string, string> = {
  servicio_realizado: 'Servicio realizado',
  problema_resuelto: 'Problema resuelto (según el técnico)',
  requiere_seguimiento: 'Requiere seguimiento',
}

export interface FotoPdf {
  indice: number
  categoria: Categoria
  bytes: Uint8Array | null
}

export interface DatosPdf {
  numero: string
  hotel: string
  area: string
  operacion: string | null
  titulo: string
  fechaProgramada: string // YYYY-MM-DD
  servicio: string
  resultado: string
  observaciones: string | null
  /** Productos que el técnico mencionó (no se infieren de las fotos). */
  productos?: string | null
  tecnico: string
  cerradoEn: string // ISO
  analisis: AnalisisInforme
  fotos: FotoPdf[]
  revision: { nombre: string; fecha: string; nota: string | null } | null
  empresa: string
  zonaHoraria: string
  logoPng: Uint8Array
}

const VERDE = rgb(0.09, 0.5, 0.24)
const AZUL = rgb(0.1, 0.28, 0.6)
const TEXTO = rgb(0.12, 0.14, 0.17)
const GRIS = rgb(0.42, 0.45, 0.5)
const LINEA = rgb(0.85, 0.87, 0.9)
const FONDO = rgb(0.96, 0.97, 0.97)
const AMBAR = rgb(0.6, 0.38, 0.02)

const ANCHO = 595.28
const ALTO = 841.89
const MARGEN = 46
const CONTENIDO = ANCHO - MARGEN * 2
const PIE = 40

// Las fuentes estándar del PDF usan WinAnsi: se reemplaza lo que no se puede codificar.
const EXTRA_WINANSI = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')
export function limpiar(texto: string | null | undefined) {
  return (texto ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[‐-‒]/g, '-')
    .replace(/[′]/g, "'")
    .replace(/[  -​ ]/g, ' ')
    .split('')
    .filter(c => c === '\n' || (c >= ' ' && (c.charCodeAt(0) <= 0xff ? !(c >= '\u007f' && c < ' ') : EXTRA_WINANSI.has(c))))
    .join('')
}

function partirLineas(texto: string, fuente: PDFFont, tamano: number, ancho: number): string[] {
  const resultado: string[] = []
  for (const parrafo of limpiar(texto).split('\n')) {
    const palabras = parrafo.split(/\s+/).filter(Boolean)
    if (palabras.length === 0) { resultado.push(''); continue }
    let linea = ''
    for (let palabra of palabras) {
      // Palabras más largas que el ancho (URLs, códigos): se cortan.
      while (fuente.widthOfTextAtSize(palabra, tamano) > ancho) {
        let corte = palabra.length - 1
        while (corte > 1 && fuente.widthOfTextAtSize(palabra.slice(0, corte), tamano) > ancho) corte--
        if (linea) { resultado.push(linea); linea = '' }
        resultado.push(palabra.slice(0, corte))
        palabra = palabra.slice(corte)
      }
      const prueba = linea ? `${linea} ${palabra}` : palabra
      if (fuente.widthOfTextAtSize(prueba, tamano) <= ancho) linea = prueba
      else { resultado.push(linea); linea = palabra }
    }
    if (linea) resultado.push(linea)
  }
  return resultado
}

function formatearFechaHora(iso: string, zona: string) {
  return new Intl.DateTimeFormat('es-DO', {
    timeZone: zona, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
}
function formatearFecha(fecha: string) {
  const [a, m, d] = fecha.split('-')
  return `${d}/${m}/${a}`
}

function tipoImagen(bytes: Uint8Array): 'jpg' | 'png' | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  return null
}

class Lienzo {
  pagina!: PDFPage
  y = 0
  constructor(readonly doc: PDFDocument, readonly normal: PDFFont, readonly negrita: PDFFont, readonly cursiva: PDFFont,
    readonly logo: PDFImage, readonly numero: string, readonly empresa: string) {}

  nuevaPagina(primera = false) {
    this.pagina = this.doc.addPage([ANCHO, ALTO])
    this.y = ALTO - MARGEN
    if (!primera) {
      // Encabezado reducido en las páginas siguientes.
      const lado = 26
      this.pagina.drawImage(this.logo, { x: MARGEN, y: this.y - lado, width: lado, height: lado })
      this.pagina.drawText(limpiar(this.empresa), { x: MARGEN + lado + 8, y: this.y - 11, size: 9, font: this.negrita, color: TEXTO })
      this.pagina.drawText(limpiar(`Informe de cierre ${this.numero}`), { x: MARGEN + lado + 8, y: this.y - 22, size: 8, font: this.normal, color: GRIS })
      this.y -= lado + 8
      this.pagina.drawLine({ start: { x: MARGEN, y: this.y }, end: { x: ANCHO - MARGEN, y: this.y }, thickness: 0.8, color: LINEA })
      this.y -= 14
    }
  }

  asegurar(alto: number) {
    if (this.y - alto < MARGEN + PIE) this.nuevaPagina()
  }

  /** `siguiente`: alto mínimo del contenido que sigue, para no dejar el título solo al pie. */
  titulo(texto: string, siguiente = 40) {
    this.asegurar(30 + siguiente)
    this.y -= 6
    this.pagina.drawRectangle({ x: MARGEN, y: this.y - 14, width: 3, height: 14, color: VERDE })
    this.pagina.drawText(limpiar(texto).toUpperCase(), { x: MARGEN + 9, y: this.y - 11, size: 10.5, font: this.negrita, color: AZUL })
    this.y -= 24
  }

  parrafo(texto: string, opciones: { tamano?: number; fuente?: PDFFont; color?: ReturnType<typeof rgb>; sangria?: number; interlineado?: number } = {}) {
    const tamano = opciones.tamano ?? 9.5
    const fuente = opciones.fuente ?? this.normal
    const sangria = opciones.sangria ?? 0
    const alto = opciones.interlineado ?? tamano * 1.42
    for (const linea of partirLineas(texto, fuente, tamano, CONTENIDO - sangria)) {
      this.asegurar(alto)
      if (linea) this.pagina.drawText(linea, { x: MARGEN + sangria, y: this.y - tamano, size: tamano, font: fuente, color: opciones.color ?? TEXTO })
      this.y -= alto
    }
  }

  vinetas(items: string[], vacio: string) {
    if (items.length === 0) {
      this.parrafo(vacio, { fuente: this.cursiva, color: GRIS })
    } else {
      for (const item of items) {
        const lineas = partirLineas(item, this.normal, 9.5, CONTENIDO - 14)
        lineas.forEach((linea, i) => {
          this.asegurar(13.5)
          if (i === 0) this.pagina.drawCircle({ x: MARGEN + 4, y: this.y - 6.2, size: 1.7, color: VERDE })
          this.pagina.drawText(linea, { x: MARGEN + 14, y: this.y - 9.5, size: 9.5, font: this.normal, color: TEXTO })
          this.y -= 13.5
        })
        this.y -= 2
      }
    }
    this.y -= 6
  }

  /** Tabla de dos columnas etiqueta/valor. */
  tablaDatos(filas: [string, string][]) {
    const anchoEtiqueta = 128
    const anchoValor = CONTENIDO - anchoEtiqueta - 16
    for (const [i, [etiqueta, valor]] of filas.entries()) {
      const lineas = partirLineas(valor || '—', this.normal, 9.5, anchoValor)
      const alto = Math.max(1, lineas.length) * 13 + 8
      this.asegurar(alto)
      if (i % 2 === 0) this.pagina.drawRectangle({ x: MARGEN, y: this.y - alto, width: CONTENIDO, height: alto, color: FONDO })
      this.pagina.drawText(limpiar(etiqueta), { x: MARGEN + 8, y: this.y - 13.5, size: 8.5, font: this.negrita, color: GRIS })
      lineas.forEach((linea, j) => {
        this.pagina.drawText(linea, { x: MARGEN + anchoEtiqueta + 8, y: this.y - 13.5 - j * 13, size: 9.5, font: this.normal, color: TEXTO })
      })
      this.y -= alto
    }
    this.y -= 10
  }
}

export async function generarPdf(d: DatosPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(limpiar(`Informe de cierre ${d.numero} - ${d.hotel}`))
  doc.setAuthor(limpiar(d.empresa))
  doc.setSubject(limpiar(`${d.area} - ${d.servicio}`).slice(0, 200))
  doc.setCreator(limpiar(`${d.empresa} - Calendario operativo`))
  doc.setCreationDate(new Date())

  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold)
  const cursiva = await doc.embedFont(StandardFonts.HelveticaOblique)
  const logo = await doc.embedPng(d.logoPng)
  const a = d.analisis
  const l = new Lienzo(doc, normal, negrita, cursiva, logo, d.numero, d.empresa)
  l.nuevaPagina(true)

  // ── Encabezado ──────────────────────────────────────────────────────
  const lado = 70 // el logo es cuadrado: se mantiene su proporción original
  const p = l.pagina
  p.drawImage(logo, { x: MARGEN, y: l.y - lado, width: lado, height: lado })
  p.drawText(limpiar(d.empresa), { x: MARGEN + lado + 14, y: l.y - 24, size: 17, font: negrita, color: TEXTO })
  p.drawText('Informe de cierre de servicio', { x: MARGEN + lado + 14, y: l.y - 42, size: 12, font: normal, color: VERDE })
  p.drawText(limpiar(`Control de plagas - ${d.hotel}`).slice(0, 70), { x: MARGEN + lado + 14, y: l.y - 57, size: 9, font: normal, color: GRIS })

  const cajaAncho = 150
  const cajaX = ANCHO - MARGEN - cajaAncho
  p.drawRectangle({ x: cajaX, y: l.y - 58, width: cajaAncho, height: 52, color: FONDO, borderColor: LINEA, borderWidth: 0.8 })
  p.drawText('INFORME N.º', { x: cajaX + 10, y: l.y - 20, size: 7.5, font: negrita, color: GRIS })
  p.drawText(limpiar(d.numero), { x: cajaX + 10, y: l.y - 35, size: 12.5, font: negrita, color: AZUL })
  p.drawText(limpiar(`Cierre: ${formatearFechaHora(d.cerradoEn, d.zonaHoraria)}`), { x: cajaX + 10, y: l.y - 50, size: 8, font: normal, color: GRIS })
  l.y -= lado + 12
  p.drawRectangle({ x: MARGEN, y: l.y - 3, width: CONTENIDO * 0.62, height: 3, color: VERDE })
  p.drawRectangle({ x: MARGEN + CONTENIDO * 0.62, y: l.y - 3, width: CONTENIDO * 0.38, height: 3, color: AZUL })
  l.y -= 18

  // ── Datos del servicio ──────────────────────────────────────────────
  l.titulo('Datos del servicio')
  l.tablaDatos([
    ['Hotel', d.hotel],
    ['Área exacta', d.area],
    ['Operativo', `${d.titulo}${d.operacion ? ` (${d.operacion})` : ''}`],
    ['Fecha programada', formatearFecha(d.fechaProgramada)],
    ['Técnico', d.tecnico],
    ['Fecha y hora de cierre', formatearFechaHora(d.cerradoEn, d.zonaHoraria)],
    ['Resultado declarado', ETIQUETA_RESULTADO[d.resultado] ?? d.resultado],
    ['Evidencia fotográfica', `${d.fotos.length} fotos`],
  ])

  // ── Resultado: servicio vs. problema ────────────────────────────────
  l.titulo('Resultado del servicio')
  l.parrafo('Servicio realizado', { fuente: negrita, tamano: 9 })
  l.parrafo(a.conclusion_servicio || 'Servicio realizado según lo registrado por el técnico.')
  l.y -= 4
  l.parrafo('Estado del problema', { fuente: negrita, tamano: 9 })
  l.parrafo(a.conclusion_problema || 'No determinado.', { color: a.estado_problema === 'pendiente_seguimiento' ? AMBAR : TEXTO })
  l.y -= 8

  // ── Resumen ─────────────────────────────────────────────────────────
  l.titulo('Resumen')
  l.parrafo(a.resumen || 'Sin resumen.')
  l.y -= 8

  l.titulo('Servicio realizado')
  l.parrafo(d.servicio)
  l.y -= 8

  l.titulo('Hallazgos')
  l.vinetas(a.hallazgos, 'Sin hallazgos registrados.')

  l.titulo('Acciones realizadas')
  l.vinetas(a.acciones, 'Sin acciones registradas.')

  const productos = (d.productos ?? '').split(/\r?\n|,\s*/).map(p => p.trim()).filter(Boolean)
  if (productos.length > 0) {
    l.titulo('Productos mencionados por el técnico')
    l.vinetas(productos, '')
  }

  // ── Registro fotográfico ────────────────────────────────────────────
  const gap = 14
  const celda = (CONTENIDO - gap) / 2
  const altoFoto = 172
  l.titulo('Registro fotográfico', altoFoto + 50)
  for (let i = 0; i < d.fotos.length; i += 2) {
    const par = d.fotos.slice(i, i + 2)
    const textos = par.map(f => {
      const info = a.fotos.find(x => x.indice === f.indice)
      const desc = partirLineas(info?.descripcion || 'Sin descripción.', normal, 8.5, celda - 4)
      const obs = info?.observacion ? partirLineas(`Nota: ${info.observacion}`, cursiva, 8, celda - 4) : []
      return { info, desc, obs }
    })
    const altoTexto = Math.max(...textos.map(t => 14 + t.desc.length * 11.5 + t.obs.length * 10.5))
    l.asegurar(altoFoto + altoTexto + 16)
    for (const [j, foto] of par.entries()) {
      const x = MARGEN + j * (celda + gap)
      const yTop = l.y
      l.pagina.drawRectangle({ x, y: yTop - altoFoto, width: celda, height: altoFoto, color: FONDO, borderColor: LINEA, borderWidth: 0.6 })
      let dibujada = false
      if (foto.bytes) {
        try {
          const tipo = tipoImagen(foto.bytes)
          const img = tipo === 'jpg' ? await doc.embedJpg(foto.bytes) : tipo === 'png' ? await doc.embedPng(foto.bytes) : null
          if (img) {
            const escala = Math.min((celda - 8) / img.width, (altoFoto - 8) / img.height)
            const w = img.width * escala
            const h = img.height * escala
            l.pagina.drawImage(img, { x: x + (celda - w) / 2, y: yTop - altoFoto + (altoFoto - h) / 2, width: w, height: h })
            dibujada = true
          }
        } catch { /* imagen dañada: se muestra el aviso */ }
      }
      if (!dibujada) {
        const aviso = 'Imagen no disponible en formato compatible'
        l.pagina.drawText(aviso, { x: x + (celda - normal.widthOfTextAtSize(aviso, 8.5)) / 2, y: yTop - altoFoto / 2, size: 8.5, font: cursiva, color: GRIS })
      }
      let yTexto = yTop - altoFoto - 12
      l.pagina.drawText(limpiar(`Foto ${foto.indice} - ${ETIQUETA_CATEGORIA[foto.categoria]}`), { x, y: yTexto, size: 8.5, font: negrita, color: AZUL })
      yTexto -= 12
      for (const linea of textos[j].desc) {
        l.pagina.drawText(linea, { x, y: yTexto, size: 8.5, font: normal, color: TEXTO })
        yTexto -= 11.5
      }
      for (const linea of textos[j].obs) {
        l.pagina.drawText(linea, { x, y: yTexto, size: 8, font: cursiva, color: AMBAR })
        yTexto -= 10.5
      }
    }
    l.y -= altoFoto + altoTexto + 16
  }

  l.titulo('Recomendaciones')
  l.vinetas(a.recomendaciones, 'Sin recomendaciones adicionales.')

  l.titulo('Pendientes')
  l.vinetas(a.pendientes, 'Sin pendientes registrados.')

  if (d.observaciones) {
    l.titulo('Observaciones del técnico')
    l.parrafo(d.observaciones)
    l.y -= 8
  }

  if (d.revision) {
    l.titulo('Revisión del supervisor')
    l.parrafo(`Revisado y aprobado por ${d.revision.nombre} el ${formatearFechaHora(d.revision.fecha, d.zonaHoraria)}.`)
    if (d.revision.nota) l.parrafo(d.revision.nota, { fuente: cursiva, color: GRIS })
    l.y -= 8
  }

  // ── Alcance ─────────────────────────────────────────────────────────
  l.asegurar(70)
  l.y -= 4
  l.pagina.drawLine({ start: { x: MARGEN, y: l.y }, end: { x: ANCHO - MARGEN, y: l.y }, thickness: 0.6, color: LINEA })
  l.y -= 6
  l.parrafo(
    a.ia_disponible
      ? 'Alcance: este informe se basa en los datos registrados por el técnico al cerrar el operativo y en sus fotografías. Las descripciones de las fotos se redactaron con asistencia de inteligencia artificial y se limitan a lo visible: no identifican especies ni productos y no constituyen confirmación de eliminación de plagas. "Servicio realizado" indica que el trabajo se ejecutó; no implica por sí solo que el problema esté resuelto.'
      : 'Alcance: este informe se basa en los datos registrados por el técnico al cerrar el operativo y en sus fotografías. "Servicio realizado" indica que el trabajo se ejecutó; no implica por sí solo que el problema esté resuelto.',
    { tamano: 7.5, fuente: cursiva, color: GRIS, interlineado: 10 },
  )

  // ── Pie de página con numeración ────────────────────────────────────
  const paginas = doc.getPages()
  const generado = formatearFechaHora(new Date().toISOString(), d.zonaHoraria)
  paginas.forEach((pagina, i) => {
    pagina.drawLine({ start: { x: MARGEN, y: MARGEN + 14 }, end: { x: ANCHO - MARGEN, y: MARGEN + 14 }, thickness: 0.6, color: LINEA })
    pagina.drawText(limpiar(`${d.empresa} · Informe ${d.numero} · Generado el ${generado}`), { x: MARGEN, y: MARGEN, size: 7.5, font: normal, color: GRIS })
    const texto = `Página ${i + 1} de ${paginas.length}`
    pagina.drawText(limpiar(texto), { x: ANCHO - MARGEN - normal.widthOfTextAtSize(limpiar(texto), 7.5), y: MARGEN, size: 7.5, font: normal, color: GRIS })
  })

  return await doc.save()
}
