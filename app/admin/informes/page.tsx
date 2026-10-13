'use client'
// app/admin/informes/page.tsx
// Informes de cierre: descarga del PDF (se genera en este equipo), análisis
// opcional con IA, revisión del supervisor y registro de eventos/errores.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock, Download, FileText, History, Loader2, RefreshCw, Search, ShieldCheck, Sparkles, XCircle,
} from 'lucide-react'
import type { InformeCierre, InformeEvento } from '@/types'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { obtenerUrlsFirmadas } from '@/lib/chat/adjuntos'
import { ETIQUETA_CATEGORIA, ETIQUETA_GENERACION, OPCIONES_RESULTADO, llamarInformes } from '@/lib/informes/informes'
import { analisisLocal, descargarInformePdf } from '@/lib/informes/descargar'

type Filtro = 'todos' | 'revision' | 'revisados' | 'error'

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'revision', label: 'Requieren revisión' },
  { id: 'revisados', label: 'Revisados' },
  { id: 'error', label: 'Error de IA' },
]

const pendienteRevision = (i: InformeCierre) => i.requiere_revision && !i.revisado_en

function cumpleFiltro(i: InformeCierre, f: Filtro) {
  switch (f) {
    case 'revision': return pendienteRevision(i)
    case 'revisados': return !!i.revisado_en
    case 'error': return i.estado_generacion === 'error'
    default: return true
  }
}

function Estado({ i }: { i: InformeCierre }) {
  const gen = i.estado_generacion
  const clsGen = gen === 'generado' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
    : gen === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', clsGen)}>
        {gen === 'generando' ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
        {ETIQUETA_GENERACION[gen]}
      </span>
      {pendienteRevision(i) && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
          <AlertTriangle size={11} /> Requiere revisión
        </span>
      )}
      {i.revisado_en && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
          <ShieldCheck size={11} /> Revisado
        </span>
      )}
    </div>
  )
}

