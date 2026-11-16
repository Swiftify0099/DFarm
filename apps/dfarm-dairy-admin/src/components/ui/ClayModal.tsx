import React, { useEffect } from 'react'
import { X } from 'lucide-react'
import { ClayCard } from './ClayCard'

export interface ClayModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
}

export const ClayModal: React.FC<ClayModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'md',
}) => {
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

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#211B18]/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className={`relative w-full ${maxWidthClasses[maxWidth]} my-8 z-10 animate-in fade-in zoom-in-95 duration-150`}>
        <ClayCard className="shadow-2xl border-[#F1E7E0] !p-6 sm:!p-8">
          <div className="flex items-start justify-between pb-4 border-b border-[#F1E7E0] mb-5">
            <div>
              <h3 className="text-xl font-bold text-[#211B18]">{title}</h3>
              {subtitle && <p className="text-xs text-[#817A75] mt-1">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#817A75] hover:text-[#211B18] hover:bg-[#FFE9DC]/50 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
          <div>{children}</div>
        </ClayCard>
      </div>
    </div>
  )
}
