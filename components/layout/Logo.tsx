// components/layout/Logo.tsx
import Image from 'next/image'
import { cn } from '@/lib/utils'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  className?: string
  textColor?: string
}

const sizes = {
  sm: { icon: 34, fontSize: '0.95rem', gap: '0.625rem' },
  md: { icon: 44, fontSize: '1.15rem', gap: '0.75rem' },
  lg: { icon: 64, fontSize: '1.45rem', gap: '0.875rem' },
  xl: { icon: 84, fontSize: '1.75rem', gap: '1rem' },
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export default function Logo({ size = 'md', showText = true, className, textColor }: LogoProps) {
  const s = sizes[size] || sizes.md

  return (
    <div className={cn('flex items-center select-none', className)} style={{ gap: s.gap }}>
      {/* Official Company Logo */}
      <div
        className="relative flex-shrink-0 rounded-full overflow-hidden shadow-sm border border-slate-100/80 transition-transform duration-200 hover:scale-105"
        style={{
          width: s.icon,
          height: s.icon,
          boxShadow: '0 2px 8px rgba(22, 163, 74, 0.25)',
        }}
      >
        <Image
          src={`${basePath}/images/logo.png`}
          alt="F&M Fumigación Logo"
          width={s.icon * 2}
          height={s.icon * 2}
          className="w-full h-full object-cover rounded-full"
          priority
        />
      </div>

      {/* Brand Text */}
      {showText && (
        <div style={{ color: textColor || 'var(--color-text)' }}>
          <div
            style={{
              fontSize: s.fontSize,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
            }}
          >
            F&amp;M
          </div>
          <div
            style={{
              fontSize: `calc(${s.fontSize} * 0.65)`,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--fm-green-700)',
            }}
          >
            Fumigación
          </div>
        </div>
      )}
    </div>
  )
}
