'use client'
// lib/chat/useArchivosPendientes.ts
// Archivos elegidos en el teléfono que aún no se han enviado, con vista previa.
import { useCallback, useEffect, useRef, useState } from 'react'
import { esImagen, validarAdjunto } from './adjuntos'

export interface ArchivoPendiente {
  id: string
  file: File
  preview: string | null
}

export function useArchivosPendientes(maximo: number, onError: (mensaje: string) => void) {
  const [pendientes, setPendientes] = useState<ArchivoPendiente[]>([])
  const ref = useRef(pendientes)

  useEffect(() => { ref.current = pendientes }, [pendientes])
  useEffect(() => () => ref.current.forEach(p => p.preview && URL.revokeObjectURL(p.preview)), [])

  const agregar = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    const nuevos: ArchivoPendiente[] = []
    for (const file of Array.from(files)) {
      const problema = validarAdjunto(file)
      if (problema) { onError(problema); continue }
      if (ref.current.length + nuevos.length >= maximo) {
        onError(`Puedes adjuntar hasta ${maximo} archivos a la vez.`)
        break
      }
      nuevos.push({ id: crypto.randomUUID(), file, preview: esImagen(file.type) ? URL.createObjectURL(file) : null })
    }
    if (nuevos.length > 0) setPendientes(prev => [...prev, ...nuevos])
  }, [maximo, onError])

  const quitar = useCallback((id: string) => {
    setPendientes(prev => {
      const item = prev.find(p => p.id === id)
      if (item?.preview) URL.revokeObjectURL(item.preview)
      return prev.filter(p => p.id !== id)
    })
  }, [])

  const limpiar = useCallback(() => {
    setPendientes(prev => {
      prev.forEach(p => p.preview && URL.revokeObjectURL(p.preview))
      return []
    })
  }, [])

  return { pendientes, archivos: pendientes.map(p => p.file), agregar, quitar, limpiar }
}
