import React, { useState } from 'react'
import { ClayModal } from './ClayModal'
import { ClayButton } from './ClayButton'
import { ClayInput } from './ClayInput'
import { AlertTriangle } from 'lucide-react'

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
  reasonLabel = 'Authorized Reason',
  reasonPlaceholder = 'Please explain the rationale for this action (min 5 chars)...',
  isLoading = false,
}) => {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const handleConfirm = async () => {
    if (requireReason) {
      if (!reason || reason.trim().length < 5) {
        setError('Please provide a reason with at least 5 characters.')
        return
      }
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
        <div className="flex items-start gap-3 p-3 bg-[#FFF5EE] border border-[#F1E7E0] rounded-xl text-[#211B18] text-sm leading-relaxed">
          <AlertTriangle className="text-[#FF6A00] shrink-0 mt-0.5" size={18} />
          <div>{message}</div>
        </div>

        {requireReason && (
          <div className="mt-1">
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
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#F1E7E0] mt-2">
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
