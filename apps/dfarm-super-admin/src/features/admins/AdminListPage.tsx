import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { apiClient } from '@/api/client'
import { ClayCard } from '@/components/ui/ClayCard'
import { ClayTable, type ColumnDef } from '@/components/ui/ClayTable'
import { ClayBadge } from '@/components/ui/ClayBadge'
import { ClayButton } from '@/components/ui/ClayButton'
import { ClayInput } from '@/components/ui/ClayInput'
import { ClaySelect } from '@/components/ui/ClaySelect'
import { TransferAdminModal } from './TransferAdminModal'
import { useAuth } from '@/context/AuthContext'
import type { DairyAdminAccount, DairyTenant } from '@/types'
import { formatDate, formatMobile } from '@/utils/formatters'
import {
  Users2,
  Search,
  Send,
  ArrowRightLeft,
  ShieldCheck,
  Building2,
  CheckCircle2,
  Clock,
  Trash2,
} from 'lucide-react'

export const AdminListPage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [transferTarget, setTransferTarget] = useState<{
    dairy: DairyTenant | null
    admin: DairyAdminAccount | null
  }>({ dairy: null, admin: null })

  // Fetch all admins
  const { data: admins = [], isLoading } = useQuery({
    queryKey: queryKeys.admins.list({ search, status: statusFilter }),
    queryFn: () => apiClient.getAdmins({ search, status: statusFilter }),
  })

  // Fetch dairies for modal linkage
  const { data: dairies = [] } = useQuery({
    queryKey: queryKeys.dairies.all,
    queryFn: () => apiClient.getDairies(),
  })

  // Resend invitation mutation
  const resendMutation = useMutation({
    mutationFn: (adminId: string) => {
      if (!user) throw new Error('Unauthenticated')
      return apiClient.resendInvitation({ adminId }, user)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admins.all })
    },
  })

  // Delete admin and related records mutation
  const deleteMutation = useMutation({
    mutationFn: (mobile: string) => apiClient.purgeAdminAndRelatedRecords(mobile),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admins.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.dairies.all })
    },
  })

  const handleDeleteAdmin = (admin: DairyAdminAccount) => {
    if (
      window.confirm(
        `Are you sure you want to permanently remove Dairy Admin "${admin.fullName}" (${admin.mobile}) and all associated records? This cannot be undone.`
      )
    ) {
      deleteMutation.mutate(admin.mobile)
    }
  }

  const handleStartTransfer = (admin: DairyAdminAccount) => {
    const dairy = dairies.find((d) => d.id === admin.dairyId) || null
    setTransferTarget({ dairy, admin })
  }

  const columns: ColumnDef<DairyAdminAccount>[] = [
    {
      key: 'fullName',
      header: 'Primary Dairy Admin',
      render: (a) => (
        <div className="flex flex-col">
          <span className="font-bold text-[#211B18]">{a.fullName}</span>
          <span className="text-xs text-[#817A75]">{formatMobile(a.mobile)}</span>
        </div>
      ),
    },
    {
      key: 'dairy',
      header: 'Assigned Dairy Business',
      render: (a) => (
        <button
          onClick={() => navigate(`/dairies/${a.dairyId}`)}
          className="flex flex-col text-left hover:text-[#FF6A00] transition-colors"
        >
          <span className="font-semibold text-xs text-[#211B18]">{a.dairyName}</span>
          <span className="font-mono text-[11px] text-[#817A75]">{a.dairyCode}</span>
        </button>
      ),
    },
    {
      key: 'verificationStatus',
      header: 'Mobile OTP Verification',
      render: (a) => <ClayBadge variant={a.verificationStatus} />,
    },
    {
      key: 'status',
      header: 'Account State',
      render: (a) => <ClayBadge variant={a.status} />,
    },
    {
      key: 'lastLogin',
      header: 'Last Active Session',
      render: (a) => (
        <span className="text-xs text-[#817A75]">{formatDate(a.lastLoginAt)}</span>
      ),
    },
    {
      key: 'invitation',
      header: 'Invitation Sent',
      render: (a) => (
        <div className="flex flex-col text-xs text-[#817A75]">
          <span>{formatDate(a.invitationSentAt)}</span>
          <span className="text-[10px] uppercase font-bold text-[#FF6A00]">
            Channel: {a.invitationChannel}
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (a) => (
        <div className="flex items-center justify-end gap-2">
          {a.verificationStatus === 'unverified' && (
            <ClayButton
              variant="outline"
              size="sm"
              isLoading={resendMutation.isPending}
              onClick={() => resendMutation.mutate(a.id)}
              leftIcon={<Send className="w-3.5 h-3.5" />}
            >
              Resend Code
            </ClayButton>
          )}

          <ClayButton
            variant="secondary"
            size="sm"
            onClick={() => handleStartTransfer(a)}
            leftIcon={<ArrowRightLeft className="w-3.5 h-3.5" />}
          >
            Transfer
          </ClayButton>

          <ClayButton
            variant="danger"
            size="sm"
            isLoading={deleteMutation.isPending}
            onClick={() => handleDeleteAdmin(a)}
            leftIcon={<Trash2 className="w-3.5 h-3.5" />}
          >
            Delete
          </ClayButton>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#211B18] tracking-tight">
            Primary Dairy Admin Accounts
          </h1>
          <p className="text-xs text-[#817A75] mt-0.5">
            Strict Multi-Tenant Rule: Exactly one root administrator is provisioned per dairy business.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <ClayCard variant="flat" padding="sm" className="flex flex-col sm:flex-row items-center gap-3">
        <div className="flex-1 w-full">
          <ClayInput
            placeholder="Search by admin name, mobile, dairy name, or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>

        <ClaySelect
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-48"
        >
          <option value="all">All States</option>
          <option value="active">Active Only</option>
          <option value="pending_verification">Pending Verification</option>
          <option value="disabled">Disabled Only</option>
        </ClaySelect>
      </ClayCard>

      {/* Admin Accounts Table */}
      <ClayTable
        columns={columns}
        data={admins}
        keyExtractor={(a) => a.id}
        isLoading={isLoading}
        emptyMessage="No dairy administrators match the current search filters."
        totalItems={admins.length}
      />

      {/* Transfer Admin Modal */}
      <TransferAdminModal
        isOpen={!!transferTarget.admin}
        onClose={() => setTransferTarget({ dairy: null, admin: null })}
        dairy={transferTarget.dairy}
        currentAdmin={transferTarget.admin}
      />
    </div>
  )
}
