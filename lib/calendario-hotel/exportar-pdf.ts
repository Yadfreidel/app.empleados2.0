// lib/calendario-hotel/exportar-pdf.ts
// Genera el PDF del calendario por áreas: resumen del mes + detalle día por día.
// Se ejecuta en el navegador; jsPDF se carga solo al exportar.
import { format, getDaysInMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import type { EstadoServicio, MatrizMensual, ServicioArea } from './datos'

type RGB = [number, number, number]

const VERDE: RGB = [21, 128, 61]
const VERDE_OSCURO: RGB = [20, 83, 45]
const GRIS_TEXTO: RGB = [71, 85, 105]
const GRIS_LINEA: RGB = [203, 213, 225]
const DOMINGO: RGB = [220, 252, 231]

const ESTADOS: Record<EstadoServicio, { texto: string; marca: string; fondo: RGB; tinta: RGB }> = {
  programado: { texto: 'Programado', marca: 'X', fondo: [2, 132, 199], tinta: [255, 255, 255] },
  realizado: { texto: 'Realizado', marca: 'OK', fondo: [5, 150, 105], tinta: [255, 255, 255] },
  reprogramado: { texto: 'Reprogramado', marca: 'R', fondo: [251, 191, 36], tinta: [69, 26, 3] },
  cancelado: { texto: 'Cancelado', marca: '-', fondo: [212, 212, 216], tinta: [82, 82, 91] },
}
const LETRA = ['D', 'L', 'M', 'MI', 'J', 'V', 'S']

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function nombreArchivoCalendario(matriz: MatrizMensual) {
  const nombreMes = format(new Date(matriz.anio, matriz.mes - 1, 1), 'MMMM yyyy', { locale: es })
  const base = `Calendario_${matriz.hotel.name}_${nombreMes}`
  return `${base.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_')}.pdf`
}

/** Descarga el PDF del calendario. */
export async function exportarCalendarioPdf(matriz: MatrizMensual, empresa: string) {
  const doc = await generarCalendarioPdf(matriz, empresa)
  doc.save(nombreArchivoCalendario(matriz))
}

export async function generarCalendarioPdf(matriz: MatrizMensual, empresa: string) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const { hotel, anio, mes, areas, servicios } = matriz
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  const margen = 10
  const finalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  const nombreMes = capitalizar(format(new Date(anio, mes - 1, 1), 'MMMM yyyy', { locale: es }))
  const totalDias = getDaysInMonth(new Date(anio, mes - 1))
  const dias = Array.from({ length: totalDias }, (_, i) => new Date(anio, mes - 1, i + 1))
  const fechaDe = (d: Date) => format(d, 'yyyy-MM-dd')
  const mapa = new Map(servicios.map(s => [`${s.area_id}|${s.fecha}`, s]))
  const areaPorId = new Map(areas.map(a => [a.id, a]))
  const serviciosDelMes = servicios.filter(s => areaPorId.has(s.area_id))

  // ── Encabezado (una vez por página) ───────────────────────────────────
  const paginasConEncabezado = new Set<number>()
  function encabezado(subtitulo: string) {
    const pagina = doc.getCurrentPageInfo().pageNumber
    if (paginasConEncabezado.has(pagina)) return
    paginasConEncabezado.add(pagina)
    doc.setFillColor(...VERDE_OSCURO)
    doc.rect(0, 0, ancho, 22, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.text(`CALENDARIO DE SERVICIO · ${hotel.name.toUpperCase()}`, margen, 10)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`${nombreMes}  ·  ${subtitulo}`, margen, 16.5)
    doc.setFontSize(9)
    doc.text(empresa, ancho - margen, 10, { align: 'right' })
  }

  // ── Página 1: resumen y tabla del mes ─────────────────────────────────
  encabezado('Resumen del mes')
  const conteo = (estado: EstadoServicio) => serviciosDelMes.filter(s => s.estado === estado).length
  const diasConServicio = new Set(serviciosDelMes.map(s => s.fecha)).size
  const tarjetas: { titulo: string; valor: string; color: RGB }[] = [
    { titulo: 'Áreas', valor: String(areas.length), color: GRIS_TEXTO },
    { titulo: 'Servicios', valor: String(serviciosDelMes.length), color: VERDE_OSCURO },
    { titulo: 'Realizados', valor: String(conteo('realizado')), color: ESTADOS.realizado.fondo },
    { titulo: 'Programados', valor: String(conteo('programado')), color: ESTADOS.programado.fondo },
    { titulo: 'Reprogramados', valor: String(conteo('reprogramado')), color: [180, 120, 0] },
    { titulo: 'Cancelados', valor: String(conteo('cancelado')), color: ESTADOS.cancelado.tinta },
    { titulo: 'Días con servicio', valor: `${diasConServicio} / ${totalDias}`, color: GRIS_TEXTO },
  ]
  const anchoTarjeta = (ancho - margen * 2 - (tarjetas.length - 1) * 3) / tarjetas.length
  tarjetas.forEach((t, i) => {
    const x = margen + i * (anchoTarjeta + 3)
    doc.setDrawColor(...GRIS_LINEA)
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(x, 27, anchoTarjeta, 15, 1.5, 1.5, 'FD')
    doc.setTextColor(...GRIS_TEXTO)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.text(t.titulo.toUpperCase(), x + 3, 32)
    doc.setTextColor(...t.color)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text(t.valor, x + 3, 39)
  })

  const anchoArea = 58
  const anchoHorario = 20
  const anchoDia = (ancho - margen * 2 - anchoArea - anchoHorario) / totalDias
  autoTable(doc, {
    startY: 47,
    margin: { left: margen, right: margen, top: 27 },
    theme: 'grid',
    styles: { fontSize: 6.5, cellPadding: 1, lineColor: GRIS_LINEA, lineWidth: 0.15, valign: 'middle', textColor: [15, 23, 42] },
    headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'center', fontSize: 6.5 },
    columnStyles: {
      0: { cellWidth: anchoArea, halign: 'left' },
      1: { cellWidth: anchoHorario, halign: 'center', fontSize: 6 },
      ...Object.fromEntries(dias.map((_, i) => [i + 2, { cellWidth: anchoDia, halign: 'center' }])),
    },
    head: [
      [{ content: 'Área', rowSpan: 2, styles: { halign: 'left', valign: 'middle' } }, { content: 'Horario', rowSpan: 2, styles: { valign: 'middle' } }, ...dias.map(d => LETRA[d.getDay()])],
      dias.map(d => String(d.getDate())),
    ],
    body: areas.map(area => [
      area.nombre,
      area.horario ?? '',
      ...dias.map(d => {
        const s = mapa.get(`${area.id}|${fechaDe(d)}`)
        return s ? ESTADOS[s.estado].marca : ''
      }),
    ]),
    didParseCell: data => {
      const indiceDia = data.column.index - 2
      if (indiceDia < 0) return
      const dia = dias[indiceDia]
      if (data.section === 'head' && dia.getDay() === 0) {
        data.cell.styles.fillColor = VERDE
        data.cell.styles.textColor = [255, 255, 255]
      }
      if (data.section !== 'body') return
      const area = areas[data.row.index]
      const s = mapa.get(`${area.id}|${fechaDe(dia)}`)
      if (s) {
        data.cell.styles.fillColor = ESTADOS[s.estado].fondo
        data.cell.styles.textColor = ESTADOS[s.estado].tinta
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fontSize = s.estado === 'realizado' ? 5 : 6.5
      } else if (dia.getDay() === 0) {
        data.cell.styles.fillColor = DOMINGO
      }
    },
    didDrawPage: () => encabezado('Resumen del mes (continuación)'),
  })

  // Leyenda
  let y = finalY() + 6
  if (y > alto - 20) { doc.addPage(); encabezado('Resumen del mes'); y = 30 }
  doc.setFontSize(7.5)
  let x = margen
  doc.setTextColor(...GRIS_TEXTO)
  doc.setFont('helvetica', 'bold')
  doc.text('LEYENDA:', x, y + 3)
  x += 17
  for (const estado of Object.values(ESTADOS)) {
    doc.setFillColor(...estado.fondo)
    doc.rect(x, y, 6, 4, 'F')
    doc.setTextColor(...estado.tinta)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(estado.marca.length > 1 ? 5 : 6.5)
    doc.text(estado.marca, x + 3, y + 2.9, { align: 'center' })
    doc.setTextColor(...GRIS_TEXTO)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.text(estado.texto, x + 7.5, y + 3)
    x += 9 + doc.getTextWidth(estado.texto) + 6
  }
  doc.setFillColor(...DOMINGO)
  doc.rect(x, y, 6, 4, 'F')
  doc.text('Domingo', x + 7.5, y + 3)

  // ── Detalle día por día ───────────────────────────────────────────────
  const diasConDatos = dias
    .map(d => ({ dia: d, lista: areas.flatMap(a => {
      const s = mapa.get(`${a.id}|${fechaDe(d)}`)
      return s ? [{ area: a, servicio: s }] : []
    }) }))
    .filter(d => d.lista.length > 0)

  if (diasConDatos.length > 0) {
    doc.addPage()
    encabezado('Detalle por día')
    y = 30
    const confirmacion = (s: ServicioArea) => {
      if (!s.confirmado_en) return ''
      const quien = s.confirmado_nombre || 'Empleado'
      const cuando = format(new Date(s.confirmado_en), 'dd/MM HH:mm')
      return `${quien} · ${cuando}${s.confirmacion_nota ? `\n"${s.confirmacion_nota}"` : ''}`
    }

    for (const { dia, lista } of diasConDatos) {
      // Título del día junto con al menos dos filas; si no caben, nueva página.
      if (y > alto - 35) { doc.addPage(); encabezado('Detalle por día'); y = 30 }
      const realizados = lista.filter(l => l.servicio.estado === 'realizado').length
      doc.setFillColor(...(dia.getDay() === 0 ? VERDE : VERDE_OSCURO))
      doc.roundedRect(margen, y, ancho - margen * 2, 8, 1.2, 1.2, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text(capitalizar(format(dia, "EEEE d 'de' MMMM", { locale: es })), margen + 3, y + 5.5)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.text(`${lista.length} servicio${lista.length !== 1 ? 's' : ''}  ·  ${realizados} realizado${realizados !== 1 ? 's' : ''}`, ancho - margen - 3, y + 5.5, { align: 'right' })

      autoTable(doc, {
        startY: y + 9,
        margin: { left: margen, right: margen, top: 30 },
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 1.8, textColor: [15, 23, 42], valign: 'middle' },
        headStyles: { fillColor: [241, 245, 249], textColor: GRIS_TEXTO, fontStyle: 'bold', fontSize: 7.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 9, halign: 'center', textColor: GRIS_TEXTO },
          1: { cellWidth: 95 },
          2: { cellWidth: 28, halign: 'center' },
          3: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
          4: { cellWidth: 'auto', fontSize: 7.5 },
        },
        head: [['#', 'Área', 'Horario', 'Estado', 'Confirmación']],
        body: lista.map((l, i) => [
          String(i + 1),
          l.area.nombre,
          l.area.horario ?? '—',
          ESTADOS[l.servicio.estado].texto,
          confirmacion(l.servicio) || (l.servicio.notas ?? ''),
        ]),
        didParseCell: data => {
          if (data.section === 'body' && data.column.index === 3) {
            const estado = lista[data.row.index].servicio.estado
            data.cell.styles.textColor = estado === 'reprogramado' ? [146, 64, 14] : ESTADOS[estado].fondo
            if (estado === 'cancelado') data.cell.styles.textColor = [113, 113, 122]
          }
        },
        didDrawPage: () => encabezado('Detalle por día'),
      })
      y = finalY() + 6
    }
  }

  // ── Pie de página ─────────────────────────────────────────────────────
  const total = doc.getNumberOfPages()
  const generado = format(new Date(), "dd/MM/yyyy 'a las' HH:mm")
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setDrawColor(...GRIS_LINEA)
    doc.line(margen, alto - 9, ancho - margen, alto - 9)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...GRIS_TEXTO)
    doc.text(`${empresa} · ${hotel.name} · ${nombreMes}`, margen, alto - 5)
    doc.text(`Generado el ${generado}`, ancho / 2, alto - 5, { align: 'center' })
    doc.text(`Página ${p} de ${total}`, ancho - margen, alto - 5, { align: 'right' })
  }

  return doc
}
