import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import type { StaffMember } from '@/types'
import {
  ClayCard,
  ClayBadge,
  ClayTable,
  Column,
} from '@/components/ui'
import { ShieldCheck, Shield, User, Lock, Smartphone } from 'lucide-react'

export const StaffManagement: React.FC = () => {
  const { data: staffList = [], isLoading } = useQuery({
    queryKey: ['staffMembers'],
    queryFn: () => api.staff.getAll(),
  })

  const columns: Column<StaffMember>[] = [
    {
      key: 'fullName',
      header: 'Staff Member / Phone',
      render: (r) => (
        <div>
          <span className="font-bold text-sm text-[#211B18]">{r.fullName}</span>
          <p className="text-xs text-[#817A75] flex items-center gap-1 mt-0.5">
            <Smartphone size={12} /> +91 {r.mobileNumber}
          </p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Assigned Role',
      render: (r) => (
        <ClayBadge variant={r.role === 'PRIMARY_DAIRY_ADMIN' ? 'approved' : 'neutral'}>
          {r.role.replace(/_/g, ' ')}
        </ClayBadge>
      ),
    },
    {
      key: 'permissions',
      header: 'Configurable Permission Matrix',
      render: (r) => (
        <div className="flex flex-wrap gap-1 max-w-md">
          {r.permissions.slice(0, 4).map((p) => (
            <span
              key={p}
              className="text-[10px] font-mono font-bold bg-[#FFF5EE] border border-[#FFE9DC] text-[#FF6A00] px-1.5 py-0.5 rounded"
            >
              {p}
            </span>
          ))}
          {r.permissions.length > 4 && (
            <span className="text-[10px] text-[#817A75] font-semibold">
              +{r.permissions.length - 4} more
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
  ]

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck size={28} className="text-[#FF6A00]" />
          <h1 className="text-2xl font-black text-[#211B18] tracking-tight">Staff & Operator Access</h1>
        </div>
        <p className="text-xs text-[#817A75] mt-1 font-medium">
          Backend-issued permission architecture adhering strictly to the principle of least privilege.
        </p>
      </div>

      {/* Principle of Least Privilege Notice */}
      <div className="p-4 bg-white rounded-xl border border-[#F1E7E0] flex items-start gap-3 shadow-xs text-xs text-[#817A75] leading-relaxed">
        <Shield size={18} className="text-[#FF6A00] shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-[#211B18]">Least-Privilege Security Architecture: </span>
          The primary Dairy Admin account is provisioned by Super Admin (One-Primary-Admin-Per-Dairy). Additional
          operational accounts (Shift Supervisors, Collection Operators, Accountants) receive granular, backend-issued
          permissions. Frontend UI guards reflect backend permissions, which remain the single security boundary.
        </div>
      </div>

      {/* Table */}
      <ClayCard className="!p-0 overflow-hidden">
        <ClayTable
          columns={columns}
          data={staffList}
          keyExtractor={(s) => s.id}
          isLoading={isLoading}
          emptyMessage="No staff members registered"
        />
      </ClayCard>
    </div>
  )
}
