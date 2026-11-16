import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { apiClient } from '@/api/client'
import { ClayCard } from '@/components/ui/ClayCard'
import { ClayBadge } from '@/components/ui/ClayBadge'
import { formatDate } from '@/utils/formatters'
import {
  Activity,
  Server,
  Database,
  Radio,
  HardDrive,
  Cpu,
  Clock,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'

export const MonitoringPage: React.FC = () => {
  const { data: health, isLoading, refetch } = useQuery({
    queryKey: queryKeys.monitoring.health,
    queryFn: () => apiClient.getPlatformHealth(),
    refetchInterval: 10000,
  })

  if (isLoading || !health) {
    return (
      <div className="py-24 text-center">
        <div className="w-10 h-10 border-3 border-[#FF6A00] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs font-semibold text-[#817A75]">Polling platform health signals...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#211B18] tracking-tight">
            Platform Operational Telemetry
          </h1>
          <p className="text-xs text-[#817A75] mt-0.5">
            Real-time infrastructure health, microservices, edge sync queues, and connected hardware units.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-[#F1E7E0] text-xs font-semibold text-[#211B18] hover:bg-[#FFE9DC] transition-colors shadow-xs cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#FF6A00]" />
          <span>Refresh Signals</span>
        </button>
      </div>

      {/* Cluster Status Top Banner */}
      <ClayCard variant="peach" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-[#211B18]">
                {health.systemVersion}
              </h2>
              <ClayBadge variant={health.overallStatus} />
            </div>
            <p className="text-xs text-[#817A75] mt-0.5">
              Primary Deployment Region: <strong className="text-[#211B18]">{health.deploymentRegion}</strong> • Health check polled at {formatDate(health.lastHealthCheck)}
            </p>
          </div>
        </div>

        <div className="text-xs text-[#817A75] sm:text-right">
          <span className="block">Active Dairy Nodes Online</span>
          <strong className="text-base text-[#211B18]">
            {health.syncMetrics.activeDairyNodesOnline} Isolated Nodes
          </strong>
        </div>
      </ClayCard>

      {/* Edge Synchronization Engine Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ClayCard variant="default" padding="sm" className="space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#817A75]">
            Synced Records Today
          </span>
          <div className="text-2xl font-black text-[#211B18]">
            {health.syncMetrics.totalSyncedEventsToday.toLocaleString()}
          </div>
          <span className="text-[11px] text-emerald-600 font-semibold">Zero data loss detected</span>
        </ClayCard>

        <ClayCard variant="default" padding="sm" className="space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#817A75]">
            Pending Ingestion Queue
          </span>
          <div className="text-2xl font-black text-[#211B18]">
            {health.syncMetrics.pendingQueueDepth} Packets
          </div>
          <span className="text-[11px] text-[#817A75]">Within real-time SLA thresholds</span>
        </ClayCard>

        <ClayCard variant="default" padding="sm" className="space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#817A75]">
            Mean Ingestion Latency
          </span>
          <div className="text-2xl font-black text-[#211B18]">
            {health.syncMetrics.avgSyncLatencyMs} ms
          </div>
          <span className="text-[11px] text-emerald-600 font-semibold">Target &lt;100ms</span>
        </ClayCard>

        <ClayCard variant="default" padding="sm" className="space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#817A75]">
            Hardware Devices Connected
          </span>
          <div className="text-2xl font-black text-[#211B18]">
            {health.deviceMetrics.onlineHardwareUnits} / {health.deviceMetrics.totalRegisteredHardwareUnits}
          </div>
          <span className="text-[11px] text-[#817A75]">
            {health.deviceMetrics.bluetoothMilkAnalyzersConnected} analyzers, {health.deviceMetrics.digitalScalesConnected} scales
          </span>
        </ClayCard>
      </div>

      {/* Core Component Services Breakdown */}
      <ClayCard variant="default" className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#817A75] border-b border-[#F1E7E0] pb-2">
          Subsystem Service Endpoints
        </h3>

        <div className="divide-y divide-[#F1E7E0]">
          {health.components.map((comp) => (
            <div key={comp.name} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#FAF2EC] text-[#FF6A00] flex items-center justify-center shrink-0 mt-0.5">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-[#211B18]">{comp.name}</span>
                    <ClayBadge variant={comp.status} />
                  </div>
                  <p className="text-xs text-[#817A75] mt-0.5">{comp.details}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs shrink-0 pl-11 sm:pl-0">
                <div className="text-right">
                  <span className="text-[#817A75] block text-[10px] uppercase font-bold">24h Uptime</span>
                  <strong className="text-[#211B18]">{comp.uptime24h}%</strong>
                </div>
                <div className="text-right">
                  <span className="text-[#817A75] block text-[10px] uppercase font-bold">Response</span>
                  <strong className="font-mono text-[#211B18]">{comp.responseTimeMs} ms</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ClayCard>

      {/* Active Operational Incidents Tracker */}
      <ClayCard variant="default" className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#817A75] border-b border-[#F1E7E0] pb-2">
          Operational Incidents Tracker
        </h3>

        {health.activeIncidents.length === 0 ? (
          <p className="text-xs text-emerald-700 py-3 text-center">
            Zero active incidents reported across platform services.
          </p>
        ) : (
          <div className="space-y-3">
            {health.activeIncidents.map((inc) => (
              <div
                key={inc.id}
                className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span className="font-bold text-[#211B18]">{inc.title}</span>
                    <ClayBadge variant={inc.severity} />
                  </div>
                  <span className="text-[#817A75] text-[11px] font-mono">
                    Logged: {formatDate(inc.startedAt)}
                  </span>
                </div>
                <p className="text-[#817A75]">{inc.summary}</p>
                <div className="flex items-center gap-2 text-[11px] text-[#817A75]">
                  <span>Status: <strong>{inc.status.toUpperCase()}</strong></span>
                  <span>•</span>
                  <span>Affected Tenants: {inc.affectedDairiesCount}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </ClayCard>
    </div>
  )
}
