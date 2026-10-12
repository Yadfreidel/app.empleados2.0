'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { format, getDaysInMonth, isSunday, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, LogIn, Clock, Building2, FileDown, Loader2 } from 'lucide-react'
import { useConfiguracion } from '@/lib/configuracion/useConfiguracion'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import {
  alternarCelda,
  confirmarServicio,
  type EstadoServicio,
  type MatrizMensual,
  type ServicioArea,
} from '@/lib/calendario-hotel/datos'

type Props = {
  matriz: MatrizMensual
  editable?: boolean
  puedeConfirmar?: boolean
  rutaBase: string
  showMonthNav?: boolean
  onServiceUpdate?: (servicio: ServicioArea) => void
}

const ESTILO: Record<EstadoServicio, { clase: string; texto: string }> = {
  programado: { clase: 'bg-sky-600 text-white hover:bg-sky-700', texto: 'Programado' },
  realizado: { clase: 'bg-emerald-600 text-white hover:bg-emerald-700', texto: 'Realizado' },
  reprogramado: { clase: 'bg-amber-400 text-amber-950 hover:bg-amber-500', texto: 'Reprogramado' },
  cancelado: { clase: 'bg-zinc-300 text-zinc-600 line-through', texto: 'Cancelado' },
}
const LETRA = ['D', 'L', 'M', 'MI', 'J', 'V', 'S']

