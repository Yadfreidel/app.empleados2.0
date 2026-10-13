'use client'
// app/admin/excelencia/page.tsx
// Excelencia del mes: ranking de cumplimiento por supervisor, detalle del
// cálculo y publicación del empleado del mes. El cálculo y los permisos se
// verifican en el servidor (migración 014).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { AlertTriangle, CheckCircle2, Eye, ImagePlus, ListChecks, Medal, Save, Trophy, Undo2, UserRound, Users } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import TarjetaEmpleadoMes from '@/components/excelencia/TarjetaEmpleadoMes'
import { cn } from '@/lib/utils'
import { BUCKET_AVATARES } from '@/lib/perfil/perfil'
import { createClient } from '@/lib/supabase/client'
import {
  BUCKET_EMPLEADO_MES, ETIQUETA_CLASIFICACION, esNoInstalado, inicioMes, nombreMes, urlFoto,
  type EmpleadoMes, type FilaDetalle, type FilaRanking,
} from '@/lib/excelencia/excelencia'

const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FOTO = 3 * 1024 * 1024

function mesAnterior() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return format(d, 'yyyy-MM')
}

type Mensaje = { tipo: 'ok' | 'error'; texto: string } | null

export default function ExcelenciaPage() {
  const [mes, setMes] = useState(mesAnterior)
  const [ranking, setRanking] = useState<FilaRanking[] | null>(null)
  const [sinSupervisor, setSinSupervisor] = useState(0)
  const [minimo, setMinimo] = useState<number | null>(null)
  const [minimoEditado, setMinimoEditado] = useState('')
  const [publicaciones, setPublicaciones] = useState<EmpleadoMes[]>([])
  const [noInstalado, setNoInstalado] = useState(false)
  const [mensaje, setMensaje] = useState<Mensaje>(null)
  const [detalle, setDetalle] = useState<FilaRanking | 'sin_supervisor' | null>(null)
  const [publicando, setPublicando] = useState<FilaRanking | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  const cargar = useCallback(async () => {
    const supabase = createClient()
    setRanking(null)
    const [r, s, c, p] = await Promise.all([
      supabase.rpc('excelencia_ranking', { p_mes: inicioMes(mes) }),
      supabase.rpc('excelencia_detalle', { p_mes: inicioMes(mes), p_supervisor: null }),
      supabase.from('app_configuracion').select('excelencia_minimo_operativos').eq('id', 1).maybeSingle(),
      supabase.from('empleado_mes').select('*').order('mes', { ascending: false }).limit(24),
    ])
    if (esNoInstalado(r.error) || esNoInstalado(p.error)) { setNoInstalado(true); setRanking([]); return }
    if (r.error) setMensaje({ tipo: 'error', texto: 'No se pudo calcular el ranking. Revisa tu conexión.' })
    setRanking((r.data ?? []) as FilaRanking[])
    setSinSupervisor(((s.data ?? []) as FilaDetalle[]).filter(f => f.clasificacion === 'sin_supervisor').length)
    const n = (c.data as { excelencia_minimo_operativos?: number } | null)?.excelencia_minimo_operativos ?? 5
    setMinimo(n)
    setMinimoEditado(String(n))
    setPublicaciones((p.data ?? []) as EmpleadoMes[])
  }, [mes])

  useEffect(() => {
    const t = window.setTimeout(() => { void cargar() }, 0)
    return () => window.clearTimeout(t)
  }, [cargar])

  const participantes = useMemo(() => (ranking ?? []).filter(f => f.participa), [ranking])
  const top5 = participantes.filter(f => f.posicion !== null && f.posicion <= 5).slice(0, 5)
  const fuera = (ranking ?? []).filter(f => !f.participa)
  const primeros = participantes.filter(f => f.posicion === 1)
  const vigente = publicaciones.find(p => p.estado === 'publicado') ?? null
  const delMes = publicaciones.find(p => p.mes.slice(0, 7) === mes) ?? null

  async function guardarMinimo() {
    const n = Number(minimoEditado)
    if (!Number.isInteger(n) || n < 1 || n > 500) { setMensaje({ tipo: 'error', texto: 'El mínimo debe ser un número entero entre 1 y 500.' }); return }
    setTrabajando(true)
    const { error } = await createClient().from('app_configuracion').update({ excelencia_minimo_operativos: n }).eq('id', 1)
    setTrabajando(false)
    setMensaje(error ? { tipo: 'error', texto: 'No se pudo guardar el mínimo.' } : { tipo: 'ok', texto: `Mínimo actualizado a ${n} operativos.` })
    if (!error) void cargar()
  }

  async function retirar(p: EmpleadoMes) {
    if (!window.confirm(`¿Retirar el reconocimiento de ${p.nombre} del calendario? Quedará en el historial.`)) return
    setTrabajando(true)
    const { data, error } = await createClient().rpc('retirar_empleado_mes', { p_id: p.id })
    setTrabajando(false)
    const r = data as { ok: boolean; error?: string } | null
    setMensaje(error || !r?.ok ? { tipo: 'error', texto: r?.error ?? 'No se pudo retirar.' } : { tipo: 'ok', texto: 'Reconocimiento retirado del calendario.' })
    void cargar()
  }

  return (
    <div className="space-y-6 fm-animate-fadein">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-800 text-foreground md:text-2xl"><Trophy size={22} className="text-amber-500" /> Excelencia del mes</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Cumplimiento = completados y validados ÷ asignados evaluables × 100</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="fm-label">Mes</span>
            <input type="month" className="fm-input min-h-[44px]" value={mes} max={format(new Date(), 'yyyy-MM')} onChange={e => e.target.value && setMes(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="fm-label">Mínimo para participar</span>
            <span className="flex gap-2">
              <input type="number" min={1} max={500} className="fm-input min-h-[44px] w-24" value={minimoEditado} onChange={e => setMinimoEditado(e.target.value)} />
              <Button variant="secondary" className="min-h-[44px]" onClick={() => void guardarMinimo()} disabled={trabajando || minimoEditado === String(minimo)} aria-label="Guardar mínimo">
                <Save size={15} />
              </Button>
            </span>
          </label>
        </div>
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
        <EmptyState icon={Trophy} title="Excelencia del mes no instalada" description="Ejecuta supabase/migrations/014_excelencia_del_mes.sql en el SQL Editor de Supabase." />
      ) : ranking === null ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {nombreMes(inicioMes(mes))}. Cuentan los operativos publicados con fecha vencida del mes, asignados a un supervisor;
            se excluyen cancelados y bloqueos con justificación aprobada. Validados: por un administrador o con informe de cierre aprobado.
            {sinSupervisor > 0 && (
              <button type="button" onClick={() => setDetalle('sin_supervisor')} className="ml-1 font-semibold text-amber-700 underline underline-offset-2 dark:text-amber-400">
                {sinSupervisor} operativo{sinSupervisor !== 1 ? 's' : ''} sin supervisor asignado (no se atribuyen a nadie).
              </button>
            )}
          </p>

          {primeros.length > 1 && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle size={17} className="shrink-0" />
              Empate en el primer puesto ({primeros.map(p => p.nombre).join(', ')}) que la calidad validada no resuelve. Decide al publicar.
            </p>
          )}

          {top5.length === 0 ? (
            <EmptyState icon={Users} title="Nadie participa este mes"
              description={`Ningún supervisor tiene al menos ${minimo ?? '—'} operativos evaluables en ${nombreMes(inicioMes(mes)).toLowerCase()}.`} />
          ) : (
            <ol className="space-y-3">
              {top5.map(f => (
                <li key={f.supervisor_id} className={cn('fm-card flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4 shadow-xs',
                  f.posicion === 1 ? 'border-amber-300 dark:border-amber-800' : 'border-border')}>
                  <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold',
                    f.posicion === 1 ? 'bg-amber-400 text-white' : f.posicion === 2 ? 'bg-slate-300 text-slate-800' : f.posicion === 3 ? 'bg-orange-300 text-orange-900' : 'bg-muted text-muted-foreground')}
                    aria-label={`Puesto ${f.posicion}`}>
                    {f.posicion === 1 ? <Medal size={20} /> : f.posicion}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-bold text-foreground">
                      {f.nombre}
                      {f.empatado && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300">Empate</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{f.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold tabular-nums text-foreground">{Number(f.porcentaje).toLocaleString('es-DO')} %</p>
                    <p className="text-xs text-muted-foreground">
                      {f.completados}/{f.asignados} completados{f.calidad_promedio !== null && ` · calidad ${Number(f.calidad_promedio).toLocaleString('es-DO')}`}
                    </p>
                  </div>
                  <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
                    <Button variant="secondary" size="sm" className="min-h-[40px]" leftIcon={<ListChecks size={14} />} onClick={() => setDetalle(f)}>Detalle</Button>
                    {f.posicion === 1 && (
                      <Button size="sm" className="min-h-[40px]" leftIcon={<Trophy size={14} />} onClick={() => setPublicando(f)}>
                        {delMes?.supervisor_id === f.supervisor_id && delMes.estado === 'publicado' ? 'Editar publicación' : 'Publicar como empleado del mes'}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}

          {fuera.length > 0 && (
            <details className="rounded-xl border border-border p-3 text-sm">
              <summary className="cursor-pointer font-semibold text-foreground">No alcanzan el mínimo ({fuera.length})</summary>
              <ul className="mt-2 space-y-1">
                {fuera.map(f => (
                  <li key={f.supervisor_id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{f.nombre} <span className="text-xs text-muted-foreground">· {f.asignados} evaluables (mínimo {minimo})</span></span>
                    <button type="button" className="text-xs font-semibold text-emerald-700 underline dark:text-emerald-400" onClick={() => setDetalle(f)}>Detalle</button>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <section className="space-y-3">
            <h2 className="text-base font-bold text-foreground">Publicado en el calendario</h2>
            {vigente ? (
              <div className="flex flex-wrap items-start gap-4">
                <TarjetaEmpleadoMes className="w-full max-w-sm" plegable={false} datos={{
                  nombre: vigente.nombre, mes: vigente.mes, mensaje: vigente.mensaje, fotoUrl: urlFoto(vigente.foto_path), porcentaje: Number(vigente.porcentaje),
                }} />
                <Button variant="secondary" className="min-h-[44px]" leftIcon={<Undo2 size={15} />} onClick={() => void retirar(vigente)} disabled={trabajando}>
                  Retirar del calendario
                </Button>
              </div>
            ) : <p className="text-sm text-muted-foreground">No hay ningún reconocimiento publicado.</p>}
            {publicaciones.length > 0 && (
              <details className="rounded-xl border border-border p-3 text-sm">
                <summary className="cursor-pointer font-semibold text-foreground">Historial ({publicaciones.length})</summary>
                <ul className="mt-2 divide-y divide-border">
                  {publicaciones.map(p => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span><strong>{nombreMes(p.mes)}</strong> · {p.nombre} · {Number(p.porcentaje).toLocaleString('es-DO')} % ({p.completados}/{p.asignados}){p.desempate_manual && ' · desempate del admin'}</span>
                      <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold',
                        p.estado === 'publicado' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>
                        {p.estado === 'publicado' ? 'Publicado' : p.estado === 'retirado' ? 'Retirado' : 'Sustituido'}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </>
      )}

      {detalle && <ModalDetalle mes={mes} fila={detalle} onClose={() => setDetalle(null)} />}
      {publicando && (
        <ModalPublicar mes={mes} fila={publicando} empate={primeros.length > 1} previa={delMes?.supervisor_id === publicando.supervisor_id ? delMes : null}
          onClose={() => setPublicando(null)}
          onHecho={() => { setPublicando(null); setMensaje({ tipo: 'ok', texto: 'Publicado. Ya se ve en el calendario.' }); void cargar() }} />
      )}
    </div>
  )
}

function ModalDetalle({ mes, fila, onClose }: { mes: string; fila: FilaRanking | 'sin_supervisor'; onClose: () => void }) {
  const [filas, setFilas] = useState<FilaDetalle[] | null>(null)
  const supervisor = fila === 'sin_supervisor' ? null : fila
  useEffect(() => {
    let activo = true
    createClient().rpc('excelencia_detalle', { p_mes: inicioMes(mes), p_supervisor: supervisor?.supervisor_id ?? null })
      .then(({ data }) => { if (activo) setFilas((data ?? []) as FilaDetalle[]) })
    return () => { activo = false }
  }, [mes, supervisor?.supervisor_id])
  const evaluables = filas?.filter(f => f.evaluable).length ?? 0
  const cumplidos = filas?.filter(f => f.cumplido).length ?? 0

  return (
    <Modal open onClose={onClose} title={supervisor ? `Detalle · ${supervisor.nombre}` : 'Operativos sin supervisor'} maxWidth="2xl">
      {!filas ? <Skeleton className="h-40 rounded-xl" /> : (
        <div className="space-y-3 text-sm">
          {supervisor && (
            <p className="rounded-lg bg-muted/50 p-3">
              {nombreMes(inicioMes(mes))}: <strong>{cumplidos}</strong> completados y validados ÷ <strong>{evaluables}</strong> asignados evaluables × 100 =
              <strong> {evaluables ? (Math.round((cumplidos / evaluables) * 1000) / 10).toLocaleString('es-DO') : 0} %</strong>
            </p>
          )}
          {filas.length === 0 ? <p className="text-muted-foreground">Sin operativos en el mes.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border text-muted-foreground">
                  <tr><th className="py-2 pr-3">Fecha</th><th className="py-2 pr-3">Operativo</th><th className="py-2 pr-3">Estado</th><th className="py-2 pr-3">Cuenta como</th><th className="py-2">Validación</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filas.map(f => (
                    <tr key={f.actividad_id}>
                      <td className="whitespace-nowrap py-2 pr-3">{format(new Date(`${f.fecha}T12:00:00`), 'dd/MM')}</td>
                      <td className="py-2 pr-3">{f.titulo}<span className="block text-muted-foreground">{f.hotel ?? ''}</span></td>
                      <td className="py-2 pr-3">{f.estado}</td>
                      <td className={cn('py-2 pr-3 font-semibold', f.cumplido ? 'text-emerald-700 dark:text-emerald-400' : f.evaluable ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground')}>
                        {ETIQUETA_CLASIFICACION[f.clasificacion]}
                      </td>
                      <td className="py-2">{f.validacion ?? '—'}{f.calidad ? ` · ★${f.calidad}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function ModalPublicar({ mes, fila, empate, previa, onClose, onHecho }: {
  mes: string
  fila: FilaRanking
  empate: boolean
  previa: EmpleadoMes | null
  onClose: () => void
  onHecho: () => void
}) {
  const [foto, setFoto] = useState<File | null>(null)
  const [vista, setVista] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState(previa?.mensaje ?? `¡Felicidades, ${fila.nombre.split(' ')[0]}! Gracias por tu compromiso y excelente trabajo este mes.`)
  const [autorizada, setAutorizada] = useState(false)
  const [desempate, setDesempate] = useState(false)
  const [previsualizar, setPrevisualizar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Foto de perfil del supervisor (migración 015), si tiene: se puede usar previa confirmación.
  const [fotoPerfil, setFotoPerfil] = useState<string | null>(null)
  const [confirmarPerfil, setConfirmarPerfil] = useState(false)

  useEffect(() => {
    let activo = true
    const supabase = createClient()
    void supabase.from('profiles').select('avatar_path').eq('id', fila.supervisor_id).maybeSingle().then(async ({ data }) => {
      const ruta = (data as { avatar_path?: string | null } | null)?.avatar_path
      if (!ruta) return
      const { data: firmada } = await supabase.storage.from(BUCKET_AVATARES).createSignedUrl(ruta, 600)
      if (activo && firmada?.signedUrl) setFotoPerfil(firmada.signedUrl)
    }, () => {})
    return () => { activo = false }
  }, [fila.supervisor_id])

  async function usarFotoPerfil() {
    if (!fotoPerfil) return
    try {
      const r = await fetch(fotoPerfil)
      const blob = await r.blob()
      if (!r.ok || !TIPOS_FOTO.includes(blob.type) || blob.size > MAX_FOTO) throw new Error()
      setFoto(new File([blob], 'foto-perfil.jpg', { type: blob.type }))
      setConfirmarPerfil(false)
      setError(null)
    } catch {
      setError('No se pudo usar la foto de perfil. Sube una foto manualmente.')
    }
  }

  useEffect(() => {
    if (!foto) { setVista(null); return }
    const url = URL.createObjectURL(foto)
    setVista(url)
    return () => URL.revokeObjectURL(url)
  }, [foto])

  const fotoUrl = vista ?? (previa ? urlFoto(previa.foto_path) : null)
  const listo = !!fotoUrl && autorizada && mensaje.trim().length >= 10 && (!empate || desempate)

  async function publicar() {
    setGuardando(true)
    setError(null)
    const supabase = createClient()
    let ruta = previa?.foto_path ?? null
    let subida: string | null = null
    try {
      if (foto) {
        const ext = foto.type === 'image/png' ? 'png' : foto.type === 'image/webp' ? 'webp' : 'jpg'
        ruta = `${mes}/${crypto.randomUUID()}.${ext}`
        const { error: e } = await supabase.storage.from(BUCKET_EMPLEADO_MES).upload(ruta, foto, { contentType: foto.type, upsert: false })
        if (e) throw new Error('No se pudo subir la foto.')
        subida = ruta
      }
      const { data, error: e } = await supabase.rpc('publicar_empleado_mes', {
        p_mes: inicioMes(mes), p_supervisor_id: fila.supervisor_id, p_mensaje: mensaje.trim(),
        p_foto_path: ruta, p_foto_autorizada: autorizada, p_desempate_manual: empate && desempate,
      })
      const r = data as { ok: boolean; error?: string } | null
      if (e || !r?.ok) throw new Error(r?.error ?? 'No se pudo publicar.')
      // La foto anterior de esta publicación ya no se usa.
      if (subida && previa?.foto_path && previa.foto_path !== subida) await supabase.storage.from(BUCKET_EMPLEADO_MES).remove([previa.foto_path])
      onHecho()
    } catch (err) {
      if (subida) await supabase.storage.from(BUCKET_EMPLEADO_MES).remove([subida])
      setError((err as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal open onClose={() => !guardando && onClose()} title={`Empleado del mes · ${nombreMes(inicioMes(mes))}`} maxWidth="lg"
      footer={
        <div className="w-full space-y-3">
          {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}
          <div className="flex w-full flex-col gap-2 sm:flex-row-reverse">
            {previsualizar ? (
              <Button onClick={() => void publicar()} loading={guardando} disabled={!listo || guardando} leftIcon={<Trophy size={15} />} className="w-full sm:w-auto">Publicar en el calendario</Button>
            ) : (
              <Button onClick={() => setPrevisualizar(true)} disabled={!listo} leftIcon={<Eye size={15} />} className="w-full sm:w-auto">Previsualizar</Button>
            )}
            {previsualizar && <Button variant="secondary" onClick={() => setPrevisualizar(false)} disabled={guardando} className="w-full sm:w-auto">Volver a editar</Button>}
            <Button variant="ghost" onClick={onClose} disabled={guardando} className="w-full sm:w-auto">Cancelar</Button>
          </div>
        </div>
      }>
      {previsualizar ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Así se verá en la esquina del calendario para todos los usuarios:</p>
          <TarjetaEmpleadoMes plegable={false} datos={{ nombre: fila.nombre, mes: inicioMes(mes), mensaje: mensaje.trim(), fotoUrl, porcentaje: Number(fila.porcentaje) }} />
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <p className="rounded-lg bg-muted/50 p-3">
            <strong>{fila.nombre}</strong> · {Number(fila.porcentaje).toLocaleString('es-DO')} % ({fila.completados}/{fila.asignados})
          </p>
          <div className="flex items-center gap-4">
            {fotoUrl
              // eslint-disable-next-line @next/next/no-img-element -- vista previa local
              ? <img src={fotoUrl} alt="Foto seleccionada" className="h-20 w-20 rounded-full border-2 border-amber-400 object-cover" />
              : <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-border text-muted-foreground"><ImagePlus size={22} /></div>}
            <label className="fm-btn fm-btn-secondary fm-btn-sm min-h-[40px] cursor-pointer px-3">
              <ImagePlus size={14} /> {fotoUrl ? 'Cambiar foto' : 'Subir foto'}
              <input type="file" accept={TIPOS_FOTO.join(',')} className="hidden" onChange={e => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                if (!TIPOS_FOTO.includes(f.type)) { setError('La foto debe ser JPG, PNG o WEBP.'); return }
                if (f.size > MAX_FOTO) { setError('La foto no puede superar 3 MB.'); return }
                setError(null)
                setFoto(f)
              }} />
            </label>
          </div>
          {fotoPerfil && (
            confirmarPerfil ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-fm-navy-200 bg-fm-navy-50 p-3 dark:border-fm-navy-800 dark:bg-fm-navy-950/50">
                {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal */}
                <img src={fotoPerfil} alt={`Foto de perfil de ${fila.nombre}`} className="h-14 w-14 rounded-full object-cover" />
                <p className="min-w-0 flex-1 text-xs">¿Usar la foto de perfil de <strong>{fila.nombre}</strong> para el reconocimiento?</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void usarFotoPerfil()}>Sí, usarla</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmarPerfil(false)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmarPerfil(true)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted">
                <UserRound size={14} /> Usar su foto de perfil
              </button>
            )
          )}
          <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" checked={autorizada} onChange={e => setAutorizada(e.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" />
            <span>Confirmo que <strong>{fila.nombre}</strong> autorizó publicar esta foto en el calendario.</span>
          </label>
          <div>
            <label className="fm-label" htmlFor="felicitacion">Felicitación</label>
            <textarea id="felicitacion" className="fm-input w-full resize-y" rows={3} maxLength={500} value={mensaje} onChange={e => setMensaje(e.target.value)} />
            <p className="mt-0.5 text-right text-xs text-muted-foreground">{mensaje.trim().length}/500 (mínimo 10)</p>
          </div>
          {empate && (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
              <input type="checkbox" checked={desempate} onChange={e => setDesempate(e.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-600" />
              <span>Hay un empate en el primer puesto. Decido desempatar a favor de <strong>{fila.nombre}</strong>.</span>
            </label>
          )}
        </div>
      )}
    </Modal>
  )
}
