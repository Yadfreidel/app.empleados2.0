'use client'
// app/(admin)/operaciones/page.tsx
import { useState, useEffect, useCallback } from 'react'
import { Tag, Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import type { OperationType, OperationTypeFormData } from '@/types'
import Button from '@/components/ui/Button'
import Modal, { ConfirmModal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { operationTypeSchema } from '@/lib/validations'
import { getContrastText, formatSupabaseError } from '@/lib/utils'

const EMPTY_FORM: OperationTypeFormData = {
  name: '', description: '', color: '#15803d', icon: '', active: true,
}

const PRESET_COLORS = [
  '#15803d','#2563eb','#0891b2','#7c3aed','#d97706','#be185d',
  '#dc2626','#ea580c','#64748b','#0f172a',
]

function OpTypeForm({
  value, onChange, error,
}: {
  value: OperationTypeFormData
  onChange: (v: OperationTypeFormData) => void
  error?: string | null
}) {
  const set = (key: keyof OperationTypeFormData) =>
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
        <input className="fm-input" value={value.name} onChange={set('name')} placeholder="Fumigación" maxLength={80} required />
      </div>
      <div>
        <label className="fm-label">Descripción</label>
        <textarea className="fm-input resize-none" rows={2} value={value.description} onChange={set('description')} maxLength={300} />
      </div>
      <div>
        <label className="fm-label">Color <span className="text-red-500">*</span></label>
        <div className="flex items-center gap-3 flex-wrap mt-1">
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ ...value, color: c })}
              className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 min-w-[32px] min-h-[32px]"
              style={{
                background: c,
                borderColor: value.color === c ? 'var(--foreground)' : 'transparent',
                boxShadow: value.color === c ? '0 0 0 2px var(--card), 0 0 0 4px var(--primary)' : 'none',
              }}
              aria-label={c}
            />
          ))}
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={value.color}
              onChange={e => onChange({ ...value, color: e.target.value })}
              className="w-9 h-9 rounded cursor-pointer border-0 bg-transparent"
              title="Color personalizado"
            />
            <span className="text-xs font-mono text-muted-foreground">{value.color}</span>
          </div>
        </div>
        {/* Preview */}
        <div
          className="mt-3 px-4 py-2.5 rounded-fm inline-flex items-center gap-2 text-sm font-semibold shadow-xs"
          style={{ background: value.color, color: getContrastText(value.color) }}
        >
          <Tag size={15} />
          <span>{value.name || 'Vista previa'}</span>
        </div>
      </div>
      <div>
        <label className="fm-label">Ícono (nombre Lucide)</label>
        <input className="fm-input" value={value.icon} onChange={set('icon')} placeholder="spray-can" maxLength={50} />
        <p className="text-xs text-muted-foreground mt-1">Opcional. Referencia: lucide.dev</p>
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

export default function OperacionesPage() {
  const [types, setTypes]         = useState<OperationType[]>([])
  const [loading, setLoading]     = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<OperationType | null>(null)
  const [form, setForm]           = useState<OperationTypeFormData>(EMPTY_FORM)
  const [formErr, setFormErr]     = useState<string | null>(null)
  const [saving, setSaving]       = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<OperationType | null>(null)
  const [deleting, setDeleting]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data, error } = await supabase
        .from('operation_types')
        .select('*')
        .order('name')
      if (error) throw error
      setTypes(data ?? [])
    } catch (e) {
      console.error(e)
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

  function openEdit(t: OperationType) {
    setEditing(t)
    setForm({
      name: t.name, description: t.description ?? '',
      color: t.color, icon: t.icon ?? '', active: t.active,
    })
    setFormErr(null)
    setModalOpen(true)
  }

  async function handleSave() {
    const result = operationTypeSchema.safeParse(form)
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
        name:        result.data.name,
        description: result.data.description || null,
        color:       result.data.color,
        icon:        result.data.icon || null,
        active:      result.data.active,
      }
      if (editing) {
        const { error } = await supabase.from('operation_types').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('operation_types').insert(payload)
        if (error) throw error
      }
      setModalOpen(false)
      await load()
    } catch (e: unknown) {
      setFormErr(formatSupabaseError(e, 'Error al guardar el tipo de operación'))
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
      const { error } = await supabase.from('operation_types').delete().eq('id', deleteTarget.id)
      if (error) throw error
      setDeleteTarget(null)
      await load()
    } catch (e) {
      console.error(e)
      alert(formatSupabaseError(e, 'Error al eliminar el tipo de operación'))
    } finally { setDeleting(false) }
  }

  return (
    <div className="space-y-6 fm-animate-fadein">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-800 text-foreground">Tipos de Operación</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Catálogo de operaciones con colores e íconos</p>
        </div>
        <Button id="btn-add-operation" leftIcon={<Plus size={16} />} onClick={openCreate} className="min-h-[44px]">
          Nuevo tipo
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : types.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No hay tipos de operación"
          description="Crea el primer tipo usando el botón superior."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {types.map(t => (
            <div key={t.id} className="fm-card p-4 rounded-xl border border-border bg-card flex items-start gap-3 group shadow-xs">
              <div
                className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center shadow-2xs"
                style={{ background: t.color }}
              >
                <Tag size={17} color={getContrastText(t.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-bold text-foreground truncate">{t.name}</span>
                  {!t.active && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-100 dark:bg-red-950/70 text-red-800 dark:text-red-300">
                      Inactivo
                    </span>
                  )}
                </div>
                {t.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>}
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: t.color }} />
                  <span className="text-xs font-mono text-muted-foreground">{t.color}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                <Button
                  id={`btn-edit-op-${t.id}`}
                  variant="ghost"
                  size="icon"
                  className="min-w-[36px] min-h-[36px] text-muted-foreground hover:text-foreground"
                  onClick={() => openEdit(t)}
                  aria-label="Editar"
                >
                  <Pencil size={15} />
                </Button>
                <Button
                  id={`btn-delete-op-${t.id}`}
                  variant="ghost"
                  size="icon"
                  className="min-w-[36px] min-h-[36px] text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteTarget(t)}
                  aria-label="Eliminar"
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? 'Editar tipo de operación' : 'Nuevo tipo de operación'}
        maxWidth="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving} className="min-h-[44px]">
              Cancelar
            </Button>
            <Button onClick={handleSave} loading={saving} className="min-h-[44px]">
              {editing ? 'Guardar cambios' : 'Crear tipo'}
            </Button>
          </>
        }
      >
        <OpTypeForm value={form} onChange={setForm} error={formErr} />
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Eliminar tipo de operación"
        message={`¿Eliminar "${deleteTarget?.name}"? Las actividades que lo usan quedarán sin tipo si se elimina. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
      />
    </div>
  )
}
