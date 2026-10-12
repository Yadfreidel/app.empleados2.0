// types/index.ts
// ─── Tipos globales del sistema F&M Fumigación ─────────────────────

export type UserRole = 'admin' | 'consulta'

export interface Profile {
  id: string
  email: string
  role: UserRole
  name: string | null
  active: boolean
  created_at: string
}

export interface Hotel {
  id: string
  name: string
  location: string | null
  code: string | null
  active: boolean
  notes: string | null
  created_at: string
}

export interface OperationType {
  id: string
  name: string
  description: string | null
  color: string        // hex color, e.g. '#16a34a'
  icon: string | null  // lucide icon name
  active: boolean
  created_at: string
}

export type ActivityStatus = 'programado' | 'en_progreso' | 'completado' | 'cancelado' | 'postpuesto'
export type ActivityPriority = 'baja' | 'normal' | 'alta' | 'urgente'

export interface Activity {
  id: string
  title: string
  description: string | null
  date: string              // ISO date: YYYY-MM-DD
  start_time: string | null // HH:MM
  end_time: string | null   // HH:MM
  hotel_id: string
  operation_type_id: string
  status: ActivityStatus
  priority: ActivityPriority
  color_override: string | null
  published: boolean
  notes: string | null
  created_at: string
  confirmado_por?: string | null
  confirmado_nombre?: string | null
  confirmado_en?: string | null
  confirmacion_nota?: string | null
  // Joins
  hotel?: Hotel
  operation_type?: OperationType
}

export interface AppConfiguracion {
  nombre_empresa: string
  telefono_oficina: string | null
  correo_oficina: string | null
  chat_habilitado: boolean
  foto_obligatoria_confirmar: boolean
  max_fotos_evidencia: number
  updated_at: string | null
}

export interface UsuarioAdmin {
  id: string
  email: string
  name: string | null
  role: UserRole
  active: boolean
  created_at: string
  last_sign_in_at: string | null
}

export interface ActividadMensaje {
  id: string
  actividad_id: string
  autor_id: string | null
  autor_nombre: string | null
  autor_rol: UserRole | null
  contenido: string | null
  adjunto_path: string | null
  adjunto_tipo: string | null
  adjunto_nombre: string | null
  adjunto_tamano: number | null
  es_evidencia: boolean
  created_at: string
}

export interface AuditLog {
  id: string
  user_id: string
  action: string
  table_name: string
  record_id: string
  metadata: Record<string, unknown> | null
  created_at: string
}

// ─── UI State types ───────────────────────────────────────────────

export interface CalendarDay {
  date: Date
  isCurrentMonth: boolean
  isToday: boolean
  activities: Activity[]
}

export interface FilterState {
  hotel_id: string | null
  operation_type_id: string | null
  status: ActivityStatus | null
  priority: ActivityPriority | null
}

// ─── Form types ───────────────────────────────────────────────────

export type ActivityFormData = {
  title: string
  description: string
  date: string
  start_time: string
  end_time: string
  hotel_id: string
  operation_type_id: string
  status: ActivityStatus
  priority: ActivityPriority
  color_override: string
  published: boolean
  notes: string
}

export type HotelFormData = {
  name: string
  location: string
  code: string
  active: boolean
  notes: string
}

export type OperationTypeFormData = {
  name: string
  description: string
  color: string
  icon: string
  active: boolean
}
