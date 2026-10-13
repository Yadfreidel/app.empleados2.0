'use client'
// app/perfil/page.tsx – Mi perfil: datos de la cuenta y fotografía (editable cuando quiera).
import Link from 'next/link'
import { LogIn, Mail, ShieldCheck, UserRound } from 'lucide-react'
import Header from '@/components/layout/Header'
import BarraLateral from '@/components/layout/BarraLateral'
import SelectorFotoPerfil from '@/components/perfil/SelectorFotoPerfil'
import { Skeleton } from '@/components/ui/Skeleton'
import { nombreVisible, usePerfil } from '@/lib/perfil/perfil'

export default function MiPerfilPage() {
  const { cargando, perfil, avatarUrl, instalado } = usePerfil()

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <BarraLateral />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header conBarraLateral titulo="Mi perfil" />
        <main className="flex-1 w-full px-4 py-5 md:px-6 lg:py-6 xl:px-8">
          <h1 className="mb-4 text-xl font-800 tracking-tight lg:hidden">Mi perfil</h1>
          {cargando ? (
            <Skeleton className="h-80 max-w-3xl rounded-2xl" />
          ) : !perfil ? (
            <div className="fm-card max-w-md p-6 text-center">
              <p className="font-semibold">Inicia sesión para ver tu perfil.</p>
              <Link href="/login?volver=/perfil" className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700">
                <LogIn size={15} /> Iniciar sesión
              </Link>
            </div>
          ) : (
            <div className="grid max-w-4xl gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <section className="fm-card p-5">
                <h2 className="mb-3 text-base font-bold">Datos de la cuenta</h2>
                <dl className="space-y-3 text-sm">
                  <div className="flex items-start gap-3"><UserRound size={16} className="mt-0.5 text-muted-foreground" />
                    <div><dt className="text-xs text-muted-foreground">Nombre</dt><dd className="font-semibold">{nombreVisible(perfil)}</dd></div></div>
                  <div className="flex items-start gap-3"><Mail size={16} className="mt-0.5 text-muted-foreground" />
                    <div className="min-w-0"><dt className="text-xs text-muted-foreground">Correo</dt><dd className="break-all font-semibold">{perfil.email}</dd></div></div>
                  <div className="flex items-start gap-3"><ShieldCheck size={16} className="mt-0.5 text-muted-foreground" />
                    <div><dt className="text-xs text-muted-foreground">Rol</dt><dd className="font-semibold">{perfil.role === 'admin' ? 'Administrador' : 'Supervisor'}</dd></div></div>
                </dl>
                <p className="mt-4 text-xs text-muted-foreground">El nombre, el correo y el rol los gestiona la administración.</p>
              </section>
              <section className="fm-card p-5">
                <h2 className="mb-1 text-base font-bold">Fotografía</h2>
                <p className="mb-4 text-xs text-muted-foreground">Se muestra en el encabezado y en tu menú de usuario.</p>
                {instalado ? (
                  <SelectorFotoPerfil nombre={nombreVisible(perfil)} fotoActual={avatarUrl} />
                ) : (
                  <p className="text-sm text-muted-foreground">La foto de perfil aún no está habilitada (falta la migración 015 en Supabase).</p>
                )}
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
