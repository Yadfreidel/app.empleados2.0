'use client'
// components/informes/EstadoInformeActividad.tsx
// Informe de cierre de una actividad: descarga del PDF (generado en el navegador)
// y estado del análisis con IA. Solo lo ve el administrador y el técnico que
// cerró el operativo (RLS).
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Download, FileText, Loader2, Sparkles } from 'lucide-react'
import type { InformeCierre } from '@/types'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { ETIQUETA_GENERACION } from '@/lib/informes/informes'
import { descargarInformePdf } from '@/lib/informes/descargar'

export function useInformeActividad(actividadId: string, habilitado: boolean) {
  const [informe, setInforme] = useState<InformeCierre | null>(null)
  const cargar = useCallback(async () => {
    const { data } = await createClient().from('informes_cierre').select('*').eq('actividad_id', actividadId).maybeSingle()
    setInforme((data as InformeCierre | null) ?? null)
    return data as InformeCierre | null
  }, [actividadId])

  useEffect(() => {
    if (!habilitado) return
    let activo = true
    let vueltas = 0
    let temporizador: number | undefined
    async function ciclo() {
      const r = await cargar().catch(() => null)
      // Mientras la IA analiza, se consulta cada 8 s (máx. ~3 min).
      if (activo && r?.estado_generacion === 'generando' && vueltas++ < 22) temporizador = window.setTimeout(ciclo, 8000)
    }
    void ciclo()
    return () => { activo = false; window.clearTimeout(temporizador) }
  }, [cargar, habilitado])

  return { informe, recargar: cargar }
}

export default function EstadoInformeActividad({ actividadId, habilitado = true }: { actividadId: string; habilitado?: boolean }) {
  const { informe } = useInformeActividad(actividadId, habilitado)
  const [descargando, setDescargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!informe) return null

  const ia = informe.estado_generacion
  const pendienteRevision = informe.requiere_revision && !informe.revisado_en

  async function descargar() {
    if (!informe) return
    setDescargando(true)
    setError(null)
    try { await descargarInformePdf(informe) } catch (e) { setError((e as Error).message || 'No se pudo generar el PDF.') } finally { setDescargando(false) }
  }

  return (
    <section aria-label="Informe de cierre" className={cn('rounded-xl border p-3 text-sm',
      pendienteRevision ? 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30' : 'border-border bg-muted/40')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold text-foreground">
          <FileText size={16} className="text-muted-foreground" /> Informe {informe.numero}
        </p>
        <button type="button" onClick={() => void descargar()} disabled={descargando}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
          {descargando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {descargando ? 'Generando PDF…' : 'Descargar PDF'}
        </button>
      </div>
      <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
        {ia !== 'pendiente' && <li className="flex items-center gap-1.5">
          {ia === 'generando' ? <Loader2 size={13} className="animate-spin" />
            : ia === 'generado' ? <Sparkles size={13} className="text-emerald-600" />
              : ia === 'error' ? <AlertTriangle size={13} className="text-amber-600" /> : <Clock size={13} />}
          {ETIQUETA_GENERACION[ia]}
          {ia !== 'generado' && ' · el PDF incluye los datos y fotos registrados'}
        </li>}
        {pendienteRevision && <li className="text-amber-900 dark:text-amber-200">Pendiente de revisión del supervisor.</li>}
        {informe.revisado_en && (
          <li className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-600" /> Revisado por {informe.revisado_nombre}</li>
        )}
      </ul>
      {error && <p role="alert" className="mt-1.5 text-xs text-red-700 dark:text-red-300">{error}</p>}
    </section>
  )
}
