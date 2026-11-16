import React, { useState } from 'react'
import { ClayModal } from './ClayModal'
import { ClayButton } from './ClayButton'
import { ClayInput } from './ClayInput'
import { AlertTriangle, Info, CheckCircle2, AlertCircle } from 'lucide-react'
import clsx from 'clsx'

export interface ConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (reason?: string) => Promise<void> | void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'primary' | 'success'
  requireReason?: boolean
  reasonLabel?: string
  reasonPlaceholder?: string
  isLoading?: boolean
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  requireReason = false,
  reasonLabel = 'Operator Reason',
  reasonPlaceholder = 'Please explain rationale...',
  isLoading = false,
}) => {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const handleConfirm = async () => {
    if (requireReason && (!reason || reason.trim().length < 5)) {
      setError('Please provide an authorized reason (min 5 characters).')
      return
    }
    setError('')
    await onConfirm(reason)
    setReason('')
  }

  const handleClose = () => {
    setReason('')
    setError('')
    onClose()
  }

  return (
    <ClayModal isOpen={isOpen} onClose={handleClose} title={title}>
      <div className="flex flex-col gap-4 text-left">
        <div className="flex items-start gap-3 p-3 bg-[#FFF5EE] border border-[#F1E7E0] rounded-xl text-[#211B18] text-xs leading-relaxed">
          <AlertTriangle className="text-[#FF6A00] shrink-0 mt-0.5" size={18} />
          <div>{message}</div>
        </div>

        {requireReason && (
          <ClayInput
            label={reasonLabel}
            placeholder={reasonPlaceholder}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              if (error) setError('')
            }}
            error={error}
          />
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F1E7E0]">
          <ClayButton variant="ghost" size="md" onClick={handleClose} disabled={isLoading}>
            {cancelText}
          </ClayButton>
          <ClayButton
            variant={variant === 'danger' ? 'danger' : variant === 'success' ? 'success' : 'primary'}
            size="md"
            onClick={handleConfirm}
            isLoading={isLoading}
          >
            {confirmText}
          </ClayButton>
        </div>
      </div>
    </ClayModal>
  )
}

export interface ClayAlertProps {
  type?: 'info' | 'warning' | 'danger' | 'success'
  title?: string
  message: React.ReactNode
  className?: string
  action?: React.ReactNode
}

export const ClayAlert: React.FC<ClayAlertProps> = ({
  type = 'info',
  title,
  message,
  className = '',
  action,
}) => {
  const styles = {
    info: { bg: 'bg-blue-50 border-blue-200 text-blue-900', icon: <Info className="text-blue-600 shrink-0" size={17} /> },
    warning: { bg: 'bg-amber-50 border-amber-200 text-amber-900', icon: <AlertTriangle className="text-amber-600 shrink-0" size={17} /> },
    danger: { bg: 'bg-red-50 border-red-200 text-red-900', icon: <AlertCircle className="text-red-600 shrink-0" size={17} /> },
    success: { bg: 'bg-emerald-50 border-emerald-200 text-emerald-900', icon: <CheckCircle2 className="text-emerald-600 shrink-0" size={17} /> },
  }
  const current = styles[type]

  return (
    <div className={clsx('p-3.5 rounded-xl border flex items-start gap-2.5 shadow-xs text-xs', current.bg, className)}>
      <div className="mt-0.5">{current.icon}</div>
      <div className="flex-1">
        {title && <h5 className="font-bold text-xs mb-0.5">{title}</h5>}
        <div className="leading-relaxed opacity-95">{message}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
