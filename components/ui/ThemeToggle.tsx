'use client'

import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'
import { Sun, Moon } from 'lucide-react'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  className?: string
}

const emptySubscribe = () => () => {}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn('min-w-[44px] min-h-[44px] text-muted-foreground', className)}
        aria-label="Cambiar tema"
        disabled
      >
        <span className="w-5 h-5 block opacity-0" />
      </Button>
    )
  }

  const isDark = resolvedTheme === 'dark'

  return (
    <Button
      id="theme-toggle-btn"
      variant="ghost"
      size="icon"
      className={cn('min-w-[44px] min-h-[44px] text-foreground transition-transform active:scale-95', className)}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
    >
      {isDark ? (
        <Sun className="h-5 w-5 text-amber-400 transition-transform duration-200 rotate-0" />
      ) : (
        <Moon className="h-5 w-5 text-slate-700 dark:text-slate-200 transition-transform duration-200" />
      )}
    </Button>
  )
}

export default ThemeToggle
