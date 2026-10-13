'use client'
// app/areas/page.tsx – Calendario por áreas (apartado propio, separado del calendario operativo).
import Header from '@/components/layout/Header'
import BarraLateral from '@/components/layout/BarraLateral'
import AreaCalendarSection from '@/components/calendar/AreaCalendarSection'

export default function CalendarioAreasPage() {
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Menú lateral azul marino (solo PC) */}
      <BarraLateral />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header conBarraLateral titulo="Calendario por áreas" />

        <main className="flex-1 w-full px-4 py-5 md:px-6 lg:py-6 xl:px-8">
          <div className="fm-card p-4 sm:p-6">
            <AreaCalendarSection />
          </div>
        </main>

        {/* Footer (en PC está en el menú lateral) */}
        <footer className="lg:hidden text-center py-5 text-xs text-muted-foreground border-t border-border mt-auto">
          &copy; {new Date().getFullYear()} F&amp;M Fumigación &mdash; Sistema de gestión operativa
        </footer>
      </div>
    </div>
  )
}
