import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { apiClient } from '@/api/client'
import { ClayCard } from '@/components/ui/ClayCard'
import { ClayBadge } from '@/components/ui/ClayBadge'
import { ClayButton } from '@/components/ui/ClayButton'
import { ClayModal } from '@/components/ui/ClayModal'
import { ClayTextarea } from '@/components/ui/ClayTextarea'
import { ClaySelect } from '@/components/ui/ClaySelect'
import { useAuth } from '@/context/AuthContext'
import type { PlatformAlert } from '@/types'
import { formatDate } from '@/utils/formatters'
import {
  BellRing,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  HardDrive,
  Building2,
  Info,
} from 'lucide-react'

export const AlertsPage: React.FC = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [severityFilter, setSeverityFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [resolveTarget, setResolveTarget] = useState<PlatformAlert | null>(null)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Fetch alerts
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: queryKeys.alerts.list({ severity: severityFilter, status: statusFilter }),
    queryFn: () => apiClient.getAlerts({ severity: severityFilter, status: statusFilter }),
  })

  // Acknowledge mutation
  const ackMutation = useMutation({
    mutationFn: (alertId: string) => {
      if (!user) throw new Error('Unauthenticated')
      return apiClient.acknowledgeAlert({ alertId }, user)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all })
    },
  })

  // Resolve mutation
  const resolveMutation = useMutation({
    mutationFn: () => {
      if (!resolveTarget || !user) throw new Error('Incomplete data')
      return apiClient.resolveAlert(
        {
          alertId: resolveTarget.id,
          resolutionNotes,
        },
        user
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.metrics })
      setResolveTarget(null)
      setResolutionNotes('')
      setError(null)
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to resolve alert')
    },
  })

  const handleResolveSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!resolutionNotes || resolutionNotes.trim().length < 5) {
      setError('Detailed resolution notes (minimum 5 characters) are required.')
      return
    }
    setError(null)
    resolveMutation.mutate()
  }

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'hardware':
        return <HardDrive className="w-4 h-4 text-purple-600" />
      case 'sync':
        return <AlertTriangle className="w-4 h-4 text-amber-600" />
      case 'onboarding':
      case 'lifecycle':
        return <Building2 className="w-4 h-4 text-blue-600" />
      case 'security':
        return <ShieldAlert className="w-4 h-4 text-rose-600" />
      default:
        return <Info className="w-4 h-4 text-[#817A75]" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#211B18] tracking-tight">
            Platform Operational Alerts
          </h1>
          <p className="text-xs text-[#817A75] mt-0.5">
            Real-time critical events across tenant lifecycles, synchronization latency, and hardware integrity.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <ClayCard variant="flat" padding="sm" className="flex flex-wrap items-center gap-3">
        <ClaySelect
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="w-44"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical Only</option>
          <option value="warning">Warning Only</option>
          <option value="info">Info Only</option>
        </ClaySelect>

        <ClaySelect
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-44"
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
        </ClaySelect>
      </ClayCard>

      {/* Alerts Stream */}
      {isLoading ? (
        <div className="py-24 text-center">
          <div className="w-10 h-10 border-3 border-[#FF6A00] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-semibold text-[#817A75]">Loading operational alerts...</p>
        </div>
      ) : alerts.length === 0 ? (
        <ClayCard variant="default" className="text-center py-12">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-[#211B18]">No Alerts Matching Criteria</h3>
          <p className="text-xs text-[#817A75] mt-1">All monitored systems are within expected operational parameters.</p>
        </ClayCard>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <ClayCard
              key={alert.id}
              variant={alert.severity === 'critical' ? 'peach' : 'default'}
              padding="md"
              className="space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#F1E7E0] pb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-xl bg-white border border-[#F1E7E0] flex items-center justify-center shrink-0">
                    {getCategoryIcon(alert.category)}
                  </div>
                  <span className="font-bold text-sm text-[#211B18]">{alert.title}</span>
                  <ClayBadge variant={alert.severity} />
                  <ClayBadge variant={alert.status} />
                </div>

                <span className="text-xs font-mono text-[#817A75]">
                  {formatDate(alert.createdAt)}
                </span>
              </div>

              <p className="text-xs text-[#211B18] leading-relaxed">{alert.message}</p>

              {alert.dairyName && (
                <div className="inline-block px-2.5 py-1 rounded-lg bg-[#FAF6F3] border border-[#F1E7E0] text-[11px] text-[#817A75]">
                  Related Dairy: <strong className="text-[#211B18]">{alert.dairyName}</strong>
                </div>
              )}

              {alert.resolutionNotes && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                  <span className="font-bold block mb-0.5">Resolution Notes:</span>
                  <p>{alert.resolutionNotes}</p>
                  <span className="text-[10px] text-emerald-700 mt-1 block">
                    Resolved by {alert.resolvedBy} at {formatDate(alert.resolvedAt)}
                  </span>
                </div>
              )}

              {/* Action Buttons for Open/Acknowledged Alerts */}
              {alert.status !== 'resolved' && (
                <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#F1E7E0]">
                  {alert.status === 'open' && (
                    <ClayButton
                      variant="outline"
                      size="sm"
                      isLoading={ackMutation.isPending}
                      onClick={() => ackMutation.mutate(alert.id)}
                    >
                      Acknowledge
                    </ClayButton>
                  )}

                  <ClayButton
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setResolveTarget(alert)
                      setResolutionNotes('')
                      setError(null)
                    }}
                    leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                  >
                    Resolve Alert
                  </ClayButton>
                </div>
              )}
            </ClayCard>
          ))}
        </div>
      )}

      {/* Resolve Alert Modal */}
      <ClayModal
        isOpen={!!resolveTarget}
        onClose={() => setResolveTarget(null)}
        title="Resolve Platform Alert"
        subtitle={resolveTarget?.title}
        maxWidth="md"
      >
        <form onSubmit={handleResolveSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {error}
            </div>
          )}

          <ClayTextarea
            label="Mandatory Resolution Notes"
            placeholder="e.g. Technician replaced backup battery on milk tester; calibration verified."
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            rows={3}
            helperText="Permanent audit entry explaining root cause resolution."
            required
            autoFocus
          />

          <div className="pt-3 flex items-center justify-end gap-3">
            <ClayButton type="button" variant="outline" onClick={() => setResolveTarget(null)}>
              Cancel
            </ClayButton>
            <ClayButton
              type="submit"
              variant="primary"
              isLoading={resolveMutation.isPending}
            >
              Confirm Resolution
            </ClayButton>
          </div>
        </form>
      </ClayModal>
    </div>
  )
}
