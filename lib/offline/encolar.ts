'use client'
// lib/offline/encolar.ts
// Guarda una confirmación en el teléfono antes de enviarla. Solo se considera
// guardada si al releerla están todas sus fotos completas.
import type { Activity, CategoriaFotoInforme } from '@/types'
import { comprimirImagen, validarAdjunto } from '@/lib/chat/adjuntos'
import {
  ErrorAlmacen, eliminarConfirmacion, guardarConfirmacion, obtenerConfirmacion, solicitarPersistencia, verificarEspacio,
  type ConfirmacionPendiente, type FotoPendiente, type InformePendiente,
} from './almacen'
import { recargarPendientes, usuarioLocal } from './sincronizacion'

export interface DatosInformeCierre extends Omit<InformePendiente, 'generacionSolicitada' | 'numero'> {
  /** Categoría de cada archivo, en el mismo orden que `archivos`. */
  categorias: CategoriaFotoInforme[]
}

export async function encolarConfirmacion(
  actividad: Activity,
  nota: string,
  archivos: File[],
  informe?: DatosInformeCierre,
): Promise<ConfirmacionPendiente> {
  const usuario = usuarioLocal()
  if (!usuario) throw new ErrorAlmacen('Inicia sesión para confirmar la actividad.')

  const id = crypto.randomUUID()
  const fotos: FotoPendiente[] = []
  for (const [i, original] of archivos.entries()) {
    const archivo = await comprimirImagen(original)
    const problema = validarAdjunto(archivo)
    if (problema) throw new ErrorAlmacen(problema)
    let datos: ArrayBuffer
    try {
      datos = await archivo.arrayBuffer()
    } catch {
      throw new ErrorAlmacen(`No se pudo leer la foto "${original.name}". Vuelve a tomarla.`)
    }
    if (datos.byteLength === 0) throw new ErrorAlmacen(`La foto "${original.name}" está vacía. Vuelve a tomarla.`)
    const extension = archivo.type === 'image/jpeg' ? 'jpg' : (archivo.name.split('.').pop() || 'bin').toLowerCase()
    fotos.push({
      id: crypto.randomUUID(),
      nombre: original.name,
      tipo: archivo.type || 'application/octet-stream',
      tamano: datos.byteLength,
      datos,
      ruta: `${actividad.id}/${id}-${i + 1}.${extension}`,
      subida: false,
      mensajeCreado: false,
      ...(informe ? { categoria: informe.categorias[i] ?? 'adicional' } : {}),
    })
  }

  const totalBytes = fotos.reduce((n, f) => n + f.tamano, 0)
  const sinEspacio = await verificarEspacio(totalBytes)
  if (sinEspacio) throw new ErrorAlmacen(sinEspacio, true)

  const confirmacion: ConfirmacionPendiente = {
    id,
    usuarioId: usuario.id,
    actividadId: actividad.id,
    nota: nota.trim() || null,
    versionEsperada: actividad.updated_at ?? null,
    forzar: false,
    modo: 'confirmar',
    creadaEn: new Date().toISOString(),
    actividad: {
      titulo: actividad.title,
      hotel: actividad.hotel?.name ?? null,
      fecha: actividad.date,
      hora: actividad.start_time,
    },
    fotos,
    ...(informe ? {
      informe: {
        area: informe.area.trim(),
        servicio: informe.servicio.trim(),
        hallazgos: informe.hallazgos.trim(),
        acciones: informe.acciones.trim(),
        resultado: informe.resultado,
        generacionSolicitada: false,
        numero: null,
      },
    } : {}),
    confirmadaEnServidor: false,
    notaEnviada: false,
    estado: 'pendiente',
    intentos: 0,
    proximoIntento: 0,
    ultimoError: null,
    conflicto: null,
  }

  await guardarConfirmacion(confirmacion)

  // Verificación: no se informa éxito si algo no quedó guardado.
  const guardada = await obtenerConfirmacion(id)
  const completa = guardada
    && guardada.fotos.length === fotos.length
    && guardada.fotos.every((f, i) => f.datos?.byteLength === fotos[i].tamano)
  if (!completa) {
    await eliminarConfirmacion(id).catch(() => {})
    throw new ErrorAlmacen('Las fotos no se pudieron guardar en el teléfono. Libera espacio e inténtalo de nuevo.', true)
  }

  void solicitarPersistencia()
  void registrarSincronizacionEnSegundoPlano()
  await recargarPendientes()
  return confirmacion
}

/** Si el navegador tiene Background Sync, avisa al volver la conexión (complementario). */
async function registrarSincronizacionEnSegundoPlano() {
  try {
    const registro = await navigator.serviceWorker?.getRegistration()
    const sync = (registro as (ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }) | undefined)?.sync
    await sync?.register('fm-sincronizar')
  } catch { /* no soportado */ }
}
