import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import type { AuditLogEntry } from '@/types'
import {
  ClayCard,
  ClayBadge,
  ClayInput,
  ClaySelect,
  ClayTable,
  Column,
} from '@/components/ui'
import { History, Shield, Search, User, Clock, FileText } from 'lucide-react'

export const AuditLogViewer: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [actionFilter, setActionFilter] = useState('ALL')

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['auditLogs'],
    queryFn: () => api.audit.getAll(),
  })

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.actorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entityId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.reason && log.reason.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesAction = actionFilter === 'ALL' || log.action === actionFilter

    return matchesSearch && matchesAction
  })

  const columns: Column<AuditLogEntry>[] = [
    {
      key: 'timestamp',
      header: 'Timestamp',
      render: (r) => (
        <div className="text-xs">
          <p className="font-semibold text-[#211B18]">{new Date(r.timestamp).toLocaleDateString()}</p>
          <p className="text-[10px] text-[#817A75] font-mono">
            {new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>
      ),
    },
    {
      key: 'actor',
      header: 'Operator / Role',
      render: (r) => (
        <div className="text-xs">
          <p className="font-bold text-[#211B18]">{r.actorName}</p>
          <p className="text-[10px] text-[#817A75] font-semibold">{r.actorRole.replace(/_/g, ' ')}</p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action Taken',
      render: (r) => (
        <ClayBadge
          variant={
            r.action.includes('APPROVED') || r.action.includes('ACTIVATED')
              ? 'approved'
              : r.action.includes('REJECTED') || r.action.includes('REVOKED') || r.action.includes('DELETED')
              ? 'rejected'
              : 'cow'
          }
        >
          {r.action}
        </ClayBadge>
      ),
    },
    {
      key: 'details',
      header: 'Audit Description & Target Entity',
      render: (r) => (
        <div className="max-w-md">
          <p className="text-xs font-semibold text-[#211B18]">{r.details}</p>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#817A75]">
            <span className="font-mono bg-[#FFF5EE] px-1.5 py-0.2 rounded border border-[#FFE9DC]">
              {r.targetEntity}: {r.entityId}
            </span>
            {r.reason && <span className="font-medium text-amber-900">• Reason: {r.reason}</span>}
          </div>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <History size={28} className="text-[#FF6A00]" />
          <h1 className="text-2xl font-black text-[#211B18] tracking-tight">Audit Trail & Governance Log</h1>
        </div>
        <p className="text-xs text-[#817A75] mt-1 font-medium">
          Immutable audit record of administrative approvals, biometric template revocations, ledger corrections, and financial settlements.
        </p>
      </div>

      {/* Security notice */}
      <div className="p-4 bg-white rounded-xl border border-[#F1E7E0] flex items-start gap-3 shadow-xs text-xs text-[#817A75] leading-relaxed">
        <Shield size={18} className="text-[#FF6A00] shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-[#211B18]">Zero Biometric Leakage in Audit Logs: </span>
          In compliance with biometrics protection standards, audit logs never record raw face images or mathematical
          embeddings. Only action timestamps, operator IDs, entity keys, and authorized reasons are retained.
        </div>
      </div>

      {/* Filter and Search */}
      <ClayCard className="!p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ClayInput
            placeholder="Search by operator, entity ID, description, or reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search size={16} />}
          />

          <ClaySelect
            options={[
              { label: 'All Audit Actions', value: 'ALL' },
              { label: 'CUSTOMER_REGISTRATION_APPROVED', value: 'CUSTOMER_REGISTRATION_APPROVED' },
              { label: 'CUSTOMER_REGISTRATION_REJECTED', value: 'CUSTOMER_REGISTRATION_REJECTED' },
              { label: 'COLLECTION_RECORD_ADJUSTED', value: 'COLLECTION_RECORD_ADJUSTED' },
              { label: 'RATE_CHART_ACTIVATED', value: 'RATE_CHART_ACTIVATED' },
              { label: 'LEDGER_BALANCE_ADJUSTED', value: 'LEDGER_BALANCE_ADJUSTED' },
              { label: 'BILL_GENERATED', value: 'BILL_GENERATED' },
              { label: 'PAYMENT_RECORDED', value: 'PAYMENT_RECORDED' },
            ]}
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          />
        </div>
      </ClayCard>

      {/* Logs Table */}
      <ClayCard className="!p-0 overflow-hidden">
        <ClayTable
          columns={columns}
          data={filteredLogs}
          keyExtractor={(l) => l.id}
          isLoading={isLoading}
          emptyMessage="No audit logs recorded"
        />
      </ClayCard>
    </div>
  )
}
