import React, { useEffect } from 'react'
import { cn } from '@/utils/cn'
import { X } from 'lucide-react'

interface ClayModalProps {
  isOpen: boolean
  onClose: () => void
  title?: React.ReactNode
  subtitle?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  className?: string
}

export const ClayModal: React.FC<ClayModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth,
  size,
  className,
}) => {
  const effectiveMaxWidth = maxWidth || size || 'md'
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.body.style.overflow = 'unset'
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  }[effectiveMaxWidth]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#211B18]/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Dialog Surface */}
      <div
        className={cn(
          'relative w-full bg-white rounded-3xl border border-[#F1E7E0] z-10 overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200',
          maxWidthClass,
          className
        )}
        style={{
          boxShadow:
            '0 20px 40px -8px rgba(33, 27, 24, 0.25), 0 0 0 1px rgba(241, 231, 224, 0.8), inset 0 2px 2px 0 rgba(255, 255, 255, 0.9)',
        }}
      >
        {/* Header */}
        {(title || subtitle) && (
          <div className="px-6 pt-6 pb-4 border-b border-[#F1E7E0] flex items-start justify-between bg-gradient-to-b from-[#FFF5EE] to-white">
            <div className="flex flex-col gap-1 pr-6">
              {typeof title === 'string' ? (
                <h3 className="text-lg font-bold text-[#211B18] tracking-tight">{title}</h3>
              ) : (
                title
              )}
              {subtitle && <p className="text-xs text-[#817A75]">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="text-[#817A75] hover:text-[#211B18] p-1.5 rounded-xl hover:bg-[#FFE9DC] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 max-h-[calc(85vh-130px)] overflow-y-auto">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-[#F1E7E0] bg-[#FAF6F3] flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
