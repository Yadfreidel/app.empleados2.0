// app/layout.tsx
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export const metadata: Metadata = {
  title: {
    default: 'F&M Fumigación — Calendario Operativo',
    template: '%s | F&M Fumigación',
  },
  description: 'Sistema de gestión operativa para F&M Fumigación. Consulta y administra los trabajos programados en cada hotel.',
  keywords: ['fumigación', 'calendario operativo', 'control de plagas', 'hoteles'],
  robots: 'noindex,nofollow', // app interna
  icons: {
    icon: `${basePath}/images/logo.png`,
    shortcut: `${basePath}/images/logo.png`,
    apple: `${basePath}/images/logo.png`,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
