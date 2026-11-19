import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { apiClient } from '@/api/client'
import { ClayCard } from '@/components/ui/ClayCard'
import { ClayTable, type ColumnDef } from '@/components/ui/ClayTable'
import { ClayBadge } from '@/components/ui/ClayBadge'
import { ClayButton } from '@/components/ui/ClayButton'
import { ClayInput } from '@/components/ui/ClayInput'
import { ClaySelect } from '@/components/ui/ClaySelect'
import { CreateDairyModal } from './CreateDairyModal'
import { SuspendDairyModal } from './SuspendDairyModal'
import { ReactivateDairyModal } from './ReactivateDairyModal'
import type { DairyTenant } from '@/types'
import { formatDateOnly, formatMobile } from '@/utils/formatters'
import {
  Building2,
  Plus,
  Search,
  Filter,
  Eye,
  XCircle,
  CheckCircle2,
  Cpu,
  Activity,
} from 'lucide-react'

export const DairyListPage: React.FC = () => {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [stateFilter, setStateFilter] = useState('all')

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [selectedSuspendDairy, setSelectedSuspendDairy] = useState<DairyTenant | null>(null)
  const [selectedReactivateDairy, setSelectedReactivateDairy] = useState<DairyTenant | null>(null)

  const {
    data: dairies = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: queryKeys.dairies.list({ search, status: statusFilter, state: stateFilter }),
    queryFn: () =>
      apiClient.getDairies({
        search,
        status: statusFilter,
        state: stateFilter,
      }),
  })

  // Extract distinct states
  const statesList = Array.from(new Set(dairies.map((d) => d.location.state))).filter(Boolean)

  const columns: ColumnDef<DairyTenant>[] = [
    {
      key: 'name',
      header: 'Dairy Business & Tenant Code',
      render: (d) => (
        <div className="flex flex-col">
          <span className="font-bold text-[#211B18] hover:text-[#FF6A00] transition-colors">
            {d.name}
          </span>
          <span className="font-mono text-xs text-[#817A75]">{d.code}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Tenant Status',
      render: (d) => (
        <div className="flex flex-col gap-1 items-start">
          <ClayBadge variant={d.status} />
          {d.provisioningStatus && d.provisioningStatus !== 'ACTIVE' && (
            <span
              className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded ${
                d.provisioningStatus === 'FAILED'
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              DB: {d.provisioningStatus}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'location',
      header: 'Location',
      render: (d) => (
        <div className="flex flex-col text-xs">
          <span className="text-[#211B18] font-medium">{d.location.district}</span>
          <span className="text-[#817A75]">{d.location.state}</span>
        </div>
      ),
    },
    {
      key: 'admin',
      header: 'Primary Dairy Admin',
      render: (d) => (
        <div className="flex flex-col text-xs">
          <span className="font-bold text-[#211B18]">{d.primaryAdminName}</span>
          <span className="text-[#817A75]">{formatMobile(d.primaryAdminMobile)}</span>
        </div>
      ),
    },
    {
      key: 'hardware',
      header: 'Hardware Units',
      render: (d) => (
        <div className="flex items-center gap-2 text-xs">
          <Cpu className="w-3.5 h-3.5 text-[#817A75]" />
          <span>
            <strong>{d.deviceSummary?.onlineDevicesCount || 0}</strong> /{' '}
            {d.deviceSummary?.registeredDevicesCount || 0} Online
          </span>
        </div>
      ),
    },
    {
      key: 'sync',
      header: 'Sync Health',
      render: (d) => (
        <div className="flex items-center gap-1.5">
          <ClayBadge variant={d.syncHealth?.status || 'healthy'} />
        </div>
      ),
    },
    {
      key: 'created',
      header: 'Registered',
      render: (d) => (
        <span className="text-xs text-[#817A75]">{formatDateOnly(d.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (d) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => navigate(`/dairies/${d.id}`)}
            className="p-1.5 rounded-lg border border-[#F1E7E0] hover:bg-[#FFE9DC] text-[#211B18] hover:text-[#FF6A00] transition-colors"
            title="View Details"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          {d.provisioningStatus === 'FAILED' && (
            <button
              onClick={async () => {
                try {
                  await apiClient.retryTenantProvisioning(d.id)
                  refetch()
                } catch {}
              }}
              className="p-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
              title="Retry Tenant Database Provisioning"
            >
              <Activity className="w-3.5 h-3.5" />
            </button>
          )}

          {d.status === 'suspended' ? (
            <button
              onClick={() => setSelectedReactivateDairy(d)}
              className="p-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
              title="Reactivate Tenant"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => setSelectedSuspendDairy(d)}
              className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
              title="Suspend Tenant"
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
          )}
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
            Dairy Tenant Directory
          </h1>
          <p className="text-xs text-[#817A75] mt-0.5">
            Manage multi-tenant dairy businesses, operational readiness, and primary administrator accounts.
          </p>
        </div>

        <ClayButton
          variant="primary"
          onClick={() => setCreateModalOpen(true)}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          Create New Dairy
        </ClayButton>
      </div>

      {/* Filter and Search Bar */}
      <ClayCard variant="flat" padding="sm" className="flex flex-col sm:flex-row items-center gap-3">
        <div className="flex-1 w-full">
          <ClayInput
            placeholder="Search by dairy name, code, district, or primary admin..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <ClaySelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-40"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="draft_onboarding">Draft / Onboarding</option>
            <option value="suspended">Suspended Only</option>
          </ClaySelect>

          <ClaySelect
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="w-full sm:w-40"
          >
            <option value="all">All States</option>
            {statesList.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </ClaySelect>
        </div>
      </ClayCard>

      {/* Dairies Data Table */}
      <ClayTable
        columns={columns}
        data={dairies}
        keyExtractor={(d) => d.id}
        isLoading={isLoading}
        onRowClick={(d) => navigate(`/dairies/${d.id}`)}
        emptyMessage="No dairy tenants found matching the specified filters."
        totalItems={dairies.length}
      />

      {/* Modals */}
      <CreateDairyModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => refetch()}
      />

      <SuspendDairyModal
        isOpen={!!selectedSuspendDairy}
        onClose={() => setSelectedSuspendDairy(null)}
        dairy={selectedSuspendDairy}
        onSuccess={() => refetch()}
      />

      <ReactivateDairyModal
        isOpen={!!selectedReactivateDairy}
        onClose={() => setSelectedReactivateDairy(null)}
        dairy={selectedReactivateDairy}
        onSuccess={() => refetch()}
      />
    </div>
  )
}
