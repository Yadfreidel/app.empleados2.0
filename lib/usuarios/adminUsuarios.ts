'use client'
// lib/usuarios/adminUsuarios.ts
// Cliente de la Edge Function 'admin-usuarios' (supabase/functions/admin-usuarios).
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types'

export const FUNCION_ADMIN_USUARIOS = 'admin-usuarios'

type Peticion =
  | { accion: 'estado' }
  | { accion: 'crear'; email: string; password: string; nombre: string; rol: UserRole }
  | { accion: 'actualizar'; id: string; nombre: string; rol: UserRole; activo: boolean }
  | { accion: 'cambiar_contrasena'; id: string; password: string }

export type RespuestaAdminUsuarios = { ok: true } | { ok: false; error: string; noDesplegada?: boolean }

const NO_DESPLEGADA = 'La función "admin-usuarios" no está desplegada en Supabase. Revisa Configuración → Sistema.'

export async function llamarAdminUsuarios(peticion: Peticion): Promise<RespuestaAdminUsuarios> {
  try {
    const { data, error } = await createClient().functions.invoke(FUNCION_ADMIN_USUARIOS, { body: peticion })
    if (error) {
      if (error instanceof FunctionsHttpError) {
        const res = error.context as Response
        if (res.status === 404) return { ok: false, error: NO_DESPLEGADA, noDesplegada: true }
        const cuerpo = await res.json().catch(() => null) as { error?: string } | null
        return { ok: false, error: cuerpo?.error ?? 'La operación fue rechazada.' }
      }
      if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
        // Sin despliegue, la petición previa (CORS) falla igual que un corte de red.
        return {
          ok: false,
          error: 'No se pudo contactar la función "admin-usuarios". Revisa tu conexión o que esté desplegada (Configuración → Sistema).',
          noDesplegada: true,
        }
      }
      return { ok: false, error: 'No se pudo completar la operación.' }
    }
    const cuerpo = data as { ok?: boolean; error?: string } | null
    return cuerpo?.ok ? { ok: true } : { ok: false, error: cuerpo?.error ?? 'No se pudo completar la operación.' }
  } catch {
    return { ok: false, error: 'No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.' }
  }
}
