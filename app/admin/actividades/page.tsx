'use client'
// app/(admin)/actividades/page.tsx
import { useState, useEffect, useCallback } from 'react'
import { Activity, Plus, Pencil, Trash2, Search, Eye, EyeOff, Clock, Building2 } from 'lucide-react'
import type { Activity as ActivityType, ActivityFormData, Hotel, OperationType } from '@/types'
import Button from '@/components/ui/Button'
import Modal, { ConfirmModal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge'
import { activitySchema } from '@/lib/validations'
import { formatDate, formatTime, STATUS_LABELS, PRIORITY_LABELS, formatSupabaseError } from '@/lib/utils'
import type { ActivityStatus, ActivityPriority } from '@/types'

const EMPTY_FORM: ActivityFormData = {
  title: '', description: '', date: new Date().toISOString().slice(0, 10),
  start_time: '', end_time: '', hotel_id: '', operation_type_id: '',
  status: 'programado', priority: 'normal', color_override: '', published: true, notes: '',
}

function ActivityForm({
  value, onChange, error, hotels, opTypes,
}: {
  value: ActivityFormData
  onChange: (v: ActivityFormData) => void
  error?: string | null
  hotels: Hotel[]
  opTypes: OperationType[]
}) {
  const set = (key: keyof ActivityFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange({ ...value, [key]: e.target.value })

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-fm text-sm bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900">
          {error}
        </div>
      )}
      <div>
        <label className="fm-label">Título <span className="text-red-500">*</span></label>
        <input className="fm-input" value={value.title} onChange={set('title')} placeholder="Fumigación mensual" maxLength={120} required />
      </div>
      {/* 1 col en celular, 2 en PC */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="fm-label">Hotel <span className="text-red-500">*</span></label>
          <select className="fm-input" value={value.hotel_id} onChange={set('hotel_id')}>
            <option value="">Seleccionar...</option>
            {hotels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          {hotels.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">⚠️ No hay hoteles registrados. Ve a Hoteles para registrar uno.</p>
          )}
        </div>
        <div>
          <label className="fm-label">Tipo de operación <span className="text-red-500">*</span></label>
          <select className="fm-input" value={value.operation_type_id} onChange={set('operation_type_id')}>
            <option value="">Seleccionar...</option>
            {opTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {opTypes.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">⚠️ No hay operaciones registradas. Ve a Operaciones para registrar una.</p>
          )}
        </div>
      </div>
      {/* 1 col en celular, 3 en PC */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="fm-label">Fecha <span className="text-red-500">*</span></label>
          <input type="date" className="fm-input" value={value.date} onChange={set('date')} required />
        </div>
        <div>
          <label className="fm-label">Inicio</label>
          <input type="time" className="fm-input" value={value.start_time} onChange={set('start_time')} />
        </div>
        <div>
          <label className="fm-label">Fin</label>
          <input type="time" className="fm-input" value={value.end_time} onChange={set('end_time')} />
        </div>
      </div>
      {/* 1 col en celular, 2 en PC */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="fm-label">Estado</label>
          <select className="fm-input" value={value.status} onChange={set('status')}>
            {(Object.keys(STATUS_LABELS) as ActivityStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="fm-label">Prioridad</label>
          <select className="fm-input" value={value.priority} onChange={set('priority')}>
            {(Object.keys(PRIORITY_LABELS) as ActivityPriority[]).map(p => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="fm-label">Descripción</label>
        <textarea className="fm-input resize-none" rows={2} value={value.description} onChange={set('description')} maxLength={1000} />
      </div>
      <div>
        <label className="fm-label">Notas internas</label>
        <textarea className="fm-input resize-none" rows={2} value={value.notes} onChange={set('notes')} maxLength={2000} />
      </div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => onChange({ ...value, published: !value.published })}
          className="flex items-center gap-2 text-sm font-semibold transition-colors min-h-[44px]"
          style={{ color: value.published ? 'var(--fm-green-600)' : 'var(--muted-foreground)' }}
        >
          {value.published ? <Eye size={18} /> : <EyeOff size={18} />}
          <span>{value.published ? 'Publicada (visible en calendario)' : 'No publicada (oculta)'}</span>
        </button>
      </div>
    </div>
  )
}

export default function ActividadesPage() {
  const [activities, setActivities] = useState<ActivityType[]>([])
  const [hotels, setHotels]         = useState<Hotel[]>([])
  const [opTypes, setOpTypes]       = useState<OperationType[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filterStatus, setFilterStatus] = useState<ActivityStatus | ''>('')
  const [modalOpen, setModalOpen]   = useState(false)
  const [editing, setEditing]       = useState<ActivityType | null>(null)
  const [form, setForm]             = useState<ActivityFormData>(EMPTY_FORM)
  const [formErr, setFormErr]       = useState<string | null>(null)
  const [saving, setSaving]         = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ActivityType | null>(null)
  const [deleting, setDeleting]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const [{ data: acts }, { data: hots }, { data: ops }] = await Promise.all([
        supabase.from('activities').select('*, hotel:hotels(id,name), operation_type:operation_types(id,name,color)').order('date', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('hotels').select('*').eq('active', true).order('name'),
        supabase.from('operation_types').select('*').eq('active', true).order('name'),
      ])
      setActivities((acts as ActivityType[]) ?? [])
      setHotels(hots ?? [])
      setOpTypes(ops ?? [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormErr(null)
    setModalOpen(true)
  }

  function openEdit(a: ActivityType) {
    setEditing(a)
    setForm({
      title: a.title, description: a.description ?? '', date: a.date,
      start_time: a.start_time ?? '', end_time: a.end_time ?? '',
      hotel_id: a.hotel_id, operation_type_id: a.operation_type_id,
      status: a.status, priority: a.priority,
      color_override: a.color_override ?? '', published: a.published, notes: a.notes ?? '',
    })
    setFormErr(null)
    setModalOpen(true)
  }

  async function handleSave() {
    const result = activitySchema.safeParse(form)
    if (!result.success) { setFormErr(result.error.issues[0].message); return }
    setSaving(true); setFormErr(null)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const payload = {
        title:             result.data.title,
        description:       result.data.description || null,
        date:              result.data.date,
        start_time:        result.data.start_time || null,
        end_time:          result.data.end_time || null,
        hotel_id:          result.data.hotel_id,
        operation_type_id: result.data.operation_type_id,
        status:            result.data.status,
        priority:          result.data.priority,
        color_override:    result.data.color_override || null,
        published:         result.data.published,
        notes:             result.data.notes || null,
      }
      if (editing) {
        const { error } = await supabase.from('activities').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('activities').insert(payload)
        if (error) throw error
      }
      setModalOpen(false)
      await load()
    } catch (e: unknown) {
      setFormErr(formatSupabaseError(e, 'Error al guardar la actividad'))
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase.from('activities').delete().eq('id', deleteTarget.id)
      if (error) throw error
      setDeleteTarget(null)
      await load()
    } catch (e) {
      console.error(e)
      alert(formatSupabaseError(e, 'Error al eliminar la actividad'))
    } finally { setDeleting(false) }
  }

  const filtered = activities.filter(a => {
    const matchSearch = !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      (a.hotel as Hotel | undefined)?.name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !filterStatus || a.status === filterStatus
    return matchSearch && matchStatus
  })

  return (
    <div className="space-y-6 fm-animate-fadein">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-800 text-foreground">Actividades</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestiona todos los trabajos programados</p>
        </div>
        <Button id="btn-add-activity" leftIcon={<Plus size={16} />} onClick={openCreate} className="min-h-[44px]">
          Nueva actividad
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="fm-input pl-10"
            placeholder="Buscar actividad o hotel..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="fm-input w-auto min-h-[44px]"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as ActivityStatus | '')}
        >
          <option value="">Todos los estados</option>
          {(Object.keys(STATUS_LABELS) as ActivityStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Activity}
          title={search || filterStatus ? 'Sin resultados' : 'No hay actividades'}
          description={search || filterStatus ? 'Prueba con otros filtros.' : 'Crea la primera actividad usando el botón superior.'}
        />
      ) : (
        <>
          {/* Mobile view: Cards */}
          <div className="block md:hidden space-y-3">
            {filtered.map(a => {
              const hotel  = a.hotel as Hotel | undefined
              const opType = a.operation_type as OperationType | undefined
              const typeColor = a.color_override || opType?.color || '#16a34a'
              return (
                <div
                  key={a.id}
                  className="fm-card p-4 rounded-xl border border-border bg-card flex flex-col gap-3 shadow-xs"
                  style={{ borderLeftWidth: 4, borderLeftColor: typeColor }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-bold text-foreground">{a.title}</span>
                        {!a.published && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300">
                            No publicada
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {hotel && (
                          <span className="flex items-center gap-1">
                            <Building2 size={12} />
                            {hotel.name}
                          </span>
                        )}
                        <span>{formatDate(a.date)}</span>
                        {a.start_time && (
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {formatTime(a.start_time)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StatusBadge status={a.status} />
                      <PriorityBadge priority={a.priority} />
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        id={`btn-edit-act-mobile-${a.id}`}
                        variant="ghost"
                        size="icon"
                        className="min-w-[40px] min-h-[40px] text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(a)}
                        aria-label="Editar"
                      >
                        <Pencil size={15} />
                      </Button>
                      <Button
                        id={`btn-delete-act-mobile-${a.id}`}
                        variant="ghost"
                        size="icon"
                        className="min-w-[40px] min-h-[40px] text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteTarget(a)}
                        aria-label="Eliminar"
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop view: Table */}
          <div className="hidden md:block fm-card overflow-hidden border border-border bg-card rounded-xl shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 border-b border-border text-xs uppercase font-bold text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">Actividad</th>
                    <th scope="col" className="px-5 py-3.5">Hotel</th>
                    <th scope="col" className="px-5 py-3.5">Operación</th>
                    <th scope="col" className="px-5 py-3.5">Fecha y Hora</th>
                    <th scope="col" className="px-5 py-3.5">Estado</th>
                    <th scope="col" className="px-5 py-3.5">Prioridad</th>
                    <th scope="col" className="px-5 py-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(a => {
                    const hotel  = a.hotel as Hotel | undefined
                    const opType = a.operation_type as OperationType | undefined
                    const typeColor = a.color_override || opType?.color || '#16a34a'
                    return (
                      <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ background: typeColor }}
                            />
                            <div className="min-w-0">
                              <span className="font-bold text-foreground block truncate">{a.title}</span>
                              {!a.published && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300">
                                  No publicada
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-foreground/90 font-medium truncate max-w-[140px]">
                          {hotel?.name || '—'}
                        </td>
                        <td className="px-5 py-4">
                          {opType ? (
                            <span
                              className="px-2 py-0.5 rounded-full text-xs font-semibold"
                              style={{ background: opType.color + '20', color: opType.color }}
                            >
                              {opType.name}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-5 py-4 text-muted-foreground whitespace-nowrap text-xs">
                          <div>{formatDate(a.date)}</div>
                          {a.start_time && <div className="text-foreground/75 font-medium">{formatTime(a.start_time)}</div>}
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={a.status} />
                        </td>
                        <td className="px-5 py-4">
                          <PriorityBadge priority={a.priority} />
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              id={`btn-edit-act-${a.id}`}
                              variant="ghost"
                              size="icon"
                              className="min-w-[40px] min-h-[40px] text-muted-foreground hover:text-foreground"
                              onClick={() => openEdit(a)}
                              aria-label="Editar"
                            >
                              <Pencil size={15} />
                            </Button>
                            <Button
                              id={`btn-delete-act-${a.id}`}
                              variant="ghost"
                              size="icon"
                              className="min-w-[40px] min-h-[40px] text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteTarget(a)}
                              aria-label="Eliminar"
                            >
                              <Trash2 size={15} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? 'Editar actividad' : 'Nueva actividad'}
        maxWidth="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving} className="min-h-[44px]">
              Cancelar
            </Button>
            <Button onClick={handleSave} loading={saving} className="min-h-[44px]">
              {editing ? 'Guardar cambios' : 'Crear actividad'}
            </Button>
          </>
        }
      >
        <ActivityForm value={form} onChange={setForm} error={formErr} hotels={hotels} opTypes={opTypes} />
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Eliminar actividad"
        message={`¿Eliminar "${deleteTarget?.title}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
      />
    </div>
  )
}
