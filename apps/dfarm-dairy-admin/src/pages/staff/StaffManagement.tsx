import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import type { StaffMember } from '@/types'
import {
  ClayCard,
  ClayBadge,
  ClayTable,
  ClayButton,
  ClayModal,
  ClayInput,
  ClaySelect,
  ClayAlert,
  Column,
} from '@/components/ui'
import {
  ShieldCheck,
  Shield,
  Smartphone,
  UserPlus,
  Building2,
  CheckCircle2,
  AlertCircle,
  Power,
  RotateCcw,
} from 'lucide-react'

export const StaffManagement: React.FC = () => {
  const queryClient = useQueryClient()

  // 1. Fetch Staff List
  const { data: staffList = [], isLoading, refetch } = useQuery({
    queryKey: ['staffMembers'],
    queryFn: () => api.staff.getAll(),
  })

  // 2. Fetch Centers for Assignment
  const { data: centerList = [] } = useQuery({
    queryKey: ['staffCenters'],
    queryFn: () => api.staff.getCenters(),
  })

  // 3. Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    fullName: '',
    mobileNumber: '',
    role: 'COLLECTION_OPERATOR',
    centerId: '',
    counterName: 'Counter 1',
    email: '',
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [successBanner, setSuccessBanner] = useState<string | null>(null)

  // 4. Onboard Staff Mutation
  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => api.staff.create(data),
    onSuccess: (res) => {
      if (res && res.success) {
        queryClient.invalidateQueries({ queryKey: ['staffMembers'] })
        setIsModalOpen(false)
        setSuccessBanner(
          `Successfully onboarded ${formData.fullName} as ${formData.role.replace(/_/g, ' ')}!`
        )
        setFormData({
          fullName: '',
          mobileNumber: '',
          role: 'COLLECTION_OPERATOR',
          centerId: '',
          counterName: 'Counter 1',
          email: '',
        })
        setFormError(null)
      } else {
        setFormError(res?.error || 'Failed to onboard operator')
      }
    },
    onError: (err: any) => {
      setFormError(err.message || 'Error onboarding operator')
    },
  })

  // 5. Toggle Status Mutation
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'SUSPENDED' }) =>
      api.staff.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staffMembers'] })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!formData.fullName.trim() || formData.fullName.trim().length < 2) {
      setFormError('Please enter a valid full name.')
      return
    }
    const cleanDigits = formData.mobileNumber.replace(/\D/g, '')
    if (cleanDigits.length !== 10) {
      setFormError('Please enter a valid 10-digit mobile number.')
      return
    }

    createMutation.mutate({
      ...formData,
      mobileNumber: cleanDigits,
      centerId: formData.centerId || (centerList[0]?.id || ''),
    })
  }

  const columns: Column<StaffMember>[] = [
    {
      key: 'fullName',
      header: 'Staff Member / Phone',
      render: (r) => (
        <div>
          <span className="font-bold text-sm text-[#211B18]">{r.fullName}</span>
          <p className="text-xs text-[#817A75] flex items-center gap-1 mt-0.5 font-mono">
            <Smartphone size={12} className="text-[#FF6A00]" /> +91 {r.mobileNumber}
          </p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Assigned Role',
      render: (r) => (
        <ClayBadge
          variant={
            r.role === 'PRIMARY_DAIRY_ADMIN'
              ? 'approved'
              : r.role === 'COLLECTION_OPERATOR'
              ? 'pending'
              : 'neutral'
          }
        >
          {r.role.replace(/_/g, ' ')}
        </ClayBadge>
      ),
    },
    {
      key: 'center',
      header: 'Assigned Center',
      render: (r) => (
        <div className="flex items-center gap-1.5 text-xs text-[#211B18]">
          <Building2 size={13} className="text-[#817A75] shrink-0" />
          <span className="font-medium">{r.centerName || 'Main Center'}</span>
          {r.counterName && (
            <span className="text-[10px] bg-peach/40 text-primary-orange px-1.5 py-0.5 rounded font-mono font-semibold">
              {r.counterName}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'permissions',
      header: 'Permissions',
      render: (r) => (
        <div className="flex flex-wrap gap-1 max-w-xs">
          {(r.permissions || []).slice(0, 3).map((p) => (
            <span
              key={p}
              className="text-[10px] font-mono font-bold bg-[#FFF5EE] border border-[#FFE9DC] text-[#FF6A00] px-1.5 py-0.5 rounded"
            >
              {p}
            </span>
          ))}
          {(r.permissions || []).length > 3 && (
            <span className="text-[10px] text-[#817A75] font-semibold">
              +{r.permissions.length - 3} more
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <ClayBadge variant={r.isActive ? 'approved' : 'rejected'}>
          {r.isActive ? 'Active Operator' : 'Suspended'}
        </ClayBadge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => {
        if (r.role === 'PRIMARY_DAIRY_ADMIN') {
          return <span className="text-[11px] text-[#817A75] italic">Primary Admin</span>
        }
        return (
          <button
            onClick={() =>
              statusMutation.mutate({
                id: r.id,
                status: r.isActive ? 'SUSPENDED' : 'ACTIVE',
              })
            }
            disabled={statusMutation.isPending}
            className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1 ${
              r.isActive
                ? 'border-rose-200 text-rose-600 hover:bg-rose-50'
                : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
            }`}
            title={r.isActive ? 'Suspend Operator Access' : 'Reactivate Operator Access'}
          >
            <Power size={11} />
            {r.isActive ? 'Suspend' : 'Activate'}
          </button>
        )
      },
    },
  ]

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={28} className="text-[#FF6A00]" />
            <h1 className="text-2xl font-black text-[#211B18] tracking-tight">
              Staff & Operator Access
            </h1>
          </div>
          <p className="text-xs text-[#817A75] mt-1 font-medium">
            Authorized Dairy Operators, Kiosk Attendants, and Shift Supervisors with role-based access.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ClayButton
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            className="flex items-center gap-1.5"
          >
            <RotateCcw size={14} /> Refresh
          </ClayButton>
          <ClayButton
            variant="primary"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5"
          >
            <UserPlus size={16} /> Onboard Operator
          </ClayButton>
        </div>
      </div>

      {/* Success Banner */}
      {successBanner && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span className="font-semibold">{successBanner}</span>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-600 font-bold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Principle of Least Privilege Notice */}
      <div className="p-4 bg-white rounded-xl border border-[#F1E7E0] flex items-start gap-3 shadow-xs text-xs text-[#817A75] leading-relaxed">
        <Shield size={18} className="text-[#FF6A00] shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-[#211B18]">Least-Privilege Security Architecture: </span>
          The primary Dairy Admin account is provisioned by Super Admin. Collection operators onboarded here
          receive authentic login authority for the <strong>DFarm Collection App</strong> terminal, bound
          strictly to their assigned Dairy and collection center.
        </div>
      </div>

      {/* Table */}
      <ClayCard className="!p-0 overflow-hidden">
        <ClayTable
          columns={columns}
          data={staffList}
          keyExtractor={(s) => s.id}
          isLoading={isLoading}
          emptyMessage="No staff members registered for this Dairy."
        />
      </ClayCard>

      {/* Onboard Operator Modal */}
      <ClayModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Onboard Collection Operator"
        subtitle="Register an authorized operator for kiosk milk intake and shift sessions."
        maxWidth="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#817A75] uppercase tracking-wider mb-1">
              Operator Full Name *
            </label>
            <ClayInput
              type="text"
              placeholder="e.g. Suresh Ananda Patil"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#817A75] uppercase tracking-wider mb-1">
              Mobile Number (10 digits) *
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-xs font-bold text-[#817A75] pointer-events-none">
                +91
              </span>
              <ClayInput
                type="tel"
                placeholder="9876543210"
                value={formData.mobileNumber}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    mobileNumber: e.target.value.replace(/\D/g, '').slice(0, 10),
                  })
                }
                className="pl-12 font-mono"
                required
              />
            </div>
            <p className="text-[11px] text-[#817A75] mt-1">
              This mobile number will be used to log in via SMS OTP in the Collection App.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <ClaySelect
                label="Role Assignment *"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                options={[
                  { label: 'Collection Operator (Kiosk)', value: 'COLLECTION_OPERATOR' },
                  { label: 'Shift Supervisor', value: 'SHIFT_SUPERVISOR' },
                  { label: 'Center Manager', value: 'CENTER_MANAGER' },
                  { label: 'Accountant', value: 'ACCOUNTANT' },
                ]}
              />
            </div>

            <div>
              <ClaySelect
                label="Assigned Center *"
                value={formData.centerId}
                onChange={(e) => setFormData({ ...formData, centerId: e.target.value })}
                options={
                  centerList.length > 0
                    ? centerList.map((c) => ({
                        label: `${c.name} (${c.code})`,
                        value: c.id,
                      }))
                    : [{ label: 'Main Collection Center', value: '' }]
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#817A75] uppercase tracking-wider mb-1">
                Counter / Terminal Name
              </label>
              <ClayInput
                type="text"
                placeholder="Counter 1"
                value={formData.counterName}
                onChange={(e) => setFormData({ ...formData, counterName: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#817A75] uppercase tracking-wider mb-1">
                Email Address (Optional)
              </label>
              <ClayInput
                type="email"
                placeholder="operator@dairy.org"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-[#F1E7E0]">
            <ClayButton
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </ClayButton>
            <ClayButton
              type="submit"
              variant="primary"
              disabled={
                createMutation.isPending ||
                !formData.fullName.trim() ||
                formData.mobileNumber.length !== 10
              }
            >
              {createMutation.isPending ? 'Onboarding...' : 'Confirm & Onboard'}
            </ClayButton>
          </div>
        </form>
      </ClayModal>
    </div>
  )
}
