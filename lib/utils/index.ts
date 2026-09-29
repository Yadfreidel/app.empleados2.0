// lib/utils/index.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { ActivityStatus, ActivityPriority } from '@/types'

// ─── Tailwind utility ─────────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Date formatting ──────────────────────────────────────────────
export function formatDate(date: string | Date, fmt = 'dd/MM/yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, fmt, { locale: es })
}

export function formatTime(time: string | null): string {
  if (!time) return ''
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  const period = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${h12}:${m} ${period}`
}

export function formatMonthYear(date: Date): string {
  return format(date, 'MMMM yyyy', { locale: es })
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// ─── Status helpers ───────────────────────────────────────────────
export const STATUS_LABELS: Record<ActivityStatus, string> = {
  programado: 'Programado',
  en_progreso: 'En progreso',
  completado: 'Completado',
  cancelado: 'Cancelado',
  postpuesto: 'Postpuesto',
}

export const STATUS_COLORS: Record<ActivityStatus, { bg: string; text: string; border: string }> = {
  programado: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  en_progreso: { bg: '#fefce8', text: '#a16207', border: '#fde68a' },
  completado: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  cancelado: { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
  postpuesto: { bg: '#faf5ff', text: '#7c3aed', border: '#e9d5ff' },
}

export const PRIORITY_LABELS: Record<ActivityPriority, string> = {
  baja: 'Baja',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
}

export const PRIORITY_COLORS: Record<ActivityPriority, { bg: string; text: string }> = {
  baja: { bg: '#f1f5f9', text: '#64748b' },
  normal: { bg: '#f0fdf4', text: '#16a34a' },
  alta: { bg: '#fff7ed', text: '#ea580c' },
  urgente: { bg: '#fef2f2', text: '#dc2626' },
}

// ─── Color utils ──────────────────────────────────────────────────
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    }
    : null
}

export function getContrastText(hexColor: string): string {
  const rgb = hexToRgb(hexColor)
  if (!rgb) return '#ffffff'
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
  return luminance > 0.5 ? '#0f172a' : '#ffffff'
}

// ─── Misc ─────────────────────────────────────────────────────────
export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str
}

export function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key])
    if (!acc[k]) acc[k] = []
    acc[k].push(item)
    return acc
  }, {} as Record<string, T[]>)
}

// ─── Supabase Error Formatter ─────────────────────────────────────
export function formatSupabaseError(e: unknown, defaultMessage = 'Error al guardar'): string {
  if (!e) return defaultMessage

  let rawMsg = ''
  if (typeof e === 'string') {
    rawMsg = e
  } else if (typeof e === 'object' && e !== null) {
    if ('message' in e && typeof (e as { message: unknown }).message === 'string') {
      rawMsg = (e as { message: string }).message
    } else if ('error_description' in e && typeof (e as { error_description: unknown }).error_description === 'string') {
      rawMsg = (e as { error_description: string }).error_description
    } else if (e instanceof Error) {
      rawMsg = e.message
    }
  }

  if (!rawMsg) return defaultMessage

  if (rawMsg.includes('row-level security policy') || rawMsg.includes('violates row-level security')) {
    return 'Error de permisos (RLS): Tu usuario no tiene asignado el rol de Administrador en la base de datos Supabase. Ejecuta el script supabase/fix_database.sql en el SQL Editor de Supabase.'
  }
  if (rawMsg.includes('violates foreign key constraint') || rawMsg.includes('is not present in table')) {
    return 'Error de referencia: El elemento seleccionado (hotel o tipo de operación) no existe en la base de datos.'
  }
  if (rawMsg.includes('violates not-null constraint')) {
    return 'Faltan campos obligatorios requeridos por la base de datos.'
  }
  if (rawMsg.includes('duplicate key value')) {
    return 'Ya existe un registro con estos datos.'
  }

  return rawMsg
}
