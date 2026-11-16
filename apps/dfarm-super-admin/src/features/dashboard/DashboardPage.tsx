import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { apiClient } from '@/api/client'
import { ClayMetricCard } from '@/components/ui/ClayMetricCard'
import { ClayCard } from '@/components/ui/ClayCard'
import { ClayBadge } from '@/components/ui/ClayBadge'
import { ClayButton } from '@/components/ui/ClayButton'
import { CreateDairyModal } from '../dairies/CreateDairyModal'
import { formatDate, formatTimeRelative } from '@/utils/formatters'
import {
  Building2,
  Users2,
  Activity,
  BellRing,
  HardDrive,
  Clock,
  Plus,
  ShieldCheck,
  TrendingUp,
  MapPin,
  ArrowUpRight,
  ChevronRight,
  FileText,
  AlertTriangle,
} from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate()
  const [createModalOpen, setCreateModalOpen] = useState(false)

  // Fetch KPI Metrics
  const { data: metrics, isLoading: isMetricsLoading } = useQuery({
    queryKey: queryKeys.dashboard.metrics,
    queryFn: () => apiClient.getDashboardMetrics(),
    refetchInterval: 15000,
  })

  // Fetch Global Analytics
  const { data: analytics, isLoading: isAnalyticsLoading } = useQuery({
    queryKey: queryKeys.dashboard.analytics,
    queryFn: () => apiClient.getGlobalAnalytics(),
  })

  // Fetch Recent Dairies
  const { data: recentDairies = [] } = useQuery({
    queryKey: queryKeys.dairies.list({}),
    queryFn: () => apiClient.getDairies(),
  })

  // Fetch Recent Audit Logs
  const { data: recentAudits = [] } = useQuery({
    queryKey: queryKeys.audit.list({}),
    queryFn: () => apiClient.getAuditLogs(),
  })

  // Fetch Open Alerts
  const { data: alerts = [] } = useQuery({
    queryKey: queryKeys.alerts.list({ status: 'open' }),
    queryFn: () => apiClient.getAlerts({ status: 'open' }),
  })

  return (
    <div className="space-y-6">
      {/* Top Welcome & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#211B18] tracking-tight">
            Central Platform Overview
          </h1>
          <p className="text-xs text-[#817A75] mt-0.5">
            Operational telemetry and management of multi-tenant dairy businesses.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <ClayButton
            variant="primary"
            onClick={() => setCreateModalOpen(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Create New Dairy
          </ClayButton>
        </div>
      </div>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ClayMetricCard
          title="Total Registered Dairies"
          value={metrics?.totalDairies ?? '—'}
          subtitle={`${metrics?.activeDairies ?? 0} Active • ${metrics?.suspendedDairies ?? 0} Suspended`}
          icon={<Building2 className="w-5 h-5" />}
          trend={{ value: '+2 this month', isPositive: true }}
          onClick={() => navigate('/dairies')}
        />

        <ClayMetricCard
          title="Onboarding Pipeline"
          value={metrics?.pendingOnboardingDairies ?? '—'}
          subtitle={`${metrics?.adminsAwaitingActivation ?? 0} Awaiting OTP Verification`}
          icon={<Clock className="w-5 h-5" />}
          onClick={() => navigate('/dairies?status=draft_onboarding')}
        />

        <ClayMetricCard
          title="Connected Hardware"
          value={metrics?.totalRegisteredHardwareUnits ?? '—'}
          subtitle="Analyzers & digital scales across nodes"
          icon={<HardDrive className="w-5 h-5" />}
          onClick={() => navigate('/monitoring')}
        />

        <ClayMetricCard
          title="Platform Sync Health"
          value={metrics?.platformSyncHealthStatus ? metrics.platformSyncHealthStatus.toUpperCase() : 'HEALTHY'}
          subtitle={`${metrics?.openAlertsCount ?? 0} Active Alerts (${metrics?.criticalAlertsCount ?? 0} Critical)`}
          icon={<Activity className="w-5 h-5" />}
          variant={metrics?.criticalAlertsCount && metrics.criticalAlertsCount > 0 ? 'peach' : 'default'}
          onClick={() => navigate('/alerts')}
        />
      </div>

      {/* Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Onboarding Growth Chart */}
        <ClayCard variant="default" className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-[#F1E7E0] pb-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#817A75]">
                Dairy Onboarding Growth
              </h3>
              <p className="text-xs text-[#817A75]">
                Platform adoption trends: New registrations vs activated tenants
              </p>
            </div>
            <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              <span>Expanding</span>
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={analytics?.monthlyOnboardingTrend || []}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorDairies" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FF6A00" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#FF6A00" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1E7E0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#817A75' }} stroke="#D9CBC1" />
                <YAxis tick={{ fontSize: 11, fill: '#817A75' }} stroke="#D9CBC1" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #F1E7E0',
                    fontSize: '12px',
                    boxShadow: '0 8px 16px rgba(0,0,0,0.08)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="newDairies"
                  name="New Registered"
                  stroke="#FF6A00"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorDairies)"
                />
                <Area
                  type="monotone"
                  dataKey="activatedDairies"
                  name="Activated"
                  stroke="#10B981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorActive)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ClayCard>

        {/* Geographic Distribution Bar Chart */}
        <ClayCard variant="default" className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#F1E7E0] pb-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#817A75]">
                Geographic Presence
              </h3>
              <p className="text-xs text-[#817A75]">Dairy nodes by state</p>
            </div>
            <MapPin className="w-4 h-4 text-[#FF6A00]" />
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analytics?.geographicDistribution || []}
                margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F1E7E0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#817A75' }} stroke="#D9CBC1" allowDecimals={false} />
                <YAxis
                  dataKey="state"
                  type="category"
                  tick={{ fontSize: 10, fill: '#211B18' }}
                  stroke="#D9CBC1"
                  width={90}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #F1E7E0',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" name="Tenants" fill="#FF7B1A" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ClayCard>
      </div>

      {/* Two Column Section: Recent Dairies & Recent Audit Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Dairies */}
        <ClayCard variant="default" className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#F1E7E0] pb-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#817A75]">
                Recent Dairy Onboarding
              </h3>
              <p className="text-xs text-[#817A75]">Latest multi-tenant dairy registrations</p>
            </div>
            <button
              onClick={() => navigate('/dairies')}
              className="text-xs font-bold text-[#FF6A00] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-[#F1E7E0]">
            {recentDairies.slice(0, 4).map((dairy) => (
              <div
                key={dairy.id}
                onClick={() => navigate(`/dairies/${dairy.id}`)}
                className="py-3 flex items-center justify-between hover:bg-[#FAF6F3] px-2 rounded-xl transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#FFE9DC] text-[#FF6A00] flex items-center justify-center font-bold text-xs border border-[#FDBA74]/50">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-xs text-[#211B18]">{dairy.name}</span>
                    <span className="text-[11px] text-[#817A75]">
                      {dairy.location.district}, {dairy.location.state} • {dairy.code}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <ClayBadge variant={dairy.status} />
                  <ArrowUpRight className="w-4 h-4 text-[#817A75]" />
                </div>
              </div>
            ))}
          </div>
        </ClayCard>

        {/* Recent Administrative Audit Trail */}
        <ClayCard variant="default" className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#F1E7E0] pb-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#817A75]">
                Administrative Actions Audit
              </h3>
              <p className="text-xs text-[#817A75]">Real-time append-only administrative ledger</p>
            </div>
            <button
              onClick={() => navigate('/audit')}
              className="text-xs font-bold text-[#FF6A00] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>All Logs</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-[#F1E7E0]">
            {recentAudits.slice(0, 4).map((log) => (
              <div key={log.id} className="py-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#FAF2EC] text-[#FF6A00] flex items-center justify-center shrink-0 mt-0.5">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-[#211B18] block truncate">
                    {log.actionDescription}
                  </span>
                  <div className="flex items-center gap-2 text-[11px] text-[#817A75] mt-0.5">
                    <span>By: {log.actorName}</span>
                    <span>•</span>
                    <span>{formatTimeRelative(log.timestamp)}</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#FAF2EC] text-[#817A75]">
                  {log.outcome.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </ClayCard>
      </div>

      {/* Create Dairy Modal */}
      <CreateDairyModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => navigate('/dairies')}
      />
    </div>
  )
}
