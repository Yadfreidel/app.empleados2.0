'use client'
// components/ui/Button.tsx
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size    = 'sm' | 'md' | 'lg' | 'xl' | 'icon' | 'icon-sm' | 'icon-lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

const variantStyles: Record<Variant, string> = {
  primary:   'fm-btn-primary',
  secondary: 'fm-btn-secondary',
  ghost:     'fm-btn-ghost',
  danger:    'fm-btn-danger',
  outline:   'fm-btn-secondary border-fm-green-300 text-fm-green-800 hover:bg-fm-green-50 dark:border-fm-green-800 dark:text-fm-green-300 dark:hover:bg-fm-green-950',
}

const sizeStyles: Record<Size, string> = {
  sm:      'fm-btn-sm',
  md:      'fm-btn-md',
  lg:      'fm-btn-lg',
  xl:      'fm-btn-xl',
  icon:    'fm-btn-icon',
  'icon-sm': 'fm-btn-icon fm-btn-icon-sm',
  'icon-lg': 'fm-btn-icon fm-btn-icon-lg',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, leftIcon, rightIcon, children, className, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn('fm-btn', variantStyles[variant], sizeStyles[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <Loader2 size={15} className="animate-spin" />
        ) : leftIcon ? (
          leftIcon
        ) : null}
        {children}
        {!loading && rightIcon}
      </button>
    )
  }
)

Button.displayName = 'Button'
export default Button
