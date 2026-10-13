'use client'
// lib/excelencia/excelencia.ts
// Excelencia del mes (migración 014). El cálculo y los permisos viven en la
// base de datos (excelencia_ranking / excelencia_detalle / publicar_empleado_mes);
// aquí solo se consultan y se muestran.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export const BUCKET_EMPLEADO_MES = 'empleado-mes'

export interface FilaRanking {
  posicion: number | null
  supervisor_id: string
  nombre: string
  email: string
  asignados: number
  completados: number
  porcentaje: number
  calidad_promedio: number | null
  participa: boolean
  empatado: boolean
}

export type Clasificacion =
  | 'completado_validado' | 'completado_sin_validar' | 'no_completado'
  | 'excluido_cancelado' | 'excluido_bloqueo' | 'aun_no_vence' | 'sin_supervisor'

export interface FilaDetalle {
  actividad_id: string
  fecha: string
  titulo: string
  hotel: string | null
  estado: string
  clasificacion: Clasificacion
  evaluable: boolean
  cumplido: boolean
  calidad: number | null
  validacion: string | null
}

export interface EmpleadoMes {
  id: string
  mes: string
  supervisor_id: string | null
  nombre: string
  foto_path: string
  mensaje: string
  porcentaje: number
  completados: number
  asignados: number
  desempate_manual: boolean
  estado: 'publicado' | 'retirado' | 'sustituido'
  publicado_en: string
  retirado_en: string | null
}

export const ETIQUETA_CLASIFICACION: Record<Clasificacion, string> = {
  completado_validado: 'Completado y validado',
  completado_sin_validar: 'Completado sin validar',
  no_completado: 'No completado',
  excluido_cancelado: 'Excluido: cancelado',
  excluido_bloqueo: 'Excluido: bloqueo justificado',
  aun_no_vence: 'Aún no vence (no cuenta)',
  sin_supervisor: 'Sin supervisor asignado',
}

/** 'YYYY-MM' → primer día del mes. */
export const inicioMes = (mes: string) => `${mes}-01`

export function nombreMes(fecha: string) {
  const d = new Date(`${fecha.slice(0, 7)}-15T12:00:00`)
  const texto = d.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function urlFoto(path: string) {
  return createClient().storage.from(BUCKET_EMPLEADO_MES).getPublicUrl(path).data.publicUrl
}

export const esNoInstalado = (e: { code?: string } | null) => !!e && ['PGRST202', 'PGRST205', '42883', '42P01'].includes(e.code ?? '')

/**
 * Reconocimiento publicado (visible para todos, también sin sesión).
 * undefined = consultando; null = no hay ninguno publicado (o no se pudo consultar).
 */
export function useEmpleadoDelMes() {
  const [publicado, setPublicado] = useState<EmpleadoMes | null | undefined>(undefined)
  useEffect(() => {
    let activo = true
    createClient().from('empleado_mes').select('*').eq('estado', 'publicado').order('publicado_en', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (activo) setPublicado((data as EmpleadoMes | null) ?? null) }, () => { if (activo) setPublicado(null) })
    return () => { activo = false }
  }, [])
  return publicado
}
