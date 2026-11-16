import React, { useState } from 'react'
import { ClayModal } from '@/components/ui/ClayModal'
import { ClayTextarea } from '@/components/ui/ClayTextarea'
import { ClayButton } from '@/components/ui/ClayButton'
import { useAuth } from '@/context/AuthContext'
import { apiClient } from '@/api/client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import type { DairyTenant } from '@/types'
import { AlertTriangle, AlertCircle, ShieldAlert } from 'lucide-react'

interface SuspendDairyModalProps {
  isOpen: boolean
  onClose: () => void
  dairy: DairyTenant | null
  onSuccess?: () => void
}

export const SuspendDairyModal: React.FC<SuspendDairyModalProps> = ({
  isOpen,
  onClose,
  dairy,
  onSuccess,
}) => {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => {
      if (!dairy) throw new Error('No dairy selected')
      if (!user) throw new Error('Unauthenticated')
      return apiClient.suspendDairy(
        {
          dairyId: dairy.id,
          reason,
        },
        user
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dairies.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.admins.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.metrics })
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.audit.all })
      if (dairy) {
        queryClient.invalidateQueries({ queryKey: queryKeys.dairies.detail(dairy.id) })
      }
      setReason('')
      setError(null)
      onClose()
      if (onSuccess) onSuccess()
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to suspend dairy')
    },
  })

  if (!dairy) return null

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault()
    if (reason.trim().length < 10) {
      setError('A detailed operational reason (minimum 10 characters) is required.')
      return
    }
    setError(null)
    mutation.mutate()
  }

  return (
    <ClayModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 text-rose-700">
          <ShieldAlert className="w-5 h-5" />
          <span>Suspend Dairy Tenant</span>
        </div>
      }
      subtitle={`Tenant: ${dairy.name} (${dairy.code})`}
      maxWidth="md"
    >
      <form onSubmit={handleConfirm} className="space-y-4">
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1.5">
          <div className="font-bold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>Important Operational Restrictions</span>
          </div>
          <p>
            Suspending this dairy will temporarily disable Primary Dairy Admin logins and block new data synchronization. Existing historical milk collection and farmer ledger records will remain <strong>100% preserved and un-deleted</strong>.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-100/70 border border-rose-200 text-xs text-rose-900 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <ClayTextarea
          label="Mandatory Reason for Suspension"
          placeholder="e.g. Failure to comply with mandatory hardware calibration protocol..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          helperText="This reason is permanently appended to the platform audit ledger."
          required
          autoFocus
        />

        <div className="pt-3 flex items-center justify-end gap-3">
          <ClayButton type="button" variant="outline" onClick={onClose}>
            Cancel
          </ClayButton>
          <ClayButton
            type="submit"
            variant="danger"
            isLoading={mutation.isPending}
            disabled={reason.trim().length < 10}
          >
            Confirm Suspension
          </ClayButton>
        </div>
      </form>
    </ClayModal>
  )
}
