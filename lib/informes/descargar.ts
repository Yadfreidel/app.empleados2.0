'use client'
// lib/informes/descargar.ts
// Genera el PDF del informe de cierre en el navegador y lo descarga.
// Si el servidor ya hizo el análisis con IA, se incluye; si no, el informe se
// arma solo con lo que registró el técnico (sin inventar nada).
import type { AnalisisInforme, InformeCierre } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { obtenerUrlsFirmadas } from '@/lib/chat/adjuntos'

function lineas(texto: string) {
  return texto.split(/\r?\n|;\s*/).map(l => l.replace(/^[-•*\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 20)
}

const unicos = (lista: string[]) => [...new Map(lista.map(x => [x.toLowerCase(), x])).values()]

/** Contenido del informe sin IA: solo lo escrito (o dictado y confirmado) por el técnico. */
export function analisisLocal(i: InformeCierre): AnalisisInforme {
  const pendientesTecnico = lineas(i.pendientes ?? '')
  return {
    resumen: `Se realizó el servicio "${i.servicio}" en ${i.area} del ${i.hotel_nombre}. El contenido de este informe corresponde a lo registrado por el técnico.`,
    hallazgos: lineas(i.hallazgos),
    acciones: lineas(i.acciones),
    fotos: i.fotos.map((_, n) => ({ indice: n + 1, descripcion: '', corresponde_a_categoria: true, observacion: '' })),
    recomendaciones: lineas(i.recomendaciones ?? ''),
    pendientes: pendientesTecnico.length > 0 ? pendientesTecnico
      : i.resultado === 'requiere_seguimiento' ? ['Seguimiento solicitado por el técnico.'] : [],
    conclusion_servicio: 'Servicio realizado según lo registrado por el técnico.',
    estado_problema: i.resultado === 'problema_resuelto' ? 'resuelto_segun_tecnico'
      : i.resultado === 'requiere_seguimiento' ? 'pendiente_seguimiento' : 'no_determinable',
    conclusion_problema: i.resultado === 'problema_resuelto'
      ? 'El técnico declara el problema como resuelto.'
      : i.resultado === 'requiere_seguimiento'
        ? 'Requiere seguimiento según el técnico.'
        : 'El servicio se realizó; no se declaró el problema como resuelto.',
    evidencia_suficiente: true,
    contradicciones: [],
    motivos_revision: [],
    ia_disponible: false,
  }
}

async function bytesDe(url: string) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(String(r.status))
  return new Uint8Array(await r.arrayBuffer())
}

/**
 * Análisis de la IA o contenido ajustado por el supervisor; si no hay, solo lo
 * del técnico. Las recomendaciones y pendientes que confirmó el técnico siempre
 * se incluyen (la IA no los reemplaza).
 */
function contenido(i: InformeCierre): AnalisisInforme {
  const local = analisisLocal(i)
  if (!i.analisis) return local
  if (i.analisis.editado_por_supervisor) return i.analisis
  return {
    ...i.analisis,
    recomendaciones: unicos([...lineas(i.recomendaciones ?? ''), ...i.analisis.recomendaciones]),
    pendientes: unicos([...lineas(i.pendientes ?? ''), ...i.analisis.pendientes]),
  }
}

/** El PDF solo admite PNG y JPG: un logo WEBP se convierte a PNG con el navegador. */
async function logoParaPdf(bytes: Uint8Array): Promise<Uint8Array | null> {
  const esWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45
  if (!esWebp) return bytes
  try {
    const imagen = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/webp' }))
    const canvas = document.createElement('canvas')
    canvas.width = imagen.width
    canvas.height = imagen.height
    canvas.getContext('2d')?.drawImage(imagen, 0, 0)
    const png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    return png ? new Uint8Array(await png.arrayBuffer()) : null
  } catch {
    return null
  }
}

/** Descarga el PDF del informe en este equipo. */
export async function descargarInformePdf(i: InformeCierre) {
  const { generarPdf } = await import('./pdf')
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

  let logo: Uint8Array
  try {
    logo = await bytesDe(`${basePath}/images/logo.png`)
  } catch {
    throw new Error('No se pudo cargar el logo. Revisa tu conexión e inténtalo de nuevo.')
  }

  // Fotos del bucket privado (URLs firmadas con los permisos del usuario).
  const supabase = createClient()
  // Logo del hotel (migración 013). Si no hay o no carga, el PDF sale sin él.
  const { data: hotel } = await supabase.from('hotels').select('logo_url').eq('id', i.hotel_id).maybeSingle()
  const logoOriginal = hotel?.logo_url ? await bytesDe(hotel.logo_url as string).catch(() => null) : null
  const logoHotel = logoOriginal ? await logoParaPdf(logoOriginal) : null

  const urls = await obtenerUrlsFirmadas(supabase, i.fotos.map(f => f.path))
  if (i.fotos.length > 0 && Object.keys(urls).length === 0) {
    throw new Error('No se pudieron obtener las fotos. Revisa tu conexión o tus permisos.')
  }
  const fotos = await Promise.all(i.fotos.map(async (f, n) => ({
    indice: n + 1,
    categoria: f.categoria,
    bytes: urls[f.path] ? await bytesDe(urls[f.path]).catch(() => null) : null,
  })))

  const pdf = await generarPdf({
    numero: i.numero,
    hotel: i.hotel_nombre,
    area: i.area,
    operacion: i.operacion_nombre,
    titulo: i.actividad_titulo,
    fechaProgramada: i.fecha_programada,
    servicio: i.servicio,
    resultado: i.resultado,
    observaciones: i.observaciones,
    tecnico: i.tecnico_nombre,
    cerradoEn: i.cerrado_en,
    analisis: contenido(i),
    productos: i.productos ?? null,
    fotos,
    revision: i.revisado_en && i.revisado_nombre ? { nombre: i.revisado_nombre, fecha: i.revisado_en, nota: i.revision_nota } : null,
    empresa: 'F&M Fumigación',
    zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Santo_Domingo',
    logoPng: logo,
    logoHotel,
  })

  const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: 'application/pdf' }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = `Informe-${i.numero}.pdf`
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
