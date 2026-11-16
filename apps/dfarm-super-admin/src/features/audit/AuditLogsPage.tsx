import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { apiClient } from '@/api/client'
import { ClayCard } from '@/components/ui/ClayCard'
import { ClayTable, type ColumnDef } from '@/components/ui/ClayTable'
import { ClayInput } from '@/components/ui/ClayInput'
import { ClaySelect } from '@/components/ui/ClaySelect'
import { ClayModal } from '@/components/ui/ClayModal'
import { ClayButton } from '@/components/ui/ClayButton'
import type { AuditLogEntry } from '@/types'
import { formatDate } from '@/utils/formatters'
import {
  FileText,
  Search,
  ShieldCheck,
  Eye,
  Lock,
  Download,
} from 'lucide-react'

export const AuditLogsPage: React.FC = () => {
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [targetFilter, setTargetFilter] = useState('all')
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null)

  const { data: logs = [], isLoading } = useQuery({
    queryKey: queryKeys.audit.list({ search, action: actionFilter, targetType: targetFilter }),
    queryFn: () =>
      apiClient.getAuditLogs({
        search,
        action: actionFilter as any,
        targetType: targetFilter as any,
      }),
  })

  const exportAuditJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2))
    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute('href', dataStr)
    downloadAnchor.setAttribute('download', `dfarm_platform_audit_${Date.now()}.json`)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
  }

  const columns: ColumnDef<AuditLogEntry>[] = [
    {
      key: 'timestamp',
      header: 'Timestamp (IST)',
      render: (l) => (
        <span className="font-mono text-xs text-[#211B18]">{formatDate(l.timestamp)}</span>
      ),
    },
    {
      key: 'action',
      header: 'Action & Target',
      render: (l) => (
        <div className="flex flex-col">
          <span className="font-bold text-xs text-[#211B18]">{l.actionDescription}</span>
          <span className="font-mono text-[11px] text-[#817A75]">{l.action}</span>
        </div>
      ),
    },
    {
      key: 'actor',
      header: 'Operator Identity',
      render: (l) => (
        <div className="flex flex-col text-xs">
          <span className="font-bold text-[#211B18]">{l.actorName}</span>
          <span className="text-[#817A75] font-mono">{l.actorMobile}</span>
        </div>
      ),
    },
    {
      key: 'dairy',
      header: 'Associated Tenant',
      render: (l) => (
        <span className="text-xs font-medium text-[#211B18]">
          {l.dairyName || 'Platform Core'}
        </span>
      ),
    },
    {
      key: 'outcome',
      header: 'Outcome',
      render: (l) => (
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
            l.outcome === 'success'
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-rose-100 text-rose-800'
          }`}
        >
          {l.outcome.toUpperCase()}
        </span>
      ),
    },
    {
      key: 'ip',
      header: 'Client Origin',
      render: (l) => (
        <span className="font-mono text-xs text-[#817A75]">{l.ipAddress}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Inspect',
      align: 'right',
      render: (l) => (
        <button
          onClick={() => setSelectedEntry(l)}
          className="p-1.5 rounded-lg border border-[#F1E7E0] hover:bg-[#FFE9DC] text-[#817A75] hover:text-[#FF6A00] transition-colors cursor-pointer"
          title="Inspect Event Payload"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#211B18] tracking-tight">
            Immutable Audit Trail Ledger
          </h1>
          <p className="text-xs text-[#817A75] mt-0.5">
            Cryptographically sealed, append-only log of all privileged administrative events and tenant lifecycle transitions.
          </p>
        </div>

        <ClayButton
          variant="secondary"
          size="sm"
          onClick={exportAuditJson}
          leftIcon={<Download className="w-4 h-4" />}
        >
          Export Ledger (JSON)
        </ClayButton>
      </div>

      {/* Security Compliance Banner */}
      <div className="p-3.5 rounded-2xl bg-[#FFF5EE] border border-[#FFE9DC] flex items-center justify-between text-xs text-[#817A75]">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#FF6A00]" />
          <span>
            <strong>Append-Only Invariant:</strong> Platform audit records are immutable. No administrator or automated routine possesses authorization to alter or delete history.
          </span>
        </div>
        <span className="font-mono text-[11px] text-[#211B18] font-bold">
          {logs.length} Logged Events
        </span>
      </div>

      {/* Filter Bar */}
      <ClayCard variant="flat" padding="sm" className="flex flex-col sm:flex-row items-center gap-3">
        <div className="flex-1 w-full">
          <ClayInput
            placeholder="Search audit events by operator name, action, or dairy..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <ClaySelect
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full sm:w-48"
          >
            <option value="all">All Actions</option>
            <option value="dairy.created">Dairy Created</option>
            <option value="dairy.suspended">Dairy Suspended</option>
            <option value="dairy.reactivated">Dairy Reactivated</option>
            <option value="admin.provisioned">Admin Provisioned</option>
            <option value="admin.transferred">Admin Transferred</option>
            <option value="support.access_granted">Support Access</option>
            <option value="auth.login_success">Auth Login</option>
          </ClaySelect>

          <ClaySelect
            value={targetFilter}
            onChange={(e) => setTargetFilter(e.target.value)}
            className="w-full sm:w-40"
          >
            <option value="all">All Targets</option>
            <option value="dairy">Dairy Tenants</option>
            <option value="admin">Admin Accounts</option>
            <option value="platform">Platform Core</option>
            <option value="support_session">Support Sessions</option>
          </ClaySelect>
        </div>
      </ClayCard>

      {/* Audit Table */}
      <ClayTable
        columns={columns}
        data={logs}
        keyExtractor={(l) => l.id}
        isLoading={isLoading}
        onRowClick={(l) => setSelectedEntry(l)}
        emptyMessage="No audit log entries found matching criteria."
        totalItems={logs.length}
      />

      {/* Inspect Event Payload Modal */}
      <ClayModal
        isOpen={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
        title="Audit Event Cryptographic Record"
        subtitle={`Event ID: ${selectedEntry?.id}`}
        maxWidth="lg"
      >
        {selectedEntry && (
          <div className="space-y-4 text-xs">
            <ClayCard variant="subtle" padding="sm" className="space-y-2">
              <div className="flex justify-between border-b border-[#F1E7E0] pb-1.5">
                <span className="text-[#817A75]">Action:</span>
                <strong className="font-mono text-[#211B18]">{selectedEntry.action}</strong>
              </div>
              <div className="flex justify-between border-b border-[#F1E7E0] pb-1.5">
                <span className="text-[#817A75]">Operator:</span>
                <strong className="text-[#211B18]">
                  {selectedEntry.actorName} (+91 {selectedEntry.actorMobile})
                </strong>
              </div>
              <div className="flex justify-between border-b border-[#F1E7E0] pb-1.5">
                <span className="text-[#817A75]">Target Entity:</span>
                <strong className="text-[#211B18]">
                  {selectedEntry.targetType.toUpperCase()} ({selectedEntry.targetId})
                </strong>
              </div>
              <div className="flex justify-between border-b border-[#F1E7E0] pb-1.5">
                <span className="text-[#817A75]">Timestamp (UTC):</span>
                <strong className="font-mono text-[#211B18]">{selectedEntry.timestamp}</strong>
              </div>
              <div className="flex justify-between border-b border-[#F1E7E0] pb-1.5">
                <span className="text-[#817A75]">Client IP:</span>
                <strong className="font-mono text-[#211B18]">{selectedEntry.ipAddress}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#817A75]">User Agent:</span>
                <span className="font-mono text-[11px] text-[#817A75] max-w-xs truncate">
                  {selectedEntry.userAgent}
                </span>
              </div>
            </ClayCard>

            {selectedEntry.reason && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                <span className="font-bold text-amber-950 block mb-0.5">Recorded Reason:</span>
                <p className="text-amber-900 italic">"{selectedEntry.reason}"</p>
              </div>
            )}

            {selectedEntry.metadata && (
              <div>
                <span className="font-bold text-[#817A75] block mb-1">Extended Payload Metadata:</span>
                <pre className="p-3 bg-[#FAF6F3] rounded-xl font-mono text-[11px] border border-[#F1E7E0] overflow-x-auto">
                  {JSON.stringify(selectedEntry.metadata, null, 2)}
                </pre>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <ClayButton variant="outline" onClick={() => setSelectedEntry(null)}>
                Close Inspector
              </ClayButton>
            </div>
          </div>
        )}
      </ClayModal>
    </div>
  )
}
