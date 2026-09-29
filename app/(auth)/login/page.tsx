'use client'
// app/(auth)/login/page.tsx
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mail, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react'
import Logo from '@/components/layout/Logo'
import Button from '@/components/ui/Button'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { loginSchema } from '@/lib/validations'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Validate
    const result = loginSchema.safeParse({ email, password })
    if (!result.success) {
      setError(result.error.issues[0].message)
      return
    }

    setLoading(true)
    try {
      // Import client dynamically to avoid SSR issues
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: result.data.email,
        password: result.data.password,
      })
      if (authError) {
        setError('Credenciales incorrectas. Verifica tu correo y contraseña.')
        return
      }
      router.push('/admin/dashboard')
      router.refresh()
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{
        background: 'linear-gradient(135deg, var(--fm-green-950) 0%, var(--fm-blue-950) 100%)',
      }}
    >
      {/* Theme toggle in login */}
      <div className="absolute top-4 right-4">
        <ThemeToggle className="text-white hover:text-white/80 hover:bg-white/10" />
      </div>

      {/* Card */}
      <div className="fm-card w-full max-w-sm p-6 sm:p-8 fm-animate-scalein border border-border bg-card text-foreground rounded-xl shadow-2xl">
        {/* Logo */}
        <div className="flex justify-center mb-7">
          <Logo size="lg" />
        </div>

        <h1 className="text-xl font-bold text-foreground text-center mb-1">
          Acceso Administrador
        </h1>
        <p className="text-sm text-muted-foreground text-center mb-6">
          Ingresa tus credenciales para continuar
        </p>

        {/* Error */}
        {error && (
          <div
            className="flex items-start gap-2.5 p-3.5 rounded-fm mb-5 fm-animate-fadein text-sm bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900"
            role="alert"
          >
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Email */}
          <div>
            <label htmlFor="email" className="fm-label">Correo electrónico</label>
            <div className="relative">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground"
                aria-hidden="true"
              >
                <Mail size={16} />
              </span>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="fm-input pl-9"
                placeholder="admin@fumigacion.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(null) }}
                required
                disabled={loading}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="fm-label">Contraseña</label>
            <div className="relative">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground"
                aria-hidden="true"
              >
                <Lock size={16} />
              </span>
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                className="fm-input pl-9 pr-10"
                placeholder="••••••••"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(null) }}
                required
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded transition-colors text-muted-foreground hover:text-foreground min-w-[36px] min-h-[36px] flex items-center justify-center"
                tabIndex={-1}
                aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <Button
            id="btn-login"
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            className="w-full mt-2 min-h-[44px]"
          >
            Iniciar sesión
          </Button>
        </form>

        {/* Back link */}
        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-block py-2"
          >
            ← Ver calendario
          </Link>
        </div>
      </div>
    </div>
  )
}
