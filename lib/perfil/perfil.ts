'use client'
// lib/perfil/perfil.ts
// Perfil del usuario con sesión (nombre, rol y foto). Estado compartido: el
// encabezado, el menú de usuario, "Mi perfil" y el aviso de foto pendiente se
// actualizan juntos al cambiar la foto. Migración 015.
import { useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase/client'
import { olvidarUsuarioLocal } from '@/lib/offline/sincronizacion'
import type { UserRole } from '@/types'

export const BUCKET_AVATARES = 'avatares'
export const TIPOS_FOTO_PERFIL = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_FOTO_PERFIL = 5 * 1024 * 1024

export interface PerfilUsuario {
  id: string
  email: string
  name: string | null
  role: UserRole
  active: boolean
  avatar_path: string | null
}

interface Estado {
  cargando: boolean
  /** null = sin sesión. */
  perfil: PerfilUsuario | null
  avatarUrl: string | null
  /** false si la migración 015 aún no está instalada (no se exige la foto). */
  instalado: boolean
}

let estado: Estado = { cargando: true, perfil: null, avatarUrl: null, instalado: true }
const oyentes = new Set<() => void>()
const actualizar = (cambio: Partial<Estado>) => { estado = { ...estado, ...cambio }; oyentes.forEach(fn => fn()) }

/** Valida tipo y tamaño en el cliente (el servidor vuelve a validarlo). */
export function validarFotoPerfil(file: File): string | null {
  if (!TIPOS_FOTO_PERFIL.includes(file.type)) return 'La foto debe ser JPG, PNG o WebP.'
  if (file.size > MAX_FOTO_PERFIL) return 'La foto no puede superar 5 MB.'
  if (file.size === 0) return 'La foto está vacía. Elige otra.'
  return null
}

export function nombreVisible(p: PerfilUsuario | null) {
  return p?.name?.trim() || p?.email || 'Usuario'
}

export async function recargarPerfil() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { actualizar({ cargando: false, perfil: null, avatarUrl: null }); return }
  let { data, error } = await supabase.from('profiles').select('id, email, name, role, active, avatar_path').eq('id', session.user.id).maybeSingle()
  let instalado = true
  if (error && (error.code === '42703' || /avatar_path/.test(error.message ?? ''))) {
    // Sin la migración 015: se muestran los datos de siempre y no se exige foto.
    instalado = false
    ;({ data, error } = await supabase.from('profiles').select('id, email, name, role, active').eq('id', session.user.id).maybeSingle())
  }
  if (error || !data) {
    // Sin conexión: se conserva lo último conocido para no bloquear al usuario.
    actualizar({ cargando: false, perfil: estado.perfil ?? { id: session.user.id, email: session.user.email ?? '', name: null, role: 'consulta', active: true, avatar_path: null }, instalado: false })
    return
  }
  const perfil = { ...data, avatar_path: (data as { avatar_path?: string | null }).avatar_path ?? null } as PerfilUsuario
  let avatarUrl: string | null = null
  if (perfil.avatar_path) {
    const { data: firmada } = await supabase.storage.from(BUCKET_AVATARES).createSignedUrl(perfil.avatar_path, 60 * 60)
    avatarUrl = firmada?.signedUrl ?? null
  }
  actualizar({ cargando: false, perfil, avatarUrl, instalado })
}

let iniciado = false
function iniciar() {
  if (iniciado || typeof window === 'undefined') return
  iniciado = true
  void recargarPerfil()
  createClient().auth.onAuthStateChange(evento => {
    if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'USER_UPDATED') void recargarPerfil()
  })
}

function suscribir(fn: () => void) {
  iniciar()
  oyentes.add(fn)
  return () => { oyentes.delete(fn) }
}
const estadoServidor: Estado = { cargando: true, perfil: null, avatarUrl: null, instalado: true }
export function usePerfil() {
  return useSyncExternalStore(suscribir, () => estado, () => estadoServidor)
}

/**
 * Sube la foto (ya recortada) a la carpeta del usuario y la registra.
 * Si algo falla, borra lo subido; si sale bien, borra la foto anterior.
 */
export async function guardarFotoPerfil(foto: Blob): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
  if (!TIPOS_FOTO_PERFIL.includes(foto.type) || foto.size > MAX_FOTO_PERFIL) {
    return { ok: false, error: 'La foto debe ser JPG, PNG o WebP de máximo 5 MB.' }
  }
  const ext = foto.type === 'image/png' ? 'png' : foto.type === 'image/webp' ? 'webp' : 'jpg'
  const ruta = `${session.user.id}/avatar-${Date.now()}.${ext}`
  const { error: errorSubida } = await supabase.storage.from(BUCKET_AVATARES).upload(ruta, foto, { contentType: foto.type, upsert: false })
  if (errorSubida) {
    const msg = errorSubida.message ?? ''
    return {
      ok: false,
      error: /bucket not found/i.test(msg) ? 'Falta ejecutar la migración 015_foto_perfil.sql en Supabase.'
        : /size|exceeded/i.test(msg) ? 'La foto supera el tamaño permitido (5 MB).'
          : /mime|type/i.test(msg) ? 'Formato no permitido. Usa JPG, PNG o WebP.'
            : 'No se pudo subir la foto. Revisa tu conexión e inténtalo de nuevo.',
    }
  }
  const { data, error } = await supabase.rpc('actualizar_mi_foto', { p_path: ruta })
  const r = data as { ok: boolean; error?: string; anterior?: string | null } | null
  if (error || !r?.ok) {
    await supabase.storage.from(BUCKET_AVATARES).remove([ruta])
    return { ok: false, error: r?.error ?? 'No se pudo guardar la foto. Inténtalo de nuevo.' }
  }
  if (r.anterior) await supabase.storage.from(BUCKET_AVATARES).remove([r.anterior])
  await recargarPerfil()
  return { ok: true }
}

export async function cerrarSesion() {
  // Cierre de sesión voluntario: este equipo deja de mostrar los pendientes de la cuenta.
  olvidarUsuarioLocal()
  await createClient().auth.signOut()
}
