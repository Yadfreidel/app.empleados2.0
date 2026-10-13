// app/manifest.ts — Permite instalar la app en la pantalla de inicio del teléfono.
import type { MetadataRoute } from 'next'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'F&M Fumigación — Calendario Operativo',
    short_name: 'F&M Calendario',
    description: 'Calendario operativo de F&M Fumigación, disponible sin conexión.',
    start_url: `${basePath}/`,
    scope: `${basePath}/`,
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#15803d',
    lang: 'es',
    icons: [{ src: `${basePath}/images/logo.png`, sizes: '377x377', type: 'image/png', purpose: 'any' }],
  }
}
