'use client'
// lib/hoteles/logo.ts
// Logotipo de cada hotel en el bucket público 'hotel-logos' (migración 013).
// Solo un administrador puede subirlo o borrarlo.
import type { SupabaseClient } from '@supabase/supabase-js'

export const BUCKET_LOGOS = 'hotel-logos'
export const TIPOS_LOGO = ['image/png', 'image/jpeg', 'image/webp']
export const MAX_LOGO_BYTES = 2 * 1024 * 1024

export function validarLogo(file: File): string | null {
  if (!TIPOS_LOGO.includes(file.type)) return 'El logo debe ser una imagen PNG, JPG o WEBP.'
  if (file.size > MAX_LOGO_BYTES) return 'El logo no puede superar 2 MB.'
  return null
}

/** Sube el logo (sin recomprimir, para conservar la transparencia del PNG) y devuelve su URL pública. */
export async function subirLogoHotel(supabase: SupabaseClient, hotelId: string, file: File) {
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  // Nombre nuevo en cada cambio: evita que el navegador muestre el logo anterior guardado en caché.
  const ruta = `${hotelId}/logo-${Date.now()}.${extension}`
  const { error } = await supabase.storage.from(BUCKET_LOGOS).upload(ruta, file, { contentType: file.type, upsert: false })
  if (error) {
    throw new Error(/bucket not found/i.test(error.message)
      ? 'Falta ejecutar la migración 013_logo_hoteles.sql en Supabase.'
      : 'No se pudo subir el logo. Revisa tu conexión e inténtalo de nuevo.')
  }
  return supabase.storage.from(BUCKET_LOGOS).getPublicUrl(ruta).data.publicUrl
}

/** Borra del bucket el archivo de un logo anterior (si no se puede, no bloquea). */
export async function borrarLogoHotel(supabase: SupabaseClient, url: string | null | undefined) {
  const marca = `/object/public/${BUCKET_LOGOS}/`
  const i = url?.indexOf(marca) ?? -1
  if (!url || i < 0) return
  try { await supabase.storage.from(BUCKET_LOGOS).remove([decodeURIComponent(url.slice(i + marca.length))]) } catch { /* queda huérfano */ }
}
