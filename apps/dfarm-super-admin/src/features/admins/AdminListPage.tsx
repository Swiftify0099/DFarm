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
import { ClayTabs } from '@/components/ui/ClayTabs'
import { TransferAdminModal } from './TransferAdminModal'
import { CreateOperatorModal } from './CreateOperatorModal'
import { useAuth } from '@/context/AuthContext'
import type { DairyAdminAccount, DairyTenant, SuperAdminUser } from '@/types'
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
  UserPlus,
  KeyRound,
  Shield,
} from 'lucide-react'

export const AdminListPage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<'dairy_admins' | 'platform_operators'>('dairy_admins')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [transferTarget, setTransferTarget] = useState<{
    dairy: DairyTenant | null
    admin: DairyAdminAccount | null
  }>({ dairy: null, admin: null })
  const [createOperatorModalOpen, setCreateOperatorModalOpen] = useState(false)

  // Fetch all Dairy admins
  const { data: admins = [], isLoading } = useQuery({
    queryKey: queryKeys.admins.list({ search, status: statusFilter }),
    queryFn: () => apiClient.getAdmins({ search, status: statusFilter }),
  })

  // Fetch Platform Staff / Operators
  const { data: platformUsers = [], isLoading: isUsersLoading } = useQuery({
    queryKey: queryKeys.auth.users,
    queryFn: () => apiClient.getPlatformUsers(),
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

  const operatorColumns: ColumnDef<SuperAdminUser>[] = [
    {
      key: 'operator',
      header: 'Platform Operator Identity',
      render: (op) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FF7B1A] to-[#FF6A00] text-white flex items-center justify-center font-bold text-xs shadow-sm">
            {op.fullName.charAt(0)}
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm text-[#211B18]">{op.fullName}</span>
            <span className="text-xs text-[#817A75] font-mono">{formatMobile(op.mobile)}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Corporate Email',
      render: (op) => (
        <span className="text-xs text-[#211B18] font-mono">{op.email}</span>
      ),
    },
    {
      key: 'role',
      header: 'Assigned RBAC Role',
      render: (op) => (
        <span className="px-2.5 py-1 rounded-lg bg-[#FAF6F3] border border-[#F1E7E0] text-xs font-bold text-[#FF6A00]">
          {op.roleTitle || 'Platform Operator'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (op) => <ClayBadge variant="active" label="PROVISIONED" />,
    },
    {
      key: 'lastLogin',
      header: 'Last Authentication',
      render: (op) => (
        <span className="text-xs text-[#817A75] font-mono">
          {op.lastLoginAt ? formatDate(op.lastLoginAt) : 'Never'}
        </span>
      ),
    },
  ]

  const filteredOperators = platformUsers.filter((op) => {
    const term = search.toLowerCase()
    return (
      op.fullName.toLowerCase().includes(term) ||
      op.email.toLowerCase().includes(term) ||
      op.mobile.includes(term) ||
      (op.roleTitle && op.roleTitle.toLowerCase().includes(term))
    )
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-[#211B18] tracking-tight">
              Admin & Operator Management
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FFE9DC] text-[#FF6A00] border border-[#FDBA74]/50">
              Identity Control
            </span>
          </div>
          <p className="text-xs text-[#817A75] mt-0.5">
            Manage primary tenant administrators and central platform operating staff.
          </p>
        </div>

        {activeTab === 'platform_operators' ? (
          <ClayButton
            variant="primary"
            leftIcon={<UserPlus className="w-4 h-4" />}
            onClick={() => setCreateOperatorModalOpen(true)}
          >
            Provision Operator
          </ClayButton>
        ) : (
          <ClayButton
            variant="ghost"
            leftIcon={<KeyRound className="w-4 h-4" />}
            onClick={() => navigate('/platform-access')}
          >
            Permission Matrix
          </ClayButton>
        )}
      </div>

      {/* Tabs */}
      <ClayTabs
        tabs={[
          {
            id: 'dairy_admins',
            label: 'Primary Dairy Admins',
            icon: <Building2 className="w-4 h-4" />,
            badge: admins.length,
          },
          {
            id: 'platform_operators',
            label: 'Platform Staff & Operators',
            icon: <Shield className="w-4 h-4" />,
            badge: platformUsers.length,
          },
        ]}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as any)}
      />

      {activeTab === 'dairy_admins' ? (
        <>
          {/* Filter and Search Bar for Dairy Admins */}
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
        </>
      ) : (
        <>
          {/* Platform Operators Search */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <ClayInput
                placeholder="Search platform operators by name, email, or mobile..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
          </div>

          <ClayTable
            columns={operatorColumns}
            data={filteredOperators}
            keyExtractor={(op) => op.id}
            isLoading={isUsersLoading}
            emptyMessage="No platform operators found."
            totalItems={filteredOperators.length}
          />

          <CreateOperatorModal
            isOpen={createOperatorModalOpen}
            onClose={() => setCreateOperatorModalOpen(false)}
          />
        </>
      )}
    </div>
  )
}
export default AdminListPage
