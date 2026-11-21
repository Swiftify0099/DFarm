import React, { useState } from 'react'
import { ClayModal } from '@/components/ui/ClayModal'
import { ClayInput } from '@/components/ui/ClayInput'
import { ClayTextarea } from '@/components/ui/ClayTextarea'
import { ClayButton } from '@/components/ui/ClayButton'
import { useAuth } from '@/context/AuthContext'
import { apiClient } from '@/api/client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import type { DairyTenant } from '@/types'
import { AlertTriangle, AlertCircle, Trash2, Database, ShieldAlert } from 'lucide-react'

interface DeleteDairyModalProps {
  isOpen: boolean
  onClose: () => void
  dairy: DairyTenant | null
  onSuccess?: () => void
}

export const DeleteDairyModal: React.FC<DeleteDairyModalProps> = ({
  isOpen,
  onClose,
  dairy,
  onSuccess,
}) => {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [typedCode, setTypedCode] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const isConfirmed = Boolean(
    dairy && typedCode.trim().toUpperCase() === dairy.code.trim().toUpperCase()
  )

  const mutation = useMutation({
    mutationFn: () => {
      if (!dairy) throw new Error('No dairy selected')
      if (!user) throw new Error('Unauthenticated')
      if (!isConfirmed) throw new Error('Dairy code confirmation mismatch')
      return apiClient.deprovisionDairy(
        {
          dairyId: dairy.id,
          confirmDairyCode: typedCode.trim(),
          reason: reason.trim() || 'Super Admin permanent deprovisioning',
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
        queryClient.removeQueries({ queryKey: queryKeys.dairies.detail(dairy.id) })
      }
      setTypedCode('')
      setReason('')
      setError(null)
      onClose()
      if (onSuccess) onSuccess()
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to permanently delete dairy')
    },
  })

  if (!dairy) return null

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isConfirmed) {
      setError(`Please type the exact dairy code '${dairy.code}' to confirm.`)
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
          <Trash2 className="w-5 h-5" />
          <span>Permanently Delete & Deprovision Dairy</span>
        </div>
      }
      subtitle={`Tenant: ${dairy.name} (${dairy.code})`}
      maxWidth="md"
    >
      <form onSubmit={handleConfirm} className="space-y-4">
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-2">
          <div className="font-bold flex items-center gap-1.5 text-rose-700">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>CRITICAL P0: IRREVERSIBLE PHYSICAL DATA DEPROVISIONING</span>
          </div>
          <p>
            This action will permanently <strong>DROP the isolated PostgreSQL tenant database</strong> for this Dairy.
          </p>
          <ul className="list-disc pl-4 space-y-1 text-rose-800">
            <li>Physical database <code>dfarm_tenant_{dairy.code.toLowerCase()}...</code> will be purged.</li>
            <li>Local milk collections, ledger balances, monthly bills, and YuNet/SFace biometric templates will be permanently removed.</li>
            <li>Central memberships for this Dairy will be deleted.</li>
            <li>
              <strong>Global Safety Guarantee:</strong> Global customer identities and other Dairy memberships belonging to the same farmers will <strong>NOT</strong> be deleted.
            </li>
          </ul>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-100/70 border border-rose-200 text-xs text-rose-900 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700">
            Type Dairy Code <code className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-mono font-bold">{dairy.code}</code> to confirm:
          </label>
          <ClayInput
            value={typedCode}
            onChange={(e) => setTypedCode(e.target.value)}
            placeholder={`Enter '${dairy.code}'`}
            autoFocus
            required
          />
        </div>

        <ClayTextarea
          label="Operational Deletion Reason (Optional)"
          placeholder="e.g. Legal cooperative closure, migration to new society, or test decommissioning..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          helperText="Reason recorded in platform administrative audit trail."
        />

        <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
          <ClayButton type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </ClayButton>
          <ClayButton
            type="submit"
            variant="danger"
            isLoading={mutation.isPending}
            disabled={!isConfirmed}
          >
            Permanently Drop Database & Delete
          </ClayButton>
        </div>
      </form>
    </ClayModal>
  )
}
