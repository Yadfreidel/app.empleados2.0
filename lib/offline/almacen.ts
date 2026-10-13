// lib/offline/almacen.ts
// Almacenamiento local en IndexedDB: confirmaciones pendientes (con sus fotos) y
// copia del calendario. Todo se guarda separado por usuario. No se guardan
// contraseñas ni tokens: la sesión la gestiona Supabase por su cuenta.

import type { CategoriaFotoInforme, ResultadoCierre } from '@/types'

const NOMBRE_DB = 'fm-offline'
const VERSION_DB = 1
const CONFIRMACIONES = 'confirmaciones'
const CACHE = 'cache'

export type TipoConflicto = 'ya_confirmada' | 'cancelada' | 'modificada' | 'estado_cambiado' | 'no_disponible'

export interface FotoPendiente {
  /** También es el id del mensaje de evidencia en el chat (evita duplicados al reintentar). */
  id: string
  nombre: string
  tipo: string
  tamano: number
  /** Bytes de la foto ya comprimida. ArrayBuffer es lo más compatible con Safari. */
  datos: ArrayBuffer
  /** Ruta fija en Storage: `${actividadId}/${confirmacionId}-${n}.jpg`. */
  ruta: string
  subida: boolean
  mensajeCreado: boolean
  /** Solo en cierres con informe: área, hallazgo, trabajo, estado final o adicional. */
  categoria?: CategoriaFotoInforme
}

/** Datos del informe de cierre (migración 009). El id del informe es el de la confirmación. */
export interface InformePendiente {
  area: string
  servicio: string
  hallazgos: string
  acciones: string
  resultado: ResultadoCierre
  /** Migración 012 (opcionales): datos confirmados por el técnico, también si vienen del dictado. */
  productos?: string
  recomendaciones?: string
  pendientes?: string
  dictadoId?: string | null
  /** El servidor ya lo registró y se pidió generarlo (evita volver a pedirlo). */
  generacionSolicitada: boolean
  numero: string | null
}

export interface ConfirmacionPendiente {
  /** Identificador único de la confirmación (clave de idempotencia en el servidor). */
  id: string
  usuarioId: string
  actividadId: string
  nota: string | null
  /** updated_at de la actividad cuando el técnico la confirmó, para detectar cambios. */
  versionEsperada: string | null
  forzar: boolean
  /** 'confirmar' (normal) o 'solo_chat' (conflicto: enviar fotos y nota sin confirmar). */
  modo: 'confirmar' | 'solo_chat'
  creadaEn: string
  actividad: { titulo: string; hotel: string | null; fecha: string; hora: string | null }
  fotos: FotoPendiente[]
  /** Presente si la actividad se cierra con informe automático. */
  informe?: InformePendiente
  confirmadaEnServidor: boolean
  notaEnviada: boolean
  estado: 'pendiente' | 'error' | 'conflicto'
  intentos: number
  proximoIntento: number
  ultimoError: string | null
  conflicto: { tipo: TipoConflicto; actividad: Record<string, unknown> | null } | null
}

export interface CacheCalendario {
  clave: string
  guardadoEn: string
  datos: unknown
}

/** Error con mensaje apto para mostrar (falta de espacio, almacenamiento bloqueado…). */
export class ErrorAlmacen extends Error {
  constructor(message: string, readonly sinEspacio = false) { super(message) }
}

let conexion: Promise<IDBDatabase> | null = null

function abrir(): Promise<IDBDatabase> {
  if (conexion) return conexion
  conexion = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new ErrorAlmacen('Este navegador no permite guardar datos sin conexión.'))
      return
    }
    const peticion = indexedDB.open(NOMBRE_DB, VERSION_DB)
    peticion.onupgradeneeded = () => {
      const db = peticion.result
      if (!db.objectStoreNames.contains(CONFIRMACIONES)) {
        db.createObjectStore(CONFIRMACIONES, { keyPath: 'id' }).createIndex('usuarioId', 'usuarioId')
      }
      if (!db.objectStoreNames.contains(CACHE)) db.createObjectStore(CACHE, { keyPath: 'clave' })
    }
    peticion.onsuccess = () => {
      const db = peticion.result
      db.onversionchange = () => { db.close(); conexion = null }
      resolve(db)
    }
    peticion.onerror = () => { conexion = null; reject(traducirError(peticion.error)) }
    peticion.onblocked = () => { conexion = null; reject(new ErrorAlmacen('Cierra las otras pestañas de la app e inténtalo de nuevo.')) }
  })
  return conexion
}

