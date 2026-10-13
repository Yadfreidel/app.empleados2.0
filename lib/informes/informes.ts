'use client'
// lib/informes/informes.ts
// Informes de cierre: constantes, detección de la migración 009 y cliente de la
// Edge Function 'informes-cierre' (análisis opcional con IA). El PDF se genera y
// descarga en el navegador: ver descargar.ts.
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CategoriaFotoInforme, EstadoGeneracionInforme, ResultadoCierre } from '@/types'

export const FUNCION_INFORMES = 'informes-cierre'
export const MAX_FOTOS_INFORME = 12

export const CATEGORIAS_OBLIGATORIAS: { id: Exclude<CategoriaFotoInforme, 'adicional'>; titulo: string; ayuda: string }[] = [
  { id: 'area', titulo: 'Área', ayuda: 'Vista general del área intervenida.' },
  { id: 'hallazgo', titulo: 'Hallazgo / inspección', ayuda: 'Lo encontrado: evidencia, condición o punto inspeccionado.' },
  { id: 'trabajo', titulo: 'Trabajo realizado', ayuda: 'El servicio en ejecución o el punto tratado.' },
  { id: 'estado_final', titulo: 'Estado final', ayuda: 'Cómo quedó el área al terminar.' },
]

export const ETIQUETA_CATEGORIA: Record<CategoriaFotoInforme, string> = {
  area: 'Área',
  hallazgo: 'Hallazgo / inspección',
  trabajo: 'Trabajo realizado',
  estado_final: 'Estado final',
  adicional: 'Evidencia',
}

export const OPCIONES_RESULTADO: { id: ResultadoCierre; titulo: string; ayuda: string }[] = [
  { id: 'servicio_realizado', titulo: 'Servicio realizado', ayuda: 'Se hizo el trabajo; no se puede afirmar todavía que el problema esté resuelto.' },
  { id: 'problema_resuelto', titulo: 'Problema resuelto', ayuda: 'Verificaste en sitio que el problema reportado quedó resuelto.' },
  { id: 'requiere_seguimiento', titulo: 'Requiere seguimiento', ayuda: 'Quedan hallazgos o tareas pendientes.' },
]

/** Estado del análisis con IA (opcional). El PDF se puede descargar en cualquier estado. */
export const ETIQUETA_GENERACION: Record<EstadoGeneracionInforme, string> = {
  pendiente: 'Análisis IA pendiente',
  generando: 'Analizando con IA',
  generado: 'Análisis IA listo',
  error: 'Análisis IA con error',
}

// ── ¿Está instalada la migración 009? ─────────────────────────────────────
const CLAVE_DISPONIBLE = 'fm-informes-disponibles'
let consulta: Promise<boolean> | null = null

function leerGuardado(): boolean | null {
  try {
    const v = localStorage.getItem(CLAVE_DISPONIBLE)
    return v === null ? null : v === '1'
  } catch { return null }
}

async function comprobar(): Promise<boolean> {
  const { error } = await createClient().from('informes_cierre').select('id', { head: true, count: 'exact' }).limit(1)
  const red = !!error && (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(error.message ?? '') || !navigator.onLine)
  // Sin conexión se usa lo último comprobado: así el formulario se exige también offline.
  if (red) return leerGuardado() ?? false
  const noInstalada = !!error && (error.code === 'PGRST205' || error.code === '42P01')
  const disponible = !noInstalada
  try { localStorage.setItem(CLAVE_DISPONIBLE, disponible ? '1' : '0') } catch { /* sin almacenamiento */ }
  return disponible
}

/** null mientras se comprueba. Una sola consulta compartida por todas las tarjetas. */
export function useInformesDisponibles() {
  const [disponible, setDisponible] = useState<boolean | null>(() => (typeof window === 'undefined' ? null : leerGuardado()))
  useEffect(() => {
    let activo = true
    consulta ??= comprobar().finally(() => { window.setTimeout(() => { consulta = null }, 60_000) })
    void consulta.then(v => { if (activo) setDisponible(v) })
    return () => { activo = false }
  }, [])
  return disponible
}

// ── Edge Function ─────────────────────────────────────────────────────────
type Peticion =
  | { accion: 'estado' }
  | { accion: 'procesar'; informe_id: string }
  | { accion: 'procesar_pendientes' }
  | { accion: 'reintentar'; informe_id: string; regenerar?: boolean }
  | { accion: 'aprobar'; informe_id: string; nota?: string; cambios?: Record<string, string> }

export type RespuestaInformes =
  | { ok: true; datos: Record<string, unknown> }
  | { ok: false; error: string; noDesplegada?: boolean; red?: boolean }

export async function llamarInformes(peticion: Peticion): Promise<RespuestaInformes> {
  try {
    const { data, error } = await createClient().functions.invoke(FUNCION_INFORMES, { body: peticion })
    if (error) {
      if (error instanceof FunctionsHttpError) {
        const res = error.context as Response
        if (res.status === 404) return { ok: false, error: 'La función "informes-cierre" no está desplegada. Revisa Configuración → Sistema.', noDesplegada: true }
        const cuerpo = await res.json().catch(() => null) as { error?: string } | null
        return { ok: false, error: cuerpo?.error ?? 'La operación fue rechazada.' }
      }
      if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
        return { ok: false, error: 'No se pudo contactar la función "informes-cierre". Revisa tu conexión o que esté desplegada.', noDesplegada: true, red: true }
      }
      return { ok: false, error: 'No se pudo completar la operación.' }
    }
    const cuerpo = data as ({ ok?: boolean; error?: string } & Record<string, unknown>) | null
    return cuerpo?.ok ? { ok: true, datos: cuerpo } : { ok: false, error: cuerpo?.error ?? 'No se pudo completar la operación.' }
  } catch {
    return { ok: false, error: 'No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.', red: true }
  }
}
