'use client'
// app/(admin)/hoteles/page.tsx
import { useState, useEffect, useCallback } from 'react'
import { Building2, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Search } from 'lucide-react'
import type { Hotel, HotelFormData } from '@/types'
import Button from '@/components/ui/Button'
import Modal, { ConfirmModal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { hotelSchema } from '@/lib/validations'
import { formatSupabaseError } from '@/lib/utils'

// ── Form ──────────────────────────────────────────────────────────────────────
const EMPTY_FORM: HotelFormData = {
  name: '', location: '', code: '', active: true, notes: '',
}

function HotelForm({
  value, onChange, error,
}: {
  value: HotelFormData
  onChange: (v: HotelFormData) => void
  error?: string | null
}) {
  const set = (key: keyof HotelFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ ...value, [key]: e.target.value })

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-fm text-sm bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900">
          {error}
        </div>
      )}
      <div>
        <label className="fm-label">Nombre <span className="text-red-500">*</span></label>
        <input className="fm-input" value={value.name} onChange={set('name')} placeholder="Hotel Paraíso" maxLength={100} required />
      </div>
      {/* 1 col en mobile, 2 cols en PC */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="fm-label">Código</label>
          <input className="fm-input" value={value.code} onChange={set('code')} placeholder="HTL-01" maxLength={20} />
        </div>
        <div>
          <label className="fm-label">Ubicación</label>
          <input className="fm-input" value={value.location} onChange={set('location')} placeholder="Ciudad, Zona" maxLength={200} />
        </div>
      </div>
      <div>
        <label className="fm-label">Notas</label>
        <textarea className="fm-input resize-none" rows={3} value={value.notes} onChange={set('notes')} maxLength={500} />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...value, active: !value.active })}
          className="flex items-center gap-2 text-sm font-semibold transition-colors min-h-[44px]"
          style={{ color: value.active ? 'var(--fm-green-600)' : 'var(--muted-foreground)' }}
        >
          {value.active ? <ToggleRight size={26} className="text-fm-green-600" /> : <ToggleLeft size={26} className="text-muted-foreground" />}
          <span>{value.active ? 'Activo' : 'Inactivo'}</span>
        </button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function HotelesPage() {
  const [hotels, setHotels]       = useState<Hotel[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<Hotel | null>(null)
  const [form, setForm]           = useState<HotelFormData>(EMPTY_FORM)
  const [formErr, setFormErr]     = useState<string | null>(null)
  const [saving, setSaving]       = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Hotel | null>(null)
  const [deleting, setDeleting]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data, error } = await supabase
        .from('hotels')
        .select('*')
        .order('name')
      if (error) throw error
      setHotels(data ?? [])
    } catch (e: unknown) {
      console.error('Error cargando hoteles:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormErr(null)
    setModalOpen(true)
  }

  function openEdit(h: Hotel) {
    setEditing(h)
    setForm({ name: h.name, location: h.location ?? '', code: h.code ?? '', active: h.active, notes: h.notes ?? '' })
    setFormErr(null)
    setModalOpen(true)
  }

  async function handleSave() {
    const result = hotelSchema.safeParse(form)
    if (!result.success) {
      setFormErr(result.error.issues[0].message)
      return
    }
    setSaving(true)
    setFormErr(null)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const payload = {
        name:     result.data.name,
        location: result.data.location || null,
        code:     result.data.code || null,
        active:   result.data.active,
        notes:    result.data.notes || null,
      }
      if (editing) {
        const { error } = await supabase.from('hotels').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('hotels').insert(payload)
        if (error) throw error
      }
      setModalOpen(false)
      await load()
    } catch (e: unknown) {
      setFormErr(formatSupabaseError(e, 'Error al guardar el hotel'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase.from('hotels').delete().eq('id', deleteTarget.id)
      if (error) throw error
      setDeleteTarget(null)
      await load()
    } catch (e: unknown) {
      console.error(e)
      alert(formatSupabaseError(e, 'Error al eliminar el hotel'))
    } finally {
      setDeleting(false)
    }
  }

  const filtered = hotels.filter(h =>
    h.name.toLowerCase().includes(search.toLowerCase()) ||
    (h.code ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (h.location ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6 fm-animate-fadein">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-800 text-foreground">Hoteles</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestiona los hoteles de F&amp;M Fumigación</p>
        </div>
        <Button id="btn-add-hotel" leftIcon={<Plus size={16} />} onClick={openCreate} className="min-h-[44px]">
          Nuevo hotel
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          className="fm-input pl-10"
          placeholder="Buscar hotel..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={search ? 'Sin resultados' : 'No hay hoteles'}
          description={search ? 'Intenta con otra búsqueda.' : 'Crea el primer hotel usando el botón superior.'}
        />
      ) : (
        <>
          {/* Mobile view: Cards */}
          <div className="block md:hidden space-y-3">
            {filtered.map(h => (
              <div
                key={h.id}
                className="fm-card p-4 rounded-xl border border-border bg-card flex flex-col gap-3 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-fm-green-100 text-fm-green-800 dark:bg-fm-green-950 dark:text-fm-green-300"
                    >
                      <Building2 size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground leading-snug">{h.name}</h3>
                      {h.code && (
                        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {h.code}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                      h.active
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300'
                    }`}
                  >
                    {h.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                {h.location && (
                  <p className="text-xs text-muted-foreground truncate">{h.location}</p>
                )}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                  <Button
                    id={`btn-edit-hotel-mobile-${h.id}`}
                    variant="outline"
                    size="sm"
                    className="min-h-[40px] px-3"
                    onClick={() => openEdit(h)}
                    leftIcon={<Pencil size={14} />}
                  >
                    Editar
                  </Button>
                  <Button
                    id={`btn-delete-hotel-mobile-${h.id}`}
                    variant="ghost"
                    size="sm"
                    className="min-h-[40px] px-3 text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteTarget(h)}
                    leftIcon={<Trash2 size={14} />}
                  >
                    Eliminar
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop view: Table */}
          <div className="hidden md:block fm-card overflow-hidden border border-border bg-card rounded-xl shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 border-b border-border text-xs uppercase font-bold text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">Hotel</th>
                    <th scope="col" className="px-5 py-3.5">Código</th>
                    <th scope="col" className="px-5 py-3.5">Ubicación</th>
                    <th scope="col" className="px-5 py-3.5">Estado</th>
                    <th scope="col" className="px-5 py-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(h => (
                    <tr key={h.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-fm-green-100 text-fm-green-800 dark:bg-fm-green-950 dark:text-fm-green-300">
                            <Building2 size={16} />
                          </div>
                          <span className="font-bold text-foreground truncate">{h.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {h.code ? (
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                            {h.code}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground truncate max-w-xs">
                        {h.location || '—'}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                            h.active
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300'
                          }`}
                        >
                          {h.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            id={`btn-edit-hotel-${h.id}`}
                            variant="ghost"
                            size="icon"
                            className="min-w-[40px] min-h-[40px] text-muted-foreground hover:text-foreground"
                            onClick={() => openEdit(h)}
                            aria-label="Editar"
                          >
                            <Pencil size={15} />
                          </Button>
                          <Button
                            id={`btn-delete-hotel-${h.id}`}
                            variant="ghost"
                            size="icon"
                            className="min-w-[40px] min-h-[40px] text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget(h)}
                            aria-label="Eliminar"
                          >
                            <Trash2 size={15} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? 'Editar hotel' : 'Nuevo hotel'}
        maxWidth="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving} className="min-h-[44px]">
              Cancelar
            </Button>
            <Button onClick={handleSave} loading={saving} className="min-h-[44px]">
              {editing ? 'Guardar cambios' : 'Crear hotel'}
            </Button>
          </>
        }
      >
        <HotelForm value={form} onChange={setForm} error={formErr} />
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Eliminar hotel"
        message={`¿Estás seguro que deseas eliminar "${deleteTarget?.name}"? Esta acción no se puede deshacer. Las actividades asociadas no se podrán eliminar si existen.`}
        confirmLabel="Eliminar"
      />
    </div>
  )
}
