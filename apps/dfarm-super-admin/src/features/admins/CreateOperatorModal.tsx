import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { apiClient } from '@/api/client'
import { ClayModal } from '@/components/ui/ClayModal'
import { ClayInput } from '@/components/ui/ClayInput'
import { ClaySelect } from '@/components/ui/ClaySelect'
import { ClayButton } from '@/components/ui/ClayButton'
import { ShieldCheck, UserPlus, AlertCircle } from 'lucide-react'

interface CreateOperatorModalProps {
  isOpen: boolean
  onClose: () => void
}

export const CreateOperatorModal: React.FC<CreateOperatorModalProps> = ({ isOpen, onClose }) => {
  const queryClient = useQueryClient()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [role, setRole] = useState<'PLATFORM_OPERATOR' | 'SUPER_ADMIN'>('PLATFORM_OPERATOR')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => {
      const cleanMobile = mobile.replace(/\D/g, '').slice(-10)
      if (cleanMobile.length !== 10) throw new Error('Valid 10-digit mobile number required.')
      return apiClient.createPlatformUser({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        mobile: cleanMobile,
        role,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.users })
      onClose()
      setFullName('')
      setEmail('')
      setMobile('')
      setRole('PLATFORM_OPERATOR')
      setErrorMsg(null)
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to create platform operator account')
    },
  })

  return (
    <ClayModal
      isOpen={isOpen}
      onClose={onClose}
      title="Provision Platform Operator Account"
      subtitle="Create a verified central platform administrative user with least-privilege RBAC."
      size="md"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <ClayButton variant="ghost" onClick={onClose}>
            Cancel
          </ClayButton>
          <ClayButton
            variant="primary"
            disabled={mutation.isPending || !fullName || !email || !mobile}
            onClick={() => {
              setErrorMsg(null)
              mutation.mutate()
            }}
          >
            {mutation.isPending ? 'Provisioning...' : 'Provision Operator'}
          </ClayButton>
        </div>
      }
    >
      <div className="space-y-4">
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <ClayInput
          label="Full Legal Name *"
          placeholder="e.g. Ramesh Kadam"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />

        <ClayInput
          label="Corporate Email Address *"
          type="email"
          placeholder="e.g. ramesh.kadam@dfarm.in"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <ClayInput
          label="Mobile Number (for SMS OTP) *"
          placeholder="10-digit number (e.g. 9822123456)"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
        />

        <ClaySelect
          label="Administrative Role *"
          value={role}
          onChange={(e) => setRole(e.target.value as any)}
          options={[
            {
              value: 'PLATFORM_OPERATOR',
              label: 'PLATFORM_OPERATOR (Telemetry, Alert Monitoring & Support Diagnostics)',
            },
            {
              value: 'SUPER_ADMIN',
              label: 'SUPER_ADMIN (Full Statutory Policy & Tenant Provisioning Authority)',
            },
          ]}
        />

        <div className="p-3 rounded-xl bg-[#FAF6F3] border border-[#F1E7E0] text-xs text-[#817A75] space-y-1">
          <span className="font-bold text-[#211B18] block flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#FF6A00]" />
            Authentication Method:
          </span>
          <p>
            Operators authenticate via phone OTP dispatched through Dove SMS / ExpertSkill. Passwords and unauthenticated session tokens are prohibited.
          </p>
        </div>
      </div>
    </ClayModal>
  )
}
