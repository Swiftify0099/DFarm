import React, { useState } from 'react'
import { ClayModal } from '@/components/ui/ClayModal'
import { ClayInput } from '@/components/ui/ClayInput'
import { ClayButton } from '@/components/ui/ClayButton'
import { useAuth } from '@/context/AuthContext'
import { apiClient } from '@/api/client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import type { DairyTenant } from '@/types'
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'

interface ReactivateDairyModalProps {
  isOpen: boolean
  onClose: () => void
  dairy: DairyTenant | null
  onSuccess?: () => void
}

export const ReactivateDairyModal: React.FC<ReactivateDairyModalProps> = ({
  isOpen,
  onClose,
  dairy,
  onSuccess,
}) => {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => {
      if (!dairy) throw new Error('No dairy selected')
      if (!user) throw new Error('Unauthenticated')
      return apiClient.reactivateDairy(
        {
          dairyId: dairy.id,
          reason: note || 'Super Admin operational review cleared tenant for active service',
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
      setNote('')
      setError(null)
      onClose()
      if (onSuccess) onSuccess()
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to reactivate dairy')
    },
  })

  if (!dairy) return null

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    mutation.mutate()
  }

  return (
    <ClayModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 text-emerald-700">
          <RefreshCw className="w-5 h-5 text-emerald-600" />
          <span>Reactivate Dairy Tenant</span>
        </div>
      }
      subtitle={`Tenant: ${dairy.name} (${dairy.code})`}
      maxWidth="md"
    >
      <form onSubmit={handleConfirm} className="space-y-4">
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Operational Restoration</span>
          </div>
          <p>
            Reactivating this tenant will restore Primary Dairy Admin login privileges and permit edge device synchronization.
          </p>
        </div>

        {dairy.suspensionReason && (
          <div className="p-3 rounded-xl bg-[#FAF6F3] border border-[#F1E7E0] text-xs text-[#817A75]">
            <span className="font-bold block text-[#211B18] mb-0.5">Original Suspension Reason:</span>
            <p className="italic">"{dairy.suspensionReason}"</p>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <ClayInput
          label="Reactivation Note / Compliance Audit Ref"
          placeholder="e.g. Hardware calibration report verified on 15-Nov..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          helperText="Optional note for the platform audit trail."
        />

        <div className="pt-3 flex items-center justify-end gap-3">
          <ClayButton type="button" variant="outline" onClick={onClose}>
            Cancel
          </ClayButton>
          <ClayButton
            type="submit"
            variant="primary"
            isLoading={mutation.isPending}
          >
            Authorize Reactivation
          </ClayButton>
        </div>
      </form>
    </ClayModal>
  )
}
