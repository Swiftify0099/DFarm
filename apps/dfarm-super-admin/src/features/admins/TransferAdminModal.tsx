import React, { useState } from 'react'
import { ClayModal } from '@/components/ui/ClayModal'
import { ClayInput } from '@/components/ui/ClayInput'
import { ClayTextarea } from '@/components/ui/ClayTextarea'
import { ClayButton } from '@/components/ui/ClayButton'
import { useAuth } from '@/context/AuthContext'
import { apiClient } from '@/api/client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import type { DairyTenant, DairyAdminAccount } from '@/types'
import { UserCheck, AlertTriangle, AlertCircle, ArrowRightLeft } from 'lucide-react'

interface TransferAdminModalProps {
  isOpen: boolean
  onClose: () => void
  dairy: DairyTenant | null
  currentAdmin: DairyAdminAccount | null
  onSuccess?: () => void
}

export const TransferAdminModal: React.FC<TransferAdminModalProps> = ({
  isOpen,
  onClose,
  dairy,
  currentAdmin,
  onSuccess,
}) => {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [newAdminName, setNewAdminName] = useState('')
  const [newAdminMobile, setNewAdminMobile] = useState('')
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [confirmationText, setConfirmationText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => {
      if (!dairy || !currentAdmin) throw new Error('Incomplete dairy data')
      if (!user) throw new Error('Unauthenticated')
      return apiClient.transferPrimaryAdmin(
        {
          dairyId: dairy.id,
          currentAdminId: currentAdmin.id,
          newAdminName,
          newAdminMobile,
          newAdminEmail,
          transferReason,
          confirmationText,
        },
        user
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dairies.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.admins.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.audit.all })
      if (dairy) {
        queryClient.invalidateQueries({ queryKey: queryKeys.dairies.detail(dairy.id) })
      }
      handleClose()
      if (onSuccess) onSuccess()
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to transfer administration')
    },
  })

  const handleClose = () => {
    setNewAdminName('')
    setNewAdminMobile('')
    setNewAdminEmail('')
    setTransferReason('')
    setConfirmationText('')
    setError(null)
    onClose()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (confirmationText !== 'CONFIRM TRANSFER') {
      setError('You must type "CONFIRM TRANSFER" exactly to proceed.')
      return
    }

    if (transferReason.trim().length < 10) {
      setError('A detailed operational reason (minimum 10 characters) is required.')
      return
    }

    mutation.mutate()
  }

  if (!dairy) return null

  return (
    <ClayModal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <div className="flex items-center gap-2 text-[#211B18]">
          <ArrowRightLeft className="w-5 h-5 text-[#FF6A00]" />
          <span>Transfer Primary Dairy Administration</span>
        </div>
      }
      subtitle={`Tenant: ${dairy.name} (${dairy.code})`}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Sole Root Ownership Transfer</span>
          </div>
          <p>
            Transferring primary administration immediately disables the previous admin account (<strong>{currentAdmin?.fullName || dairy.primaryAdminName}</strong>). The new primary admin will receive an activation SMS and must verify mobile OTP.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ClayInput
            label="New Primary Admin Full Name"
            placeholder="e.g. Ramesh Kumar"
            value={newAdminName}
            onChange={(e) => setNewAdminName(e.target.value)}
            required
            autoFocus
          />

          <ClayInput
            label="New Admin Mobile Number"
            type="tel"
            placeholder="10-digit mobile"
            maxLength={10}
            value={newAdminMobile}
            onChange={(e) => setNewAdminMobile(e.target.value)}
            required
          />
        </div>

        <ClayInput
          label="New Admin Email (Optional)"
          type="email"
          placeholder="e.g. admin@dairy.org"
          value={newAdminEmail}
          onChange={(e) => setNewAdminEmail(e.target.value)}
        />

        <ClayTextarea
          label="Operational Justification for Transfer"
          placeholder="e.g. Board resolution dated 12-Nov transferring managerial responsibility..."
          value={transferReason}
          onChange={(e) => setTransferReason(e.target.value)}
          rows={3}
          helperText="Permanently recorded in multi-tenant audit ledger"
          required
        />

        <div className="p-3 rounded-xl bg-[#FAF6F3] border border-[#F1E7E0] space-y-2">
          <span className="text-xs font-bold text-[#211B18] block">
            Type <span className="font-mono text-rose-600">CONFIRM TRANSFER</span> to authorize:
          </span>
          <ClayInput
            placeholder="CONFIRM TRANSFER"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            required
          />
        </div>

        <div className="pt-3 flex items-center justify-end gap-3">
          <ClayButton type="button" variant="outline" onClick={handleClose}>
            Cancel
          </ClayButton>
          <ClayButton
            type="submit"
            variant="danger"
            isLoading={mutation.isPending}
            disabled={confirmationText !== 'CONFIRM TRANSFER' || transferReason.trim().length < 10}
          >
            Authorize Ownership Transfer
          </ClayButton>
        </div>
      </form>
    </ClayModal>
  )
}
