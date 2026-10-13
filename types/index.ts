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
  /** Cambia en cada edición; se usa para detectar conflictos al sincronizar. */
  updated_at?: string
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

export type CategoriaFotoInforme = 'area' | 'hallazgo' | 'trabajo' | 'estado_final' | 'adicional'
export type ResultadoCierre = 'servicio_realizado' | 'problema_resuelto' | 'requiere_seguimiento'
export type EstadoGeneracionInforme = 'pendiente' | 'generando' | 'generado' | 'error'
export type EstadoEnvioInforme = 'pendiente' | 'requiere_revision' | 'enviando' | 'enviado' | 'error' | 'sin_destinatarios' | 'no_enviar'

export interface AnalisisInforme {
  resumen: string
  hallazgos: string[]
  acciones: string[]
  fotos: { indice: number; descripcion: string; corresponde_a_categoria: boolean; observacion: string }[]
  recomendaciones: string[]
  pendientes: string[]
  conclusion_servicio: string
  estado_problema: 'resuelto_segun_tecnico' | 'pendiente_seguimiento' | 'no_aplica' | 'no_determinable'
  conclusion_problema: string
  evidencia_suficiente: boolean
  contradicciones: string[]
  motivos_revision: string[]
  ia_disponible: boolean
  editado_por_supervisor?: boolean
}

export interface InformeCierre {
  id: string
  numero: string
  actividad_id: string
  hotel_id: string
  hotel_nombre: string
  operacion_nombre: string | null
  actividad_titulo: string
  fecha_programada: string
  area: string
  servicio: string
  hallazgos: string
  acciones: string
  resultado: ResultadoCierre
  observaciones: string | null
  fotos: { path: string; categoria: CategoriaFotoInforme; nombre: string; tipo: string; tamano: number }[]
  tecnico_id: string | null
  tecnico_nombre: string
  cerrado_en: string
  estado_generacion: EstadoGeneracionInforme
  analisis: AnalisisInforme | null
  modelo_ia: string | null
  pdf_path: string | null
  pdf_tamano: number | null
  generado_en: string | null
  requiere_revision: boolean
  motivos_revision: string[]
  revisado_nombre: string | null
  revisado_en: string | null
  revision_nota: string | null
  estado_envio: EstadoEnvioInforme
  enviado_a: string[] | null
  enviado_en: string | null
  intentos_generacion: number
  intentos_envio: number
  ultimo_error: string | null
  proximo_intento: string
  created_at: string
  updated_at: string
}

export interface InformeEvento {
  id: number
  informe_id: string
  tipo: 'creado' | 'generacion' | 'revision' | 'envio' | 'error' | 'reintento' | 'aprobado' | 'no_enviar'
  mensaje: string
  detalle: Record<string, unknown> | null
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
