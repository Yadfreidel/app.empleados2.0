'use client'
// components/informes/FormularioCierre.tsx
// Formulario del informe de cierre. Obligatorio: lo que se encontró y mínimo 2
// fotos. Área, servicio, acciones, productos, recomendaciones, pendientes y
// resultado son opcionales: si faltan, el servidor usa los datos del operativo.
// "Dictar reporte" solo propone campos: el técnico los revisa y confirma.
import { useCallback, useEffect, useState } from 'react'
import { Building2, Camera, CheckCircle2, ChevronDown, ChevronUp, ClipboardCheck, MapPin, Mic, Search } from 'lucide-react'
import type { Activity, CategoriaFotoInforme, ResultadoCierre } from '@/types'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useArchivosPendientes } from '@/lib/chat/useArchivosPendientes'
import { BotonesAdjuntar, MiniaturasPendientes } from '@/components/chat/SelectorFotos'
import { MAX_FOTOS_INFORME, OPCIONES_RESULTADO } from '@/lib/informes/informes'
import type { DatosInformeCierre } from '@/lib/offline/encolar'
import DictadoReporte, { type CamposDictado } from './DictadoReporte'

const MIN_FOTOS = 2
const MIN_TEXTO = 3

export function useFormularioCierre(onError: (mensaje: string) => void) {
  const [hallazgos, setHallazgos] = useState('')
  const [area, setArea] = useState('')
  const [servicio, setServicio] = useState('')
  const [acciones, setAcciones] = useState('')
  const [resultado, setResultado] = useState<ResultadoCierre>('servicio_realizado')
  const [productos, setProductos] = useState('')
  const [recomendaciones, setRecomendaciones] = useState('')
  const [pendientes, setPendientes] = useState('')
  const [masDetalles, setMasDetalles] = useState(false)
  // Dictado aplicado al formulario: exige que el técnico confirme haberlo revisado.
  const [dictadoId, setDictadoId] = useState<string | null>(null)
  const [dictadoRevisado, setDictadoRevisado] = useState(false)
  const soloFotos = useCallback((mensaje: string) => onError(mensaje.replace('archivos', 'fotos')), [onError])
  const fotos = useArchivosPendientes(MAX_FOTOS_INFORME, soloFotos)

  /** Mensaje con lo que falta, o null si se puede cerrar. */
  function validar(): string | null {
    const faltan: string[] = []
    if (hallazgos.trim().length < MIN_TEXTO) faltan.push('describir lo que se encontró')
    if (fotos.archivos.length < MIN_FOTOS) {
      const restan = MIN_FOTOS - fotos.archivos.length
      faltan.push(`${restan} foto${restan !== 1 ? 's' : ''} más (mínimo ${MIN_FOTOS})`)
    }
    if (fotos.archivos.some(a => !a.type.startsWith('image/'))) return 'Solo se admiten fotos en el informe (quita los PDF).'
    if (faltan.length) return `Para generar el informe falta: ${faltan.join(' y ')}.`
    if (dictadoId && !dictadoRevisado) return 'Revisa los datos del dictado y marca «Revisé y confirmo los datos» antes de cerrar.'
    return null
  }

  /** Pasa al formulario lo que se mencionó en el dictado; lo no mencionado no se toca. */
  function aplicarDictado(c: CamposDictado, id: string) {
    if (c.area) setArea(c.area)
    if (c.hallazgos) setHallazgos(c.hallazgos)
    if (c.trabajo_realizado) setAcciones(c.trabajo_realizado)
    if (c.productos) setProductos(c.productos)
    if (c.recomendaciones) setRecomendaciones(c.recomendaciones)
    if (c.pendientes) setPendientes(c.pendientes)
    setDictadoId(id)
    setDictadoRevisado(false)
    setMasDetalles(true)
  }

  function datos(): { archivos: File[]; informe: DatosInformeCierre } {
    const categorias: CategoriaFotoInforme[] = fotos.archivos.map(() => 'adicional')
    return {
      archivos: fotos.archivos,
      informe: { area, servicio, hallazgos, acciones, resultado, categorias, productos, recomendaciones, pendientes, dictadoId },
    }
  }

  function limpiar() {
    setHallazgos(''); setArea(''); setServicio(''); setAcciones(''); setResultado('servicio_realizado')
    setProductos(''); setRecomendaciones(''); setPendientes(''); setMasDetalles(false)
    setDictadoId(null); setDictadoRevisado(false)
    fotos.limpiar()
  }

  return {
    hallazgos, setHallazgos, area, setArea, servicio, setServicio, acciones, setAcciones, resultado, setResultado,
    productos, setProductos, recomendaciones, setRecomendaciones, pendientes, setPendientes,
    masDetalles, setMasDetalles, dictadoId, dictadoRevisado, setDictadoRevisado, aplicarDictado,
    fotos, validar, datos, limpiar,
  }
}