export default function InformesPage() {
  const [informes, setInformes] = useState<InformeCierre[]>([])
  const [cargando, setCargando] = useState(true)
  const [noInstalado, setNoInstalado] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [revisando, setRevisando] = useState<InformeCierre | null>(null)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [trabajando, setTrabajando] = useState<string | null>(null)
  // Hora de la última carga: sirve para detectar análisis atascados sin leer el reloj al renderizar.
  const [ahora, setAhora] = useState(0)
  // El análisis con IA es opcional: el botón solo aparece si la función está desplegada.
  const [iaActiva, setIaActiva] = useState(false)

  useEffect(() => {
    let activo = true
    void llamarInformes({ accion: 'estado' }).then(r => { if (activo) setIaActiva(r.ok && r.datos.ia === true) })
    return () => { activo = false }
  }, [])

  const cargar = useCallback(async () => {
    const { data, error } = await createClient().from('informes_cierre')
      .select('*').order('cerrado_en', { ascending: false }).limit(200)
    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01') setNoInstalado(true)
      else console.error('Error cargando informes:', error)
    } else {
      setInformes((data ?? []) as InformeCierre[])
      setAhora(Date.now())
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const canal = supabase.channel(`informes-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'informes_cierre' }, () => { void cargar() })
      .subscribe(estado => { if (estado === 'SUBSCRIBED') void cargar() })
    const inicial = window.setTimeout(() => { void cargar() }, 0)
    const intervalo = window.setInterval(() => { if (document.visibilityState === 'visible') void cargar() }, 20000)
    return () => { window.clearTimeout(inicial); window.clearInterval(intervalo); void supabase.removeChannel(canal) }
  }, [cargar])

  const conteo = useMemo(() => Object.fromEntries(FILTROS.map(f => [f.id, informes.filter(i => cumpleFiltro(i, f.id)).length])) as Record<Filtro, number>, [informes])
  const lista = informes.filter(i => cumpleFiltro(i, filtro)).filter(i => {
    const q = busqueda.trim().toLowerCase()
    return !q || [i.numero, i.hotel_nombre, i.area, i.tecnico_nombre, i.actividad_titulo].some(v => v.toLowerCase().includes(q))
  })

  async function accion(id: string, fn: () => ReturnType<typeof llamarInformes>, exito: string) {
    setTrabajando(id)
    setMensaje(null)
    const r = await fn()
    setTrabajando(null)
    setMensaje(r.ok ? { tipo: 'ok', texto: exito }
      : { tipo: 'error', texto: r.noDesplegada ? 'El análisis con IA no está activado (función "informes-cierre" sin desplegar). Los PDF se descargan igual.' : r.error })
    void cargar()
  }

  async function descargar(i: InformeCierre) {
    setTrabajando(`pdf-${i.id}`)
    setMensaje(null)
    try { await descargarInformePdf(i) } catch (e) {
      setMensaje({ tipo: 'error', texto: (e as Error).message || 'No se pudo generar el PDF.' })
    } finally { setTrabajando(null) }
  }

  return (
    <div className="space-y-6 fm-animate-fadein">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-800 text-foreground md:text-2xl">Informes de cierre</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Informes generados al cerrar operativos. El PDF se descarga en este equipo.</p>
        </div>
        {iaActiva && <Button variant="secondary" leftIcon={<RefreshCw size={15} />} className="min-h-[44px]"
          loading={trabajando === 'pendientes'}
          onClick={() => void accion('pendientes', () => llamarInformes({ accion: 'procesar_pendientes' }), 'Se están analizando con IA los informes pendientes.')}>
          Analizar pendientes con IA
        </Button>}
      </div>

      {mensaje && (
        <p role={mensaje.tipo === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-2 rounded-lg border p-3 text-sm',
          mensaje.tipo === 'error' ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
            : 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200')}>
          {mensaje.tipo === 'error' ? <AlertTriangle size={17} className="shrink-0" /> : <CheckCircle2 size={17} className="shrink-0" />}
          {mensaje.texto}
        </p>
      )}

      {noInstalado ? (
        <EmptyState icon={FileText} title="Informes no instalados"
          description="Ejecuta supabase/migrations/009_informes_cierre.sql y 010_informes_descarga_local.sql en el SQL Editor de Supabase." />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div role="tablist" aria-label="Filtrar informes" className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
              {FILTROS.map(f => (
                <button key={f.id} type="button" role="tab" aria-selected={filtro === f.id} onClick={() => setFiltro(f.id)}
                  className={cn('flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors',
                    filtro === f.id ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}>
                  {f.label}
                  {conteo[f.id] > 0 && f.id !== 'todos' && (
                    <span className={cn('rounded-full px-1.5 text-[10px] font-bold',
                      f.id === 'revision' || f.id === 'error' ? 'bg-amber-500 text-white' : 'bg-muted-foreground/20')}>{conteo[f.id]}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="relative sm:w-72">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input className="fm-input pl-10" placeholder="Buscar informe, hotel, área…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            </div>
          </div>

          {cargando ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          ) : lista.length === 0 ? (
            <EmptyState icon={FileText} title="Sin informes" description={filtro === 'todos' ? 'Los informes aparecen cuando un técnico cierra un operativo.' : 'No hay informes con este estado.'} />
          ) : (
            <ul className="space-y-3">
              {lista.map(i => (
                <TarjetaInforme key={i.id} i={i} ahora={ahora} iaActiva={iaActiva}
                  trabajando={trabajando === i.id} descargando={trabajando === `pdf-${i.id}`}
                  onDescargar={() => void descargar(i)}
                  onRevisar={() => setRevisando(i)}
                  onReintentar={() => void accion(i.id, () => llamarInformes({ accion: 'reintentar', informe_id: i.id }), `Reintentando el análisis de ${i.numero}.`)} />
              ))}
            </ul>
          )}
        </>
      )}

      {revisando && (
        <ModalRevision informe={revisando} onClose={() => setRevisando(null)}
          onHecho={(texto) => { setRevisando(null); setMensaje({ tipo: 'ok', texto }); void cargar() }} />
      )}
    </div>
  )
}

function TarjetaInforme({ i, ahora, iaActiva, trabajando, descargando, onDescargar, onRevisar, onReintentar }: {
  i: InformeCierre
  ahora: number
  iaActiva: boolean
  trabajando: boolean
  descargando: boolean
  onDescargar: () => void
  onRevisar: () => void
  onReintentar: () => void
}) {
  const [verEventos, setVerEventos] = useState(false)
  const conError = i.estado_generacion === 'error'
  const atascado = i.estado_generacion === 'generando' && ahora - new Date(i.updated_at).getTime() > 10 * 60_000

  return (
    <li className={cn('fm-card rounded-xl border bg-card p-4 shadow-xs',
      pendienteRevision(i) ? 'border-amber-300 dark:border-amber-800' : 'border-border')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
            <span className="font-mono">{i.numero}</span>
            <span className="font-normal text-muted-foreground">·</span>
            <span>{i.hotel_nombre}</span>
          </p>
          <p className="mt-0.5 text-sm text-foreground/80">{i.area}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {i.tecnico_nombre} · cerrado el {format(new Date(i.cerrado_en), 'dd/MM/yyyy HH:mm')} · {i.fotos.length} fotos
            {i.revisado_nombre && ` · revisado por ${i.revisado_nombre}`}
          </p>
        </div>
        <Estado i={i} />
      </div>

      {pendienteRevision(i) && i.motivos_revision.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="mb-1 font-semibold">Motivos de revisión</p>
          <ul className="list-disc space-y-0.5 pl-4">{i.motivos_revision.map(m => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
      {conError && i.ultimo_error && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          <XCircle size={14} className="mt-0.5 shrink-0" />
          <span>Análisis con IA: {i.ultimo_error} El PDF se descarga igual, con los datos del técnico.</span>
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
        <button type="button" onClick={onDescargar} disabled={descargando}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
          {descargando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {descargando ? 'Generando…' : 'Descargar PDF'}
        </button>
        <button type="button" onClick={onRevisar}
          className={cn('inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold',
            pendienteRevision(i) ? 'bg-amber-500 text-white hover:bg-amber-600' : 'border border-border hover:bg-muted')}>
          <ShieldCheck size={14} /> {i.revisado_en ? 'Editar revisión' : 'Revisar'}
        </button>
        {iaActiva && (conError || atascado) && (
          <button type="button" disabled={trabajando} onClick={onReintentar}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-60">
            {trabajando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Reintentar IA
          </button>
        )}
        <button type="button" onClick={() => setVerEventos(v => !v)}
          className="ml-auto inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-muted-foreground hover:bg-muted">
          <History size={14} /> Registro {verEventos ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>
      {verEventos && <Eventos informeId={i.id} actualizado={i.updated_at} />}
    </li>
  )
}

function Eventos({ informeId, actualizado }: { informeId: string; actualizado: string }) {
  const [eventos, setEventos] = useState<InformeEvento[] | null>(null)
  useEffect(() => {
    let activo = true
    createClient().from('informe_eventos').select('*').eq('informe_id', informeId).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { if (activo) setEventos((data ?? []) as InformeEvento[]) })
    return () => { activo = false }
  }, [informeId, actualizado])
  if (!eventos) return <Skeleton className="mt-3 h-16 rounded-lg" />
  return (
    <ol className="mt-3 space-y-1.5 rounded-lg bg-muted/40 p-3 text-xs">
      {eventos.length === 0 && <li className="text-muted-foreground">Sin eventos.</li>}
      {eventos.map(e => (
        <li key={e.id} className="flex gap-2">
          <span className="shrink-0 font-mono text-muted-foreground">{format(new Date(e.created_at), 'dd/MM HH:mm:ss')}</span>
          <span className={cn('shrink-0 font-semibold', e.tipo === 'error' ? 'text-red-700 dark:text-red-300' : 'text-foreground')}>{e.tipo}</span>
          <span className="min-w-0 break-words text-foreground/80">{e.mensaje}</span>
        </li>
      ))}
    </ol>
  )
}

const aLineas = (texto: string) => texto.split(/\r?\n/).map(l => l.replace(/^[-•*\s]+/, '').trim()).filter(Boolean).slice(0, 20)

function ModalRevision({ informe: i, onClose, onHecho }: { informe: InformeCierre; onClose: () => void; onHecho: (texto: string) => void }) {
  // Sin análisis de IA se parte del contenido armado con lo que registró el técnico.
  const a = i.analisis ?? analisisLocal(i)
  const [resumen, setResumen] = useState(a.resumen)
  const [hallazgos, setHallazgos] = useState(a.hallazgos.join('\n'))
  const [acciones, setAcciones] = useState(a.acciones.join('\n'))
  const [recomendaciones, setRecomendaciones] = useState(a.recomendaciones.join('\n'))
  const [pendientes, setPendientes] = useState(a.pendientes.join('\n'))
  const [nota, setNota] = useState(i.revision_nota ?? '')
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    void obtenerUrlsFirmadas(createClient(), i.fotos.map(f => f.path)).then(u => { if (activo) setUrls(u) })
    return () => { activo = false }
  }, [i.fotos])

  async function aprobar() {
    setGuardando(true)
    setError(null)
    const analisis = {
      ...a,
      resumen: resumen.trim(),
      hallazgos: aLineas(hallazgos),
      acciones: aLineas(acciones),
      recomendaciones: aLineas(recomendaciones),
      pendientes: aLineas(pendientes),
      editado_por_supervisor: true,
    }
    const { data, error: rpcError } = await createClient().rpc('revisar_informe_cierre', {
      p_informe_id: i.id, p_analisis: analisis, p_nota: nota.trim() || null,
    })
    setGuardando(false)
    if (rpcError) {
      setError(rpcError.code === 'PGRST202' || rpcError.code === '42883'
        ? 'Falta ejecutar supabase/migrations/010_informes_descarga_local.sql en Supabase.'
        : 'No se pudo guardar la revisión. Revisa tu conexión e inténtalo de nuevo.')
      return
    }
    const r = data as { ok: boolean; error?: string }
    if (!r?.ok) { setError(r?.error ?? 'No se pudo guardar la revisión.'); return }
    onHecho(`${i.numero} revisado. Descarga el PDF para obtener la versión aprobada.`)
  }

  const area = (etiqueta: string, valor: string, set: (v: string) => void, filas = 3, ayuda = 'Una línea por elemento.') => (
    <div>
      <label className="fm-label">{etiqueta}</label>
      <textarea className="fm-input resize-y text-sm" rows={filas} value={valor} onChange={e => set(e.target.value)} disabled={guardando} />
      {ayuda && <p className="mt-0.5 text-[11px] text-muted-foreground">{ayuda}</p>}
    </div>
  )

  return (
    <Modal open onClose={() => !guardando && onClose()} title={`Revisión del informe ${i.numero}`} maxWidth="2xl"
      footer={
        <div className="w-full space-y-3">
          {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}
          <div className="flex w-full flex-col gap-2 sm:flex-row-reverse">
            <Button onClick={() => void aprobar()} loading={guardando} disabled={guardando || resumen.trim().length < 10}
              className="w-full sm:w-auto" leftIcon={<ShieldCheck size={15} />}>Aprobar</Button>
            <Button variant="ghost" onClick={onClose} disabled={guardando} className="w-full sm:w-auto">Cancelar</Button>
          </div>
        </div>
      }>
      <div className="space-y-5">
        {i.motivos_revision.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle size={15} /> Motivos de revisión</p>
            <ul className="list-disc space-y-0.5 pl-5 text-xs">{i.motivos_revision.map(m => <li key={m}>{m}</li>)}</ul>
          </div>
        )}

        <section className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Registrado por el técnico</p>
          <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[9rem_1fr]">
            {([
              ['Hotel', i.hotel_nombre], ['Área exacta', i.area], ['Técnico', i.tecnico_nombre],
              ['Cierre', format(new Date(i.cerrado_en), 'dd/MM/yyyy HH:mm')],
              ['Resultado', OPCIONES_RESULTADO.find(o => o.id === i.resultado)?.titulo ?? i.resultado],
              ['Servicio', i.servicio], ['Hallazgos', i.hallazgos], ['Acciones', i.acciones],
              ...(i.observaciones ? [['Observaciones', i.observaciones]] : []),
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-xs font-semibold text-muted-foreground">{k}</dt>
                <dd className="whitespace-pre-wrap break-words text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Fotos{a.ia_disponible ? ' y análisis' : ''}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {i.fotos.map((f, idx) => {
              const info = a.fotos.find(x => x.indice === idx + 1)
              return (
                <figure key={f.path} className={cn('overflow-hidden rounded-lg border bg-card', info && !info.corresponde_a_categoria ? 'border-amber-400' : 'border-border')}>
                  {urls[f.path] ? (
                    <a href={urls[f.path]} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal */}
                      <img src={urls[f.path]} alt={ETIQUETA_CATEGORIA[f.categoria]} className="aspect-[4/3] w-full object-cover" />
                    </a>
                  ) : <div className="aspect-[4/3] w-full animate-pulse bg-muted" />}
                  <figcaption className="space-y-0.5 p-2 text-[11px]">
                    <p className="font-semibold text-foreground">{idx + 1}. {ETIQUETA_CATEGORIA[f.categoria]}</p>
                    {info?.descripcion && <p className="text-muted-foreground">{info.descripcion}</p>}
                    {info?.observacion && <p className="italic text-amber-700 dark:text-amber-400">{info.observacion}</p>}
                  </figcaption>
                </figure>
              )
            })}
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Contenido del informe {a.ia_disponible ? '(propuesto por la IA, editable)' : '(con los datos del técnico, editable)'}
          </p>
          <p className="flex items-start gap-1.5 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
            <Clock size={13} className="mt-0.5 shrink-0" />
            <span><strong>Servicio:</strong> {a.conclusion_servicio || '—'} <strong>Problema:</strong> {a.conclusion_problema || '—'}</span>
          </p>
          {area('Resumen', resumen, setResumen, 4, '')}
          {area('Hallazgos', hallazgos, setHallazgos)}
          {area('Acciones realizadas', acciones, setAcciones)}
          {area('Recomendaciones', recomendaciones, setRecomendaciones)}
          {area('Pendientes', pendientes, setPendientes)}
          <p className="text-[11px] text-muted-foreground">No agregues especies, productos ni resultados que el técnico no haya registrado.</p>
          {area('Nota de revisión (aparece en el PDF)', nota, setNota, 2, 'Opcional.')}
        </section>
      </div>
    </Modal>
  )
}
