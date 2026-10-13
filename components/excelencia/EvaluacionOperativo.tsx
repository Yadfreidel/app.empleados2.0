'use client'
// components/excelencia/EvaluacionOperativo.tsx
// Validación (con calidad 1–5) y bloqueo con justificación aprobada de un
// operativo. Solo administradores: el servidor lo verifica (migración 014).
import { useState } from 'react'
import { Ban, CheckCircle2, ShieldCheck, Star } from 'lucide-react'
import type { Activity } from '@/types'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { esNoInstalado } from '@/lib/excelencia/excelencia'

export default function EvaluacionOperativo({ actividad, supervisorNombre, onClose, onCambio }: {
  actividad: Activity
  supervisorNombre: string | null
  onClose: () => void
  onCambio: () => void
}) {
  const validado = !!actividad.validado_en
  const [calidad, setCalidad] = useState<number | null>(actividad.calidad_validada ?? null)
  const [motivo, setMotivo] = useState(actividad.bloqueo_motivo ?? '')
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function llamar(clave: string, fn: string, args: Record<string, unknown>) {
    setTrabajando(clave)
    setError(null)
    const { data, error: e } = await createClient().rpc(fn, args)
    setTrabajando(null)
    if (e) { setError(esNoInstalado(e) ? 'Falta ejecutar la migración 014_excelencia_del_mes.sql en Supabase.' : 'No se pudo guardar. Revisa tu conexión.'); return }
    const r = data as { ok: boolean; error?: string }
    if (!r?.ok) { setError(r?.error ?? 'No se pudo guardar.'); return }
    onCambio()
    onClose()
  }

  return (
    <Modal open onClose={() => !trabajando && onClose()} title={`Evaluación · ${actividad.title}`} maxWidth="lg">
      <div className="space-y-5 text-sm">
        <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          Supervisor responsable: <strong className="text-foreground">{supervisorNombre ?? 'sin asignar'}</strong>.
          {!supervisorNombre && ' Asígnalo en «Editar» para que cuente en la Excelencia del mes.'}
        </p>

        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 font-semibold text-foreground"><ShieldCheck size={16} /> Validación</h3>
          {actividad.status !== 'completado' ? (
            <p className="text-xs text-muted-foreground">Solo se validan operativos completados.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {validado ? 'Validado.' : 'Sin validar.'} La calidad es opcional y sirve para desempatar.
              </p>
              <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Calidad validada">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" role="radio" aria-checked={calidad === n} onClick={() => setCalidad(calidad === n ? null : n)}
                    className={cn('flex h-10 w-10 items-center justify-center rounded-lg border', calidad !== null && n <= calidad ? 'border-amber-400 bg-amber-50 text-amber-600 dark:bg-amber-950' : 'border-border text-muted-foreground')}
                    aria-label={`Calidad ${n}`}>
                    <Star size={16} fill={calidad !== null && n <= calidad ? 'currentColor' : 'none'} />
                  </button>
                ))}
                <span className="ml-2 text-xs text-muted-foreground">{calidad ? `${calidad}/5` : 'sin calidad'}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" leftIcon={<CheckCircle2 size={14} />} loading={trabajando === 'validar'} disabled={!!trabajando}
                  onClick={() => void llamar('validar', 'validar_operativo', { p_actividad_id: actividad.id, p_validar: true, p_calidad: calidad })}>
                  {validado ? 'Guardar validación' : 'Validar'}
                </Button>
                {validado && (
                  <Button size="sm" variant="ghost" loading={trabajando === 'quitar'} disabled={!!trabajando}
                    onClick={() => void llamar('quitar', 'validar_operativo', { p_actividad_id: actividad.id, p_validar: false, p_calidad: null })}>
                    Quitar validación
                  </Button>
                )}
              </div>
            </>
          )}
        </section>

        <section className="space-y-2 border-t border-border pt-4">
          <h3 className="flex items-center gap-1.5 font-semibold text-foreground"><Ban size={16} /> Bloqueo con justificación aprobada</h3>
          <p className="text-xs text-muted-foreground">Un operativo bloqueado (p. ej. el hotel no dio acceso) no cuenta como asignado.</p>
          <textarea className="fm-input w-full resize-y" rows={2} maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)}
            disabled={!!trabajando} placeholder="Justificación (mínimo 5 caracteres)" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" loading={trabajando === 'bloqueo'} disabled={!!trabajando || motivo.trim().length < 5}
              onClick={() => void llamar('bloqueo', 'registrar_bloqueo_operativo', { p_actividad_id: actividad.id, p_motivo: motivo })}>
              {actividad.bloqueo_aprobado_en ? 'Guardar justificación' : 'Aprobar bloqueo'}
            </Button>
            {actividad.bloqueo_aprobado_en && (
              <Button size="sm" variant="ghost" loading={trabajando === 'desbloquear'} disabled={!!trabajando}
                onClick={() => void llamar('desbloquear', 'registrar_bloqueo_operativo', { p_actividad_id: actividad.id, p_motivo: null })}>
                Quitar bloqueo
              </Button>
            )}
          </div>
        </section>

        {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}
      </div>
    </Modal>
  )
}
