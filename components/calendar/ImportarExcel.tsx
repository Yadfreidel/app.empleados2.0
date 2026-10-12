'use client'

import { useRef, useState, useTransition } from 'react'
import { Eye, Upload, X, AlertTriangle, FileText, Loader2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import { importarCalendarioExcel, importarCalendarioParseado, type ResultadoImportacion } from '@/lib/calendario-hotel/importar'
import { parsearCalendarioExcel, type CalendarioParseado } from '@/lib/calendario-hotel/parsear-excel'

interface Props {
  hotelId: string
  mes: string // YYYY-MM
}

export default function ImportarExcel({ hotelId, mes }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [mesSeleccionado, setMesSeleccionado] = useState(mes)
  const [preview, setPreview] = useState<CalendarioParseado | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null)
  const [guardando, startGuardar] = useTransition()
  const [parsedBuffer, setParsedBuffer] = useState<ArrayBuffer | null>(null)
  const [esPdf, setEsPdf] = useState(false)
  const [leyendo, setLeyendo] = useState(false)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setPreview(null)
    setPreviewError(null)
    setResultado(null)
    const nombre = file?.name.toLowerCase() ?? ''
    const pdf = nombre.endsWith('.pdf')
    if (!file || (!nombre.endsWith('.xlsx') && !pdf)) {
      setPreviewError('Selecciona un archivo Excel (.xlsx) o PDF válido.')
      return
    }
    setEsPdf(pdf)
    setLeyendo(true)
    try {
      const buffer = await file.arrayBuffer()
      setParsedBuffer(buffer)
      // pdf.js modifica el buffer que recibe; se le pasa una copia.
      const cal = pdf
        ? await (await import('@/lib/calendario-hotel/parsear-pdf')).parsearCalendarioPdf(buffer.slice(0))
        : parsearCalendarioExcel(buffer)
      setPreview(cal)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : `No se pudo leer el ${pdf ? 'PDF' : 'Excel'}.`)
    } finally {
      setLeyendo(false)
    }
  }

  function resetForm() {
    setPreview(null)
    setPreviewError(null)
    setResultado(null)
    setParsedBuffer(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function confirmarImportacion() {
    if (!fileRef.current?.files?.[0] || !parsedBuffer || !preview) return
    const form = new FormData()
    form.append('archivo', fileRef.current.files[0])
    form.append('hotelId', hotelId)
    form.append('mes', mesSeleccionado)
    startGuardar(async () => {
      const res = esPdf
        ? await importarCalendarioParseado({ hotelId, mes: mesSeleccionado, areas: preview.areas, avisos: preview.avisos })
        : await importarCalendarioExcel(null, form)
      setResultado(res)
      if (res.ok) {
        setPreview(null)
        setParsedBuffer(null)
        if (fileRef.current) fileRef.current.value = ''
      }
    })
  }

  const [anioMes, numMes] = mesSeleccionado.split('-').map(Number)
  const diasDelMes = new Date(anioMes, numMes, 0).getDate()

  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Mes del calendario</span>
          <input type="month" className="fm-input" value={mesSeleccionado}
            onChange={(e) => { setMesSeleccionado(e.target.value); resetForm() }} />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Archivo Excel (.xlsx) o PDF</span>
          <input ref={fileRef} type="file" accept=".xlsx,.pdf,application/pdf"
            className="text-sm file:mr-2 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5"
            onChange={handleFileChange} />
        </label>

        {leyendo && (
          <span className="flex min-h-[44px] items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Leyendo {esPdf ? 'PDF' : 'Excel'}…
          </span>
        )}

        {preview && !resultado && (
          <Button onClick={confirmarImportacion} loading={guardando}
            leftIcon={<Upload size={16} />} id="btn-importar-confirmar">
            {guardando ? 'Importando...' : 'Guardar calendario'}
          </Button>
        )}

        {(preview || resultado) && (
          <Button variant="ghost" size="sm" leftIcon={<X size={14} />} onClick={resetForm}>
            Limpiar
          </Button>
        )}
      </div>

      {/* Vista previa */}
      {preview && !resultado && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Eye size={16} />
            Vista previa — {preview.areas.length} areas detectadas
            {esPdf && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                <FileText size={11} /> Desde PDF
              </span>
            )}
          </div>
          {esPdf && (
            <p className="text-xs text-muted-foreground">
              Revisa que cada área y sus días coincidan con el PDF antes de guardar. Los PDF escaneados (fotos) no se pueden leer; usa el Excel o un PDF exportado desde Excel.
            </p>
          )}

          {preview.avisos.length > 0 && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
              <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-0.5">
                {preview.avisos.map((aviso, i) => <li key={i}>• {aviso}</li>)}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto rounded border border-border">
            <table className="w-max min-w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted text-foreground">
                  <th className="sticky left-0 bg-muted px-3 py-2 text-left font-semibold border-b border-r border-border">Area</th>
                  <th className="px-2 py-2 text-left font-semibold border-b border-r border-border">Horario</th>
                  <th className="px-2 py-2 text-left font-semibold border-b border-border">Dias programados ({diasDelMes} dias en el mes)</th>
                </tr>
              </thead>
              <tbody>
                {preview.areas.map((area, i) => {
                  const diasValidos = area.dias.filter(d => d >= 1 && d <= diasDelMes)
                  return (
                    <tr key={i} className="border-b border-border/60 hover:bg-muted/40">
                      <td className="sticky left-0 bg-card px-3 py-1.5 font-medium text-foreground border-r border-border">{area.nombre}</td>
                      <td className="px-2 py-1.5 text-muted-foreground border-r border-border">{area.horario ?? '—'}</td>
                      <td className="px-2 py-1.5">
                        {diasValidos.length === 0 ? (
                          <span className="text-amber-600">Sin dias marcados</span>
                        ) : (
                          <span className="text-fm-green-700 dark:text-fm-green-400 font-medium">
                            {diasValidos.join(', ')} ({diasValidos.length} servicio{diasValidos.length !== 1 ? 's' : ''})
                          </span>
                        )}
                        {area.dias.some(d => d > diasDelMes) && (
                          <span className="ml-2 text-amber-500">
                            (dias {area.dias.filter(d => d > diasDelMes).join(',')} fuera de rango, ignorados)
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Se importaran {preview.areas.flatMap(a => a.dias.filter(d => d <= diasDelMes)).length} servicios.
            Los duplicados existentes se ignoraran (no se sobrescribiran trabajos ya realizados ni sus confirmaciones).
          </p>
        </div>
      )}

      {resultado && (
        <div role="status" className={`rounded-md p-3 text-sm ${resultado.ok ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-300'}`}>
          {resultado.ok
            ? `Calendario importado: ${resultado.servicios} servicios en ${resultado.areas} areas.`
            : resultado.error}
          {resultado.ok && resultado.avisos.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-amber-800 dark:text-amber-300">
              {resultado.avisos.map((aviso) => <li key={aviso}>{aviso}</li>)}
            </ul>
          )}
        </div>
      )}

      {previewError && (
        <p role="alert" className="text-sm text-destructive">{previewError}</p>
      )}
    </div>
  )
}