'use client'
// components/ui/Modal.tsx
import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import Button from './Button'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  footer?: ReactNode
}

const maxWidths = {
  sm:  'max-w-sm',
  md:  'max-w-md',
  lg:  'max-w-lg',
  xl:  'max-w-xl',
  '2xl': 'max-w-2xl',
}

export default function Modal({ open, onClose, title, children, maxWidth = 'md', footer }: ModalProps) {
  const titleId = useId()
  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Lock body scroll
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fm-backdrop" onClick={onClose} aria-hidden="true" />
      {/* Modal */}
      <div className="fm-modal" role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
        <div className={`fm-modal-content w-full ${maxWidths[maxWidth]} bg-card text-foreground border border-border shadow-xl rounded-xl`}>
          {/* Header */}
          {title && (
            <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-4 sm:px-6 sm:pt-5 pb-3 border-b border-border">
              <h2 id={titleId} className="text-lg font-bold text-foreground">{title}</h2>
              <Button
                variant="ghost"
                size="icon"
                className="min-w-[44px] min-h-[44px] text-muted-foreground hover:text-foreground"
                onClick={onClose}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </Button>
            </div>
          )}
          {/* Body */}
          <div className="fm-modal-body px-5 py-4 sm:px-6 sm:py-5" tabIndex={0} aria-label="Contenido del formulario">
            {children}
          </div>
          {/* Footer */}
          {footer && (
            <div className="fm-modal-footer border-t border-border bg-card px-5 pb-4 pt-3 sm:px-6 sm:pb-5">
              {footer}
            </div>
          )}
        </div>
      </div>
    </>, document.body
  )
}

// Confirm dialog
interface ConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  loading?: boolean
}

export function ConfirmModal({
  open, onClose, onConfirm, title, message, confirmLabel = 'Confirmar', loading
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading} className="min-h-[44px]">
            Cancelar
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading} className="min-h-[44px]">
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-muted-foreground text-sm leading-relaxed">{message}</p>
    </Modal>
  )
}