function traducirError(error: unknown): ErrorAlmacen {
  const nombre = (error as DOMException | null)?.name
  if (nombre === 'QuotaExceededError') {
    return new ErrorAlmacen('No hay espacio suficiente en el teléfono para guardar. Libera espacio e inténtalo de nuevo.', true)
  }
  return new ErrorAlmacen('No se pudo guardar en el teléfono. Inténtalo de nuevo.')
}

/** Ejecuta una operación y espera a que la transacción quede escrita en disco. */
async function transaccion<T>(
  almacen: string,
  modo: IDBTransactionMode,
  operacion: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await abrir()
  return new Promise((resolve, reject) => {
    let resultado: T | undefined
    let tx: IDBTransaction
    try {
      tx = db.transaction(almacen, modo, { durability: 'strict' } as IDBTransactionOptions)
    } catch (error) {
      reject(traducirError(error))
      return
    }
    const peticion = operacion(tx.objectStore(almacen))
    if (peticion) peticion.onsuccess = () => { resultado = peticion.result }
    tx.oncomplete = () => resolve(resultado)
    tx.onerror = () => reject(traducirError(tx.error))
    tx.onabort = () => reject(traducirError(tx.error))
  })
}

// ── Confirmaciones pendientes ─────────────────────────────────────────────

export async function guardarConfirmacion(confirmacion: ConfirmacionPendiente) {
  await transaccion(CONFIRMACIONES, 'readwrite', store => store.put(confirmacion))
}

export async function obtenerConfirmacion(id: string) {
  return transaccion<ConfirmacionPendiente | undefined>(CONFIRMACIONES, 'readonly', store => store.get(id))
}

/** Solo devuelve las del usuario indicado: nunca se mezclan cuentas. */
export async function listarConfirmaciones(usuarioId: string): Promise<ConfirmacionPendiente[]> {
  const lista = await transaccion<ConfirmacionPendiente[]>(CONFIRMACIONES, 'readonly',
    store => store.index('usuarioId').getAll(IDBKeyRange.only(usuarioId)))
  return (lista ?? []).sort((a, b) => a.creadaEn.localeCompare(b.creadaEn))
}

export async function eliminarConfirmacion(id: string) {
  await transaccion(CONFIRMACIONES, 'readwrite', store => store.delete(id))
}

// ── Copia del calendario ──────────────────────────────────────────────────

export async function guardarCache(clave: string, datos: unknown) {
  await transaccion(CACHE, 'readwrite', store => store.put({ clave, guardadoEn: new Date().toISOString(), datos } satisfies CacheCalendario))
}

export async function leerCache<T>(clave: string): Promise<{ guardadoEn: string; datos: T } | null> {
  const fila = await transaccion<CacheCalendario | undefined>(CACHE, 'readonly', store => store.get(clave))
  return fila ? { guardadoEn: fila.guardadoEn, datos: fila.datos as T } : null
}

// ── Espacio disponible ────────────────────────────────────────────────────

/** Comprueba que quepan `bytes` con margen. Si el navegador no informa, no bloquea. */
export async function verificarEspacio(bytes: number): Promise<string | null> {
  try {
    const { quota, usage } = await navigator.storage.estimate()
    if (quota === undefined || usage === undefined) return null
    const libre = quota - usage
    if (libre < bytes * 1.5 + 2 * 1024 * 1024) {
      return `Queda poco espacio en el teléfono (${Math.max(0, Math.round(libre / 1024 / 1024))} MB libres). Libera espacio antes de guardar fotos.`
    }
  } catch { /* estimate() no disponible */ }
  return null
}

/** Pide al navegador que no borre estos datos si le falta espacio. */
export async function solicitarPersistencia() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch { /* no soportado */ }
}