export default function AreaMatrix({
  matriz,
  editable = false,
  puedeConfirmar = false,
  rutaBase,
  showMonthNav = true,
  onServiceUpdate,
}: Props) {
  const { hotel, anio, mes, areas, servicios } = matriz
  const dias = Array.from({ length: getDaysInMonth(new Date(anio, mes - 1)) }, (_, indice) =>
    new Date(anio, mes - 1, indice + 1))
  const [pendiente, iniciar] = useTransition()
  const [servicioObjetivo, setServicioObjetivo] = useState<ServicioArea | null>(null)
  const [nota, setNota] = useState('')
  const [errorConfirmacion, setErrorConfirmacion] = useState<string | null>(null)
  const [exitoConfirmacion, setExitoConfirmacion] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [errorExportar, setErrorExportar] = useState<string | null>(null)
  const { config } = useConfiguracion()

  async function exportarPdf() {
    setExportando(true)
    setErrorExportar(null)
    try {
      const { exportarCalendarioPdf } = await import('@/lib/calendario-hotel/exportar-pdf')
      await exportarCalendarioPdf(matriz, config.nombre_empresa)
    } catch (error) {
      console.error(error)
      setErrorExportar('No se pudo generar el PDF. Inténtalo de nuevo.')
    } finally {
      setExportando(false)
    }
  }

  const mapa = new Map(servicios.map((servicio) => [`${servicio.area_id}|${servicio.fecha}`, servicio]))
  const mesPrevio = mes === 1 ? `${anio - 1}-12` : `${anio}-${String(mes - 1).padStart(2, '0')}`
  const mesSiguiente = mes === 12 ? `${anio + 1}-01` : `${anio}-${String(mes + 1).padStart(2, '0')}`
  const titulo = format(new Date(anio, mes - 1), 'MMMM yyyy', { locale: es })

  function clic(areaId: string, fecha: string) {
    const actual = mapa.get(`${areaId}|${fecha}`)
    if (editable) {
      const estadoActual = actual?.estado ?? 'vacio'
      iniciar(async () => {
        const resultado = await alternarCelda({ areaId, fecha, estadoActual, ruta: rutaBase })
        if (!resultado.ok) alert(resultado.error)
      })
      return
    }

    if (actual) {
      setServicioObjetivo(actual)
      setNota('')
      setErrorConfirmacion(null)
      setExitoConfirmacion(false)
    }
  }

  async function confirmar() {
    if (!servicioObjetivo) return
    setGuardando(true)
    setErrorConfirmacion(null)
    try {
      const resultado = await confirmarServicio({
        areaId: servicioObjetivo.area_id,
        fecha: servicioObjetivo.fecha,
        nota,
      })
      if (!resultado.ok) {
        setErrorConfirmacion(resultado.error)
      } else {
        setExitoConfirmacion(true)
        onServiceUpdate?.(resultado.servicio)
        setTimeout(() => {
          setServicioObjetivo(null)
          setExitoConfirmacion(false)
        }, 1200)
      }
    } catch {
      setErrorConfirmacion('No se pudo guardar la confirmación. Vuelve a intentarlo.')
    } finally {
      setGuardando(false)
    }
  }

  const areaSeleccionada = servicioObjetivo
    ? areas.find((a) => a.id === servicioObjetivo.area_id)
    : null

  return (
    <section className="space-y-3" aria-busy={pendiente || guardando}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-foreground">{hotel.name}</h3>
          <p className="capitalize text-sm text-muted-foreground">Calendario de servicio · {titulo}</p>
        </div>
        <div className="flex items-center gap-2">
        {areas.length > 0 && (
          <button
            type="button"
            id="btn-exportar-calendario-pdf"
            onClick={exportarPdf}
            disabled={exportando}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-2xs transition-colors hover:bg-muted disabled:opacity-60"
          >
            {exportando ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
            {exportando ? 'Generando…' : 'Exportar PDF'}
          </button>
        )}
        {showMonthNav && (
          <nav className="flex items-center gap-1">
            <Link href={`${rutaBase}?mes=${mesPrevio}`} aria-label="Mes anterior" className="rounded-md p-2 hover:bg-muted">
              <ChevronLeft className="size-5" />
            </Link>
            <Link href={`${rutaBase}?mes=${mesSiguiente}`} aria-label="Mes siguiente" className="rounded-md p-2 hover:bg-muted">
              <ChevronRight className="size-5" />
            </Link>
          </nav>
        )}
        </div>
      </header>
      {errorExportar && (
        <p role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle size={15} className="shrink-0" /> {errorExportar}
        </p>
      )}

      {areas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Este hotel todavía no tiene áreas. Importa su calendario Excel desde el panel de administración.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border shadow-2xs">
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted text-foreground">
                <th rowSpan={2} className="sticky left-0 z-20 min-w-64 border-b border-r border-border bg-muted px-3 py-2 text-left font-semibold">Área</th>
                <th rowSpan={2} className="border-b border-r border-border px-2 py-2 text-left font-semibold">Horario</th>
                {dias.map((dia) => (
                  <th key={`letra-${dia.getDate()}`} className={`w-9 px-0 pt-1 text-[11px] font-medium ${isSunday(dia) ? 'bg-emerald-600 text-white' : ''}`}>
                    {LETRA[dia.getDay()]}
                  </th>
                ))}
              </tr>
              <tr className="bg-muted text-foreground">
                {dias.map((dia) => (
                  <th key={`dia-${dia.getDate()}`} className={`border-b border-border pb-1 font-semibold tabular-nums ${isSunday(dia) ? 'bg-emerald-600 text-white' : ''} ${isToday(dia) ? 'underline decoration-2 underline-offset-4' : ''}`}>
                    {dia.getDate()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {areas.map((area) => (
                <tr key={area.id} className="group">
                  <th scope="row" className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-1.5 text-left font-normal text-foreground group-hover:bg-muted/50">
                    {area.nombre}
                  </th>
                  <td className="border-b border-r border-border px-2 text-xs text-muted-foreground">{area.horario ?? ''}</td>
                  {dias.map((dia) => {
                    const fecha = format(dia, 'yyyy-MM-dd')
                    const servicio = mapa.get(`${area.id}|${fecha}`)
                    const estado = servicio?.estado
                    const confirmacion = servicio?.confirmado_en
                      ? ` Confirmado por ${servicio.confirmado_nombre || 'Empleado'} el ${format(new Date(servicio.confirmado_en), 'dd/MM/yyyy HH:mm')}.`
                      : ''
                    const etiqueta = `${area.nombre}, ${format(dia, "d 'de' MMMM", { locale: es })}: ${estado ? ESTILO[estado].texto : 'sin servicio'}.${confirmacion}`
                    const tieneServicio = Boolean(estado)

                    return (
                      <td key={fecha} className={`h-8 border-b border-border/60 p-0.5 text-center ${isSunday(dia) ? 'bg-emerald-500/10' : ''} group-hover:bg-muted/40`}>
                        {tieneServicio || editable ? (
                          <button
                            type="button"
                            onClick={() => clic(area.id, fecha)}
                            aria-label={etiqueta}
                            title={etiqueta}
                            className="grid size-full place-items-center rounded hover:scale-105 transition-transform hover:ring-2 hover:ring-emerald-500 focus-visible:outline-2 focus-visible:outline-emerald-600 cursor-pointer"
                          >
                            {estado && <Marca estado={estado} />}
                          </button>
                        ) : (
                          <span className="block size-full" />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground pt-1">
        <div className="flex flex-wrap items-center gap-4">
          {Object.entries(ESTILO).map(([estado, estilo]) => (
            <span key={estado} className="flex items-center gap-1.5">
              <Marca estado={estado as EstadoServicio} /> {estilo.texto}
            </span>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground italic">
          💡 Haz clic en cualquier celda para ver detalles o confirmar la realización.
        </p>
      </footer>

      {/* Modal de Detalle y Confirmación */}
      <Modal
        open={Boolean(servicioObjetivo)}
        onClose={() => !guardando && setServicioObjetivo(null)}
        title="Detalle del Servicio"
        maxWidth="md"
      >
        {servicioObjetivo && (
          <div className="space-y-4">
            {/* Tarjeta de información */}
            <div className="rounded-lg bg-muted/60 p-3.5 space-y-2 text-xs border border-border/60">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
                  <Building2 size={14} /> Hotel:
                </span>
                <span className="font-bold text-foreground">{hotel.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-medium">Área:</span>
                <span className="font-semibold text-foreground">{areaSeleccionada?.nombre ?? 'Área'}</span>
              </div>
              {areaSeleccionada?.horario && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
                    <Clock size={14} /> Horario sugerido:
                  </span>
                  <span>{areaSeleccionada.horario}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-medium">Fecha:</span>
                <span className="font-semibold text-foreground">
                  {format(new Date(`${servicioObjetivo.fecha}T00:00:00`), "EEEE d 'de' MMMM yyyy", { locale: es })}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border/50">
                <span className="text-muted-foreground font-medium">Estado actual:</span>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${ESTILO[servicioObjetivo.estado].clase}`}>
                  {ESTILO[servicioObjetivo.estado].texto}
                </span>
              </div>
            </div>

            {/* Si ya fue realizado */}
            {servicioObjetivo.estado === 'realizado' && (
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 size={16} />
                  <span>Servicio completado</span>
                </div>
                {servicioObjetivo.confirmado_nombre && (
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    Confirmado por <span className="font-medium">{servicioObjetivo.confirmado_nombre}</span>
                    {servicioObjetivo.confirmado_en && ` el ${format(new Date(servicioObjetivo.confirmado_en), 'dd/MM/yyyy HH:mm')}`}
                  </p>
                )}
                {servicioObjetivo.confirmacion_nota && (
                  <p className="text-[11px] italic text-muted-foreground pt-1">
                    &quot;{servicioObjetivo.confirmacion_nota}&quot;
                  </p>
                )}
              </div>
            )}

            {/* Si está programado */}
            {servicioObjetivo.estado === 'programado' && (
              <div className="space-y-3">
                {puedeConfirmar ? (
                  <>
                    <label className="block text-xs font-semibold text-foreground">
                      Nota u observación de realización (opcional)
                    </label>
                    <textarea
                      className="fm-input w-full min-h-20 text-xs resize-none"
                      value={nota}
                      onChange={(event) => setNota(event.target.value)}
                      maxLength={500}
                      placeholder="Indica detalles del trabajo efectuado..."
                      disabled={guardando || exitoConfirmacion}
                    />
                  </>
                ) : (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200 space-y-2">
                    <p className="font-medium">
                      Para confirmar la realización de este servicio debes iniciar sesión con tu cuenta de empleado o administrador.
                    </p>
                    <Link
                      href="/login"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
                    >
                      <LogIn size={13} />
                      Iniciar sesión ahora
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Mensajes de error o éxito */}
            {errorConfirmacion && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                <AlertCircle size={15} className="flex-shrink-0" />
                <span>{errorConfirmacion}</span>
              </div>
            )}

            {exitoConfirmacion && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 size={15} className="flex-shrink-0" />
                <span>¡Servicio confirmado! Se notificó al administrador.</span>
              </div>
            )}

            {/* Acciones */}
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setServicioObjetivo(null)}
                disabled={guardando || exitoConfirmacion}
              >
                Cerrar
              </Button>
              {servicioObjetivo.estado === 'programado' && puedeConfirmar && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={confirmar}
                  loading={guardando}
                  disabled={guardando || exitoConfirmacion}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  <CheckCircle2 size={14} className="mr-1.5" />
                  {guardando ? 'Guardando...' : 'Confirmar realización'}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}

function Marca({ estado }: { estado: EstadoServicio }) {
  return (
    <span className={`grid size-6 place-items-center rounded text-[11px] font-bold shadow-2xs ${ESTILO[estado].clase}`}>
      {estado === 'realizado' ? '✓' : 'x'}
    </span>
  )
}