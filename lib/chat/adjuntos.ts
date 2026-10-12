'use client'
// lib/chat/adjuntos.ts
// Subida de fotos y documentos del chat al bucket privado de Supabase Storage.
import type { SupabaseClient } from '@supabase/supabase-js'

export const BUCKET_ADJUNTOS = 'actividad-adjuntos'
export const MAX_ADJUNTO_BYTES = 10 * 1024 * 1024
export const TIPOS_ADJUNTO = 'image/*,application/pdf'

const LADO_MAXIMO_FOTO = 1600
const CALIDAD_JPEG = 0.8

/** Error con un mensaje apto para mostrar al usuario. */
export class ErrorAdjunto extends Error {}

export interface AdjuntoSubido {
  path: string
  tipo: string
  nombre: string
  tamano: number
}

export function esImagen(tipo: string | null | undefined) {
  return !!tipo && tipo.startsWith('image/')
}

export function formatearTamano(bytes: number | null | undefined) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function cargarImagen(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')) }
    img.src = url
  })
}

/**
 * Reduce las fotos de la cámara (normalmente 3–8 MB) a JPEG de 1600 px para
 * ahorrar datos móviles. Si el navegador no puede procesarla, se sube el original.
 */
export async function comprimirImagen(file: File): Promise<File> {
  if (!esImagen(file.type) || file.type === 'image/gif') return file
  try {
    const img = await cargarImagen(file)
    const escala = Math.min(1, LADO_MAXIMO_FOTO / Math.max(img.naturalWidth, img.naturalHeight))
    const ancho = Math.round(img.naturalWidth * escala)
    const alto = Math.round(img.naturalHeight * escala)
    const canvas = document.createElement('canvas')
    canvas.width = ancho
    canvas.height = alto
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, ancho, alto)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', CALIDAD_JPEG))
    if (!blob || blob.size >= file.size) return file
    const nombre = file.name.replace(/\.[^.]+$/, '') || 'foto'
    return new File([blob], `${nombre}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export function validarAdjunto(file: File): string | null {
  if (!esImagen(file.type) && file.type !== 'application/pdf') {
    return `"${file.name}" no es una foto ni un PDF.`
  }
  if (file.size > MAX_ADJUNTO_BYTES) {
    return `"${file.name}" supera el límite de ${formatearTamano(MAX_ADJUNTO_BYTES)}.`
  }
  return null
}

export async function subirAdjunto(
  supabase: SupabaseClient,
  actividadId: string,
  original: File,
): Promise<AdjuntoSubido> {
  const file = await comprimirImagen(original)
  const error = validarAdjunto(file)
  if (error) throw new ErrorAdjunto(error)

  const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'bin'
  const path = `${actividadId}/${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET_ADJUNTOS)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) throw new ErrorAdjunto(`No se pudo subir "${original.name}".`)

  return { path, tipo: file.type, nombre: original.name, tamano: file.size }
}

export async function eliminarAdjuntos(supabase: SupabaseClient, paths: string[]) {
  if (paths.length === 0) return
  await supabase.storage.from(BUCKET_ADJUNTOS).remove(paths)
}

/** Las URLs firmadas caducan en 1 hora; el bucket es privado. */
export async function obtenerUrlsFirmadas(supabase: SupabaseClient, paths: string[]) {
  const urls: Record<string, string> = {}
  if (paths.length === 0) return urls
  const { data } = await supabase.storage.from(BUCKET_ADJUNTOS).createSignedUrls(paths, 60 * 60)
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urls[item.path] = item.signedUrl
  }
  return urls
}
