'use client'
// components/offline/SincronizacionOffline.tsx
// Arranca la sincronización automática y registra el service worker que permite
// abrir el calendario sin conexión después de una primera carga online.
import '@/lib/utils/polyfills'
import { useEffect } from 'react'
import { iniciarSincronizacion } from '@/lib/offline/sincronizacion'

export default function SincronizacionOffline() {
  useEffect(() => {
    iniciarSincronizacion()
    // En desarrollo el service worker interferiría con la recarga en caliente.
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
    navigator.serviceWorker
      .register(`${basePath}/sw.js`, { scope: `${basePath}/`, updateViaCache: 'none' })
      .then(() => navigator.serviceWorker.ready)
      .then(registro => {
        // Archivos que esta página ya descargó: se guardan para abrirla sin conexión.
        const urls = performance.getEntriesByType('resource').map(r => r.name).filter(u => u.includes('/_next/static/'))
        registro.active?.postMessage({ tipo: 'guardar-recursos', urls })
      })
      .catch(error => console.warn('No se pudo registrar el service worker:', error))
  }, [])
  return null
}
