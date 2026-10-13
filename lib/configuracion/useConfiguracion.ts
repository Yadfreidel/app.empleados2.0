'use client'
// lib/configuracion/useConfiguracion.ts
// Configuración general de la app (tabla app_configuracion, una sola fila).
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AppConfiguracion } from '@/types'

/** Valores usados si la migración 007 aún no está instalada: igual al comportamiento previo. */
export const CONFIGURACION_POR_DEFECTO: AppConfiguracion = {
  nombre_empresa: 'F&M Fumigación',
  telefono_oficina: null,
  correo_oficina: null,
  chat_habilitado: true,
  foto_obligatoria_confirmar: false,
  max_fotos_evidencia: 6,
  updated_at: null,
}

type Estado = { config: AppConfiguracion; instalada: boolean; cargando: boolean }

// Caché compartida: varias tarjetas del calendario usan la misma consulta.
let cache: Estado | null = null
let pendiente: Promise<Estado> | null = null
const suscriptores = new Set<(estado: Estado) => void>()

// Última configuración conocida, para respetar las reglas (p. ej. foto obligatoria) sin conexión.
const CLAVE_LOCAL = 'fm-configuracion'

async function consultar(): Promise<Estado> {
  const { data, error } = await createClient()
    .from('app_configuracion')
    .select('nombre_empresa, telefono_oficina, correo_oficina, chat_habilitado, foto_obligatoria_confirmar, max_fotos_evidencia, updated_at')
    .eq('id', 1)
    .maybeSingle()
  if (error || !data) {
    const tablaInexistente = error?.code === 'PGRST205' || error?.code === '42P01' || (!error && !data)
    if (!tablaInexistente) {
      try {
        const guardada = localStorage.getItem(CLAVE_LOCAL)
        if (guardada) return { config: { ...CONFIGURACION_POR_DEFECTO, ...JSON.parse(guardada) }, instalada: true, cargando: false }
      } catch { /* sin almacenamiento local */ }
    }
    return { config: CONFIGURACION_POR_DEFECTO, instalada: false, cargando: false }
  }
  try { localStorage.setItem(CLAVE_LOCAL, JSON.stringify(data)) } catch { /* sin almacenamiento local */ }
  return { config: { ...CONFIGURACION_POR_DEFECTO, ...data } as AppConfiguracion, instalada: true, cargando: false }
}

export async function recargarConfiguracion() {
  pendiente = consultar()
  cache = await pendiente
  pendiente = null
  suscriptores.forEach(fn => fn(cache!))
  return cache
}

export function useConfiguracion() {
  const [estado, setEstado] = useState<Estado>(cache ?? { config: CONFIGURACION_POR_DEFECTO, instalada: false, cargando: true })

  useEffect(() => {
    suscriptores.add(setEstado)
    if (!cache) {
      void (pendiente ?? recargarConfiguracion()).then(setEstado)
    }
    return () => { suscriptores.delete(setEstado) }
  }, [])

  const recargar = useCallback(() => recargarConfiguracion(), [])
  return { ...estado, recargar }
}