export type FormularioCierreEstado = ReturnType<typeof useFormularioCierre>

/** Áreas registradas del hotel, como sugerencias (se puede escribir otra). */
function useAreasHotel(hotelId: string) {
  const [areas, setAreas] = useState<string[]>([])
  useEffect(() => {
    let activo = true
    createClient().from('hotel_areas').select('nombre').eq('hotel_id', hotelId).eq('activo', true).order('orden')
      .then(({ data }) => { if (activo && data) setAreas(data.map(a => a.nombre as string)) }, () => {})
    return () => { activo = false }
  }, [hotelId])
  return areas
}

export default function FormularioCierre({ form, activity, disabled }: { form: FormularioCierreEstado; activity: Activity; disabled?: boolean }) {
  const areas = useAreasHotel(activity.hotel_id)
  const { masDetalles, setMasDetalles } = form
  const id = (campo: string) => `cierre-${campo}-${activity.id}`
  const cantidad = form.fotos.archivos.length
  const fotosListas = cantidad >= MIN_FOTOS

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
        <ClipboardCheck size={16} className="mt-0.5 shrink-0" />
        <p>Describe lo que encontraste y toma <strong>mínimo {MIN_FOTOS} fotos</strong>. Al cerrar se genera el informe en PDF automáticamente.</p>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm">
        <Building2 size={16} className="shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">Hotel:</span>
        <span className="font-semibold text-foreground">{activity.hotel?.name || '—'}</span>
      </div>

      <DictadoReporte actividadId={activity.id} disabled={disabled} onAplicar={form.aplicarDictado} />

      <div>
        <label htmlFor={id('hallazgos')} className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Search size={14} className="text-muted-foreground" /> ¿Qué se encontró? <span className="text-red-500" aria-hidden>*</span>
        </label>
        <textarea id={id('hallazgos')} value={form.hallazgos} onChange={e => form.setHallazgos(e.target.value)} rows={4} maxLength={3000}
          disabled={disabled} className="fm-input w-full resize-y text-sm"
          placeholder='Ej.: Actividad de cucarachas en el drenaje de la cocina; grasa acumulada bajo la freidora. Si no hubo nada, escribe "Sin hallazgos".' />
      </div>

      <section aria-label="Fotos del informe" className={cn('rounded-xl border p-3',
        fotosListas ? 'border-border' : 'border-dashed border-amber-300 dark:border-amber-800')}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            {fotosListas ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Camera size={14} className="text-muted-foreground" />}
            Fotos <span className="text-red-500" aria-hidden>*</span>
            <span className="font-normal text-muted-foreground">(mínimo {MIN_FOTOS})</span>
          </p>
          <span className="shrink-0 text-xs text-muted-foreground">{cantidad}/{MAX_FOTOS_INFORME}</span>
        </div>
        <div className="flex gap-2">
          <BotonesAdjuntar variante="boton" soloImagenes onArchivos={form.fotos.agregar} disabled={disabled || cantidad >= MAX_FOTOS_INFORME} />
        </div>
        <div className="mt-2"><MiniaturasPendientes grande pendientes={form.fotos.pendientes} onQuitar={form.fotos.quitar} disabled={disabled} /></div>
        <p className="mt-2 text-xs text-muted-foreground">Las fotos se reducen automáticamente y también quedarán en el chat de la actividad.</p>
      </section>

      <div className="rounded-xl border border-border">
        <button type="button" onClick={() => setMasDetalles(v => !v)} aria-expanded={masDetalles}
          className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 text-sm font-semibold text-foreground">
          <span>Más detalles <span className="font-normal text-muted-foreground">(opcional)</span></span>
          {masDetalles ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {masDetalles && (
          <div className="space-y-4 border-t border-border p-3">
            <div>
              <label htmlFor={id('area')} className="mb-1 block text-sm font-semibold text-foreground">Área exacta</label>
              <div className="relative">
                <MapPin size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input id={id('area')} list={id('areas')} value={form.area} onChange={e => form.setArea(e.target.value)}
                  maxLength={200} disabled={disabled} className="fm-input w-full pl-9 text-sm" autoComplete="off"
                  placeholder={activity.title} />
                <datalist id={id('areas')}>{areas.map(a => <option key={a} value={a} />)}</datalist>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Si lo dejas vacío se usa el nombre del operativo.</p>
            </div>
            <div>
              <label htmlFor={id('servicio')} className="mb-1 block text-sm font-semibold text-foreground">Servicio realizado</label>
              <input id={id('servicio')} value={form.servicio} onChange={e => form.setServicio(e.target.value)} maxLength={1000}
                disabled={disabled} className="fm-input w-full text-sm" placeholder={activity.operation_type?.name ?? 'Fumigación'} />
            </div>
            <div>
              <label htmlFor={id('acciones')} className="mb-1 block text-sm font-semibold text-foreground">Acciones realizadas</label>
              <textarea id={id('acciones')} value={form.acciones} onChange={e => form.setAcciones(e.target.value)} rows={2} maxLength={3000}
                disabled={disabled} className="fm-input w-full resize-y text-sm" placeholder="Qué hiciste (una línea por acción)." />
            </div>
            <div>
              <label htmlFor={id('productos')} className="mb-1 block text-sm font-semibold text-foreground">Productos mencionados</label>
              <input id={id('productos')} value={form.productos} onChange={e => form.setProductos(e.target.value)} maxLength={1000}
                disabled={disabled} className="fm-input w-full text-sm" placeholder="Solo los que usaste (p. ej. gel)" />
            </div>
            <div>
              <label htmlFor={id('recomendaciones')} className="mb-1 block text-sm font-semibold text-foreground">Recomendaciones</label>
              <textarea id={id('recomendaciones')} value={form.recomendaciones} onChange={e => form.setRecomendaciones(e.target.value)} rows={2} maxLength={3000}
                disabled={disabled} className="fm-input w-full resize-y text-sm" placeholder="Una línea por recomendación." />
            </div>
            <div>
              <label htmlFor={id('pendientes')} className="mb-1 block text-sm font-semibold text-foreground">Pendientes</label>
              <textarea id={id('pendientes')} value={form.pendientes} onChange={e => form.setPendientes(e.target.value)} rows={2} maxLength={3000}
                disabled={disabled} className="fm-input w-full resize-y text-sm" placeholder="Lo que queda para la próxima visita." />
            </div>
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold text-foreground">Resultado</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {OPCIONES_RESULTADO.map(op => (
                  <label key={op.id} className={cn(
                    'flex cursor-pointer flex-col gap-0.5 rounded-xl border p-3 text-sm transition-colors',
                    form.resultado === op.id ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40' : 'border-border bg-card hover:bg-muted',
                    disabled && 'pointer-events-none opacity-60',
                  )}>
                    <span className="flex items-center gap-2 font-semibold text-foreground">
                      <input type="radio" name={id('resultado')} value={op.id} checked={form.resultado === op.id}
                        onChange={() => form.setResultado(op.id)} disabled={disabled} className="accent-emerald-600" />
                      {op.titulo}
                    </span>
                    <span className="text-xs text-muted-foreground">{op.ayuda}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}
      </div>
      {form.dictadoId && (
        <label className={cn('flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm',
          form.dictadoRevisado ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30')}>
          <input type="checkbox" checked={form.dictadoRevisado} onChange={e => form.setDictadoRevisado(e.target.checked)}
            disabled={disabled} className="mt-0.5 h-4 w-4 accent-emerald-600" />
          <span>
            <span className="flex items-center gap-1.5 font-semibold text-foreground"><Mic size={14} /> Revisé y confirmo los datos del dictado</span>
            <span className="block text-xs text-muted-foreground">Corrige arriba lo que no sea correcto. El servicio no se cierra hasta que pulses «Cerrar y generar informe».</span>
          </span>
        </label>
      )}
    </div>
  )
}
