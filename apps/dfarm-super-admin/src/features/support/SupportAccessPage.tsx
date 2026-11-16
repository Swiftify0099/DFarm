import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { apiClient } from '@/api/client'
import { ClayCard } from '@/components/ui/ClayCard'
import { ClayButton } from '@/components/ui/ClayButton'
import { ClayInput } from '@/components/ui/ClayInput'
import { ClaySelect } from '@/components/ui/ClaySelect'
import { ClayTextarea } from '@/components/ui/ClayTextarea'
import { ClayBadge } from '@/components/ui/ClayBadge'
import { useAuth } from '@/context/AuthContext'
import type { SupportScope } from '@/types'
import { formatDate } from '@/utils/formatters'
import {
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Building2,
  XCircle,
  FileText,
} from 'lucide-react'

export const SupportAccessPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const initialDairyId = searchParams.get('dairyId') || ''
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Form states
  const [selectedDairyId, setSelectedDairyId] = useState(initialDairyId)
  const [justificationReason, setJustificationReason] = useState('')
  const [supportTicketRef, setSupportTicketRef] = useState('')
  const [durationMinutes, setDurationMinutes] = useState<15 | 30 | 60>(30)
  const [authorizedScope, setAuthorizedScope] = useState<SupportScope>('read_only_diagnostics')
  const [error, setError] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState<string>('')

  // Fetch active session
  const { data: activeSession, isLoading: isActiveLoading } = useQuery({
    queryKey: queryKeys.support.active,
    queryFn: () => apiClient.getActiveSupportSession(),
    refetchInterval: 5000,
  })

  // Fetch all sessions history
  const { data: sessionHistory = [] } = useQuery({
    queryKey: queryKeys.support.history,
    queryFn: () => apiClient.getAllSupportSessions(),
  })

  // Fetch dairies for selector
  const { data: dairies = [] } = useQuery({
    queryKey: queryKeys.dairies.all,
    queryFn: () => apiClient.getDairies(),
  })

  // Timer countdown for active session
  useEffect(() => {
    if (!activeSession) return

    const tick = () => {
      const remainingMs = new Date(activeSession.expiresAt).getTime() - Date.now()
      if (remainingMs <= 0) {
        setTimeLeft('00:00')
        queryClient.invalidateQueries({ queryKey: queryKeys.support.active })
        return
      }
      const mins = Math.floor(remainingMs / 60000)
      const secs = Math.floor((remainingMs % 60000) / 1000)
      setTimeLeft(`${mins}:${secs < 10 ? '0' : ''}${secs}`)
    }

    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [activeSession, queryClient])

  // Request session mutation
  const requestMutation = useMutation({
    mutationFn: () => {
      if (!user) throw new Error('Unauthenticated')
      return apiClient.requestSupportSession(
        {
          dairyId: selectedDairyId,
          justificationReason,
          supportTicketRef,
          durationMinutes,
          authorizedScope,
        },
        user
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.support.active })
      queryClient.invalidateQueries({ queryKey: queryKeys.support.history })
      queryClient.invalidateQueries({ queryKey: queryKeys.audit.all })
      setJustificationReason('')
      setSupportTicketRef('')
      setError(null)
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to request support session')
    },
  })

  // Revoke session mutation
  const revokeMutation = useMutation({
    mutationFn: (sessionId: string) => {
      if (!user) throw new Error('Unauthenticated')
      return apiClient.revokeSupportSession(
        {
          sessionId,
          reason: 'Manual session termination by Super Admin operator',
        },
        user
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.support.active })
      queryClient.invalidateQueries({ queryKey: queryKeys.support.history })
      queryClient.invalidateQueries({ queryKey: queryKeys.audit.all })
    },
  })

  const handleRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDairyId) {
      setError('Please select a target dairy tenant.')
      return
    }
    if (justificationReason.trim().length < 15) {
      setError('Detailed customer justification (minimum 15 characters) is mandatory.')
      return
    }
    setError(null)
    requestMutation.mutate()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#211B18] tracking-tight">
            Controlled Support Access Portal
          </h1>
          <p className="text-xs text-[#817A75] mt-0.5">
            Compliance-audited, short-lived diagnostic access to isolated dairy tenant nodes.
          </p>
        </div>
      </div>

      {/* Compliance Rule Banner */}
      <div className="p-4 rounded-2xl bg-[#FAF2EC] border border-[#F1E7E0] text-xs text-[#817A75] space-y-2">
        <div className="flex items-center gap-2 font-bold text-[#211B18]">
          <Lock className="w-4 h-4 text-[#FF6A00]" />
          <span>Strict Multi-Tenant Isolation & Anti-Impersonation Protocol</span>
        </div>
        <p>
          Super Admins do not possess unrestricted or covert access to farmer records or daily milk ledgers. Support sessions require an explicit ticket reference, expire automatically, show a continuous visual badge, and record cryptographically immutable audit entries.
        </p>
      </div>

      {/* ACTIVE SESSION CARD (IF RUNNING) */}
      {activeSession && (
        <ClayCard variant="peach" className="space-y-4 border-2 border-[#FF6A00]/40 shadow-lg animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#FFE9DC] pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500 text-white flex items-center justify-center font-bold">
                <ShieldAlert className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-[#211B18]">
                    Active Support Session: {activeSession.dairyName}
                  </h3>
                  <ClayBadge variant="open" label="IN PROGRESS" />
                </div>
                <span className="text-xs text-[#817A75]">
                  Tenant Code: <strong className="font-mono text-[#FF6A00]">{activeSession.dairyCode}</strong> • Operator: {activeSession.requestedBy}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-auto">
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#817A75] block">
                  Time Remaining
                </span>
                <span className="font-mono text-2xl font-black text-rose-600">
                  {timeLeft || '...'}
                </span>
              </div>

              <ClayButton
                variant="danger"
                size="sm"
                isLoading={revokeMutation.isPending}
                onClick={() => revokeMutation.mutate(activeSession.id)}
                leftIcon={<XCircle className="w-4 h-4" />}
              >
                Revoke Now
              </ClayButton>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-white/80 rounded-xl">
              <span className="text-[#817A75] block">Authorized Scope:</span>
              <strong className="font-mono text-[#211B18]">{activeSession.authorizedScope}</strong>
            </div>
            <div className="p-3 bg-white/80 rounded-xl">
              <span className="text-[#817A75] block">Support Ticket Ref:</span>
              <strong className="text-[#211B18]">{activeSession.supportTicketRef || 'N/A'}</strong>
            </div>
            <div className="p-3 bg-white/80 rounded-xl">
              <span className="text-[#817A75] block">Expires At:</span>
              <strong className="text-[#211B18]">{formatDate(activeSession.expiresAt)}</strong>
            </div>
          </div>

          <div className="p-3 bg-white/60 rounded-xl text-xs text-[#817A75]">
            <span className="font-bold text-[#211B18] block mb-0.5">Recorded Justification:</span>
            <p className="italic">"{activeSession.justificationReason}"</p>
          </div>
        </ClayCard>
      )}

      {/* REQUEST NEW SUPPORT SESSION CARD */}
      <ClayCard variant="default" className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#817A75] border-b border-[#F1E7E0] pb-2">
          Request Temporary Diagnostic Access
        </h3>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={handleRequestSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ClaySelect
              label="Target Dairy Tenant"
              value={selectedDairyId}
              onChange={(e) => setSelectedDairyId(e.target.value)}
              required
            >
              <option value="">Select a dairy business...</option>
              {dairies.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code}) — {d.location.state}
                </option>
              ))}
            </ClaySelect>

            <ClayInput
              label="Support Ticket Reference ID"
              placeholder="e.g. TICKET-9942 or HELPDESK-108"
              value={supportTicketRef}
              onChange={(e) => setSupportTicketRef(e.target.value)}
              helperText="Optional support tracking identifier"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ClaySelect
              label="Diagnostic Scope"
              value={authorizedScope}
              onChange={(e) => setAuthorizedScope(e.target.value as SupportScope)}
              required
            >
              <option value="read_only_diagnostics">Read-Only Telemetry Diagnostics</option>
              <option value="sync_repair">Edge Sync Queue Re-trigger</option>
              <option value="config_audit">Tenant Configuration Audit</option>
            </ClaySelect>

            <ClaySelect
              label="Authorized Window Duration"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value) as 15 | 30 | 60)}
              required
            >
              <option value={15}>15 Minutes (Standard Rapid Check)</option>
              <option value={30}>30 Minutes (Recommended)</option>
              <option value={60}>60 Minutes (Deep Hardware Investigation)</option>
            </ClaySelect>
          </div>

          <ClayTextarea
            label="Mandatory Customer Support Justification"
            placeholder="e.g. Customer reported collection analyzer failing to upload fat/SNF data since morning shift..."
            value={justificationReason}
            onChange={(e) => setJustificationReason(e.target.value)}
            rows={3}
            helperText="Minimum 15 characters. Permanently appended to platform audit trail."
            required
          />

          <div className="pt-2 flex justify-end">
            <ClayButton
              type="submit"
              variant="primary"
              isLoading={requestMutation.isPending}
              disabled={justificationReason.trim().length < 15 || !selectedDairyId}
            >
              Authorize & Start Support Session
            </ClayButton>
          </div>
        </form>
      </ClayCard>

      {/* SUPPORT SESSIONS HISTORY */}
      <ClayCard variant="default" className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#817A75] border-b border-[#F1E7E0] pb-2">
          Support Session Audit History
        </h3>

        {sessionHistory.length === 0 ? (
          <p className="text-xs text-[#817A75] py-4 text-center">
            No previous support sessions recorded on this platform.
          </p>
        ) : (
          <div className="space-y-3">
            {sessionHistory.map((s) => (
              <div
                key={s.id}
                className="p-3.5 rounded-2xl bg-[#FAF6F3] border border-[#F1E7E0] text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <strong className="text-[#211B18]">{s.dairyName}</strong>
                    <span className="font-mono text-[11px] text-[#817A75]">({s.dairyCode})</span>
                    <ClayBadge variant={s.status === 'active' ? 'open' : s.status === 'revoked' ? 'suspended' : 'neutral'} label={s.status.toUpperCase()} />
                  </div>
                  <span className="text-[#817A75] text-[11px] font-mono">
                    {formatDate(s.startedAt)}
                  </span>
                </div>
                <p className="text-[#817A75]">
                  Operator: <strong>{s.requestedBy}</strong> • Scope: <code className="font-mono">{s.authorizedScope}</code>
                </p>
                <p className="text-[#211B18] italic">"{s.justificationReason}"</p>
              </div>
            ))}
          </div>
        )}
      </ClayCard>
    </div>
  )
}
