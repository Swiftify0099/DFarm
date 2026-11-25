import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useDairyAdminRealtimeEvents } from '@/hooks/useDairyAdminRealtimeEvents'
import {
  ClayCard,
  ClayStatCard,
  ClayButton,
  ClayBadge,
  ClayAlert,
  ClaySelect,
  ClayTable,
  Column,
} from '@/components/ui'
import {
  MilkCanVisual,
  CowVisual,
  BuffaloVisual,
  FaceBiometricVisual,
  IotMachineVisual,
  LedgerShieldVisual,
} from '@/assets/illustrations'
import {
  Users,
  Clock,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  FileText,
  DollarSign,
  Package,
  Activity,
  Radio,
  RefreshCw,
  Building,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ShieldAlert,
} from 'lucide-react'
import type {
  DairyAdminMetrics,
  CenterLiveMetric,
  LiveCollectionFeedItem,
  SessionMonitoringItem,
} from '@/types'

export const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [selectedCenterId, setSelectedCenterId] = useState<string>('ALL')
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0])

  // Realtime SSE event subscription with automatic cache invalidation
  const {
    connectionState,
    isLive,
    lastEvent,
    lastEventTime,
  } = useDairyAdminRealtimeEvents({
    centerId: selectedCenterId,
    enabled: Boolean(user?.dairyId),
  })

  // Centers list for filtering
  const { data: centers = [] } = useQuery({
    queryKey: ['dairyCenters', user?.dairyId],
    queryFn: () => api.staff.getCenters(),
    staleTime: 60000,
  })

  // 1. Authoritative Overview Metrics
  const {
    data: metrics,
    isLoading: isMetricsLoading,
    isError: isMetricsError,
    refetch: refetchMetrics,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['dairyAdminMetrics', user?.dairyId, selectedCenterId, selectedDate],
    queryFn: () =>
      api.dairyAdmin.getMetrics({
        centerId: selectedCenterId,
        businessDate: selectedDate,
      }),
    refetchInterval: isLive ? false : 15000,
  })

  // 2. Centre-Wise Live Metrics
  const {
    data: centerMetrics = [],
    isLoading: isCentersLoading,
  } = useQuery({
    queryKey: ['dairyAdminCentersMetrics', user?.dairyId, selectedCenterId, selectedDate],
    queryFn: () =>
      api.dairyAdmin.getCentersMetrics({
        centerId: selectedCenterId,
        businessDate: selectedDate,
      }),
    refetchInterval: isLive ? false : 15000,
  })

  // 3. Live Collection Activity Feed
  const {
    data: collectionsFeed = [],
    isLoading: isFeedLoading,
  } = useQuery({
    queryKey: ['dairyAdminCollectionsFeed', user?.dairyId, selectedCenterId],
    queryFn: () =>
      api.dairyAdmin.getCollectionsFeed({
        centerId: selectedCenterId,
        limit: 15,
      }),
    refetchInterval: isLive ? false : 15000,
  })

  // 4. Session Monitoring
  const {
    data: sessions = [],
    isLoading: isSessionsLoading,
  } = useQuery({
    queryKey: ['dairyAdminSessions', user?.dairyId, selectedCenterId, selectedDate],
    queryFn: () =>
      api.dairyAdmin.getSessions({
        centerId: selectedCenterId,
        businessDate: selectedDate,
      }),
    refetchInterval: isLive ? false : 15000,
  })

  // General dashboard summary (for pending approvals, customer counts)
  const { data: generalSummary } = useQuery({
    queryKey: ['dashboardSummary', user?.dairyId],
    queryFn: () => api.dashboard.getSummary(),
    refetchInterval: 30000,
  })

  const centerOptions = [
    { label: 'All Centers (Organization Wide)', value: 'ALL' },
    ...centers.map((c) => ({ label: `${c.name} (${c.code})`, value: c.id })),
  ]

  // Columns for Live Collection Activity Feed
  const feedColumns: Column<LiveCollectionFeedItem>[] = [
    {
      key: 'collectionReference',
      header: 'Reference',
      render: (r) => (
        <div>
          <span className="font-mono font-bold text-xs text-[#211B18]">{r.collectionReference}</span>
          <p className="text-[10px] text-[#817A75] font-medium">{r.centerName}</p>
        </div>
      ),
    },
    {
      key: 'collectedAt',
      header: 'Time',
      render: (r) => (
        <span className="text-xs font-semibold text-[#817A75]">
          {new Date(r.collectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      ),
    },
    {
      key: 'farmer',
      header: 'Farmer',
      render: (r) => (
        <div>
          <span className="text-xs font-bold text-[#211B18]">{r.maskedFarmerName}</span>
          <p className="text-[10px] text-[#817A75] font-mono">{r.farmerCode}</p>
        </div>
      ),
    },
    {
      key: 'milkCategory',
      header: 'Milk',
      render: (r) => (
        <ClayBadge variant={r.milkCategory === 'COW' ? 'cow' : 'buffalo'} className="text-[10px]">
          {r.milkCategory}
        </ClayBadge>
      ),
    },
    {
      key: 'quantityLiters',
      header: 'Volume',
      render: (r) => (
        <span className="text-xs font-bold text-[#211B18]">
          {Number(r.quantityLiters).toFixed(1)} <span className="text-[10px] font-normal text-[#817A75]">L</span>
        </span>
      ),
    },
    {
      key: 'quality',
      header: 'Fat / SNF',
      render: (r) => (
        <span className="text-xs font-mono font-medium text-[#211B18]">
          {r.fatPercentage.toFixed(1)}% / {r.snfPercentage.toFixed(1)}%
        </span>
      ),
    },
    {
      key: 'ratePerLiter',
      header: 'Rate',
      render: (r) => (
        <span className="text-xs font-mono font-medium text-[#211B18]">
          ₹{r.ratePerLiter.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Total Value',
      render: (r) => (
        <span className="text-xs font-bold text-emerald-800">
          ₹{r.totalAmount.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'financialStatus',
      header: 'Financial Status',
      render: (r) => {
        if (r.financialStatus === 'COMPLETED') {
          return <ClayBadge variant="approved" className="text-[10px]">VERIFIED</ClayBadge>
        }
        if (r.financialStatus === 'MANUAL_REVIEW') {
          return <ClayBadge variant="warning" className="text-[10px]">MANUAL REVIEW</ClayBadge>
        }
        return <ClayBadge variant="rejected" className="text-[10px]">REJECTED</ClayBadge>
      },
    },
    {
      key: 'syncStatus',
      header: 'Sync',
      render: (r) => (
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            r.syncStatus === 'SYNCED_CLOUD'
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}
        >
          {r.syncStatus === 'SYNCED_CLOUD' ? 'CLOUD SYNCED' : 'LOCAL ONLY'}
        </span>
      ),
    },
  ]

  // Columns for Session Monitoring
  const sessionColumns: Column<SessionMonitoringItem>[] = [
    {
      key: 'session',
      header: 'Session',
      render: (r) => (
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-[#211B18]">{r.shift} SHIFT</span>
            <ClayBadge variant={r.status === 'OPEN' ? 'active' : 'inactive'} className="text-[10px]">
              {r.status}
            </ClayBadge>
          </div>
          <p className="text-[10px] text-[#817A75] font-mono mt-0.5">{r.sessionId.slice(0, 18)}...</p>
        </div>
      ),
    },
    {
      key: 'center',
      header: 'Center & Device',
      render: (r) => (
        <div>
          <span className="text-xs font-semibold text-[#211B18]">{r.centerName}</span>
          <p className="text-[10px] text-[#817A75] font-mono">{r.deviceName}</p>
        </div>
      ),
    },
    {
      key: 'timings',
      header: 'Timings',
      render: (r) => (
        <div className="text-xs text-[#817A75]">
          <p>
            <span className="font-semibold text-[#211B18]">Opened:</span>{' '}
            {new Date(r.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          {r.closedAt ? (
            <p>
              <span className="font-semibold text-[#211B18]">Closed:</span>{' '}
              {new Date(r.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          ) : (
            <p className="text-emerald-700 font-semibold">In Progress</p>
          )}
        </div>
      ),
    },
    {
      key: 'collections',
      header: 'Intake Summary',
      render: (r) => (
        <div className="text-xs">
          <p className="font-bold text-[#211B18]">
            {Number(r.totalLiters).toFixed(1)} L{' '}
            <span className="text-[10px] font-normal text-[#817A75]">({r.totalTransactions} txns)</span>
          </p>
          <p className="text-[10px] text-[#817A75]">
            Cow: {Number(r.cowLiters).toFixed(1)}L • Buf: {Number(r.buffaloLiters).toFixed(1)}L
          </p>
        </div>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Session Value',
      render: (r) => (
        <span className="text-xs font-bold text-[#211B18]">
          ₹{Number(r.totalAmount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
        </span>
      ),
    },
    {
      key: 'operator',
      header: 'Operator',
      render: (r) => (
        <span className="text-xs font-medium text-[#211B18]">
          {r.operatorName || 'Assigned Operator'}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6 text-left">
      {/* Top Banner: Dairy Profile, Realtime SSE Status, Filters & Quick Actions */}
      <div className="flex flex-col gap-4 p-6 bg-gradient-to-r from-white via-[#FFF5EE] to-[#FFE9DC]/50 rounded-2xl border border-[#F1E7E0] shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-black text-[#211B18] tracking-tight">
                {user?.dairyName || 'Dairy Cooperative'}
              </h1>
              <ClayBadge variant="cow" className="text-xs">
                {user?.dairyCode || 'DAIRY'}
              </ClayBadge>

              {/* Realtime Event Stream Status Pill */}
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-xs bg-white">
                {isLive ? (
                  <>
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-emerald-700">LIVE SSE STREAM</span>
                  </>
                ) : connectionState === 'CONNECTING' ? (
                  <>
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500 animate-pulse"></span>
                    </span>
                    <span className="text-amber-700">CONNECTING...</span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-stone-400"></span>
                    <span className="text-stone-600">POLLING (15s FALLBACK)</span>
                  </>
                )}
              </div>
            </div>

            <p className="text-xs text-[#817A75] mt-1 font-medium">
              Primary Financial Authority: <span className="font-bold text-[#211B18]">PostgreSQL</span> • Tenant ID:{' '}
              <span className="font-mono text-[#211B18]">{user?.dairyId}</span>
              {dataUpdatedAt ? (
                <> • Last refreshed: {new Date(dataUpdatedAt).toLocaleTimeString()}</>
              ) : null}
            </p>
          </div>

          {/* Quick Action Navigation Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <ClayButton
              variant="secondary"
              size="sm"
              onClick={() => refetchMetrics()}
              leftIcon={<RefreshCw size={14} />}
            >
              Refresh
            </ClayButton>
            <ClayButton
              variant="secondary"
              size="sm"
              onClick={() => navigate('/collection/sessions')}
              leftIcon={<Clock size={16} />}
            >
              Sessions
            </ClayButton>
            <ClayButton
              variant="secondary"
              size="sm"
              onClick={() => navigate('/devices')}
              leftIcon={<IotMachineVisual size={16} />}
            >
              Station Health
            </ClayButton>
            <ClayButton
              variant="primary"
              size="sm"
              onClick={() => navigate('/customers/approvals')}
              leftIcon={<Users size={16} />}
            >
              Approvals ({generalSummary?.customers?.pendingApprovals || 0})
            </ClayButton>
          </div>
        </div>

        {/* Filter Strip: Center & Business Date */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-3 border-t border-[#F1E7E0]">
          <div className="w-full sm:w-72">
            <ClaySelect
              options={centerOptions}
              value={selectedCenterId}
              onChange={(e) => setSelectedCenterId(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-semibold text-[#817A75] shrink-0">Business Date:</span>
            <input
              type="date"
              className="clay-input text-xs py-1.5 px-3"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>

          {selectedCenterId !== 'ALL' && (
            <button
              onClick={() => setSelectedCenterId('ALL')}
              className="text-xs font-bold text-[#FF6A00] hover:underline cursor-pointer ml-auto"
            >
              Clear Center Filter
            </button>
          )}
        </div>
      </div>

      {/* Error state */}
      {isMetricsError && (
        <ClayAlert
          type="danger"
          title="Failed to Load Authoritative Metrics"
          message="Could not retrieve real-time metrics from PostgreSQL. Fallback polling will retry automatically."
        />
      )}

      {/* ======================================================================== */}
      {/* SECTION A: OVERVIEW METRICS (POSTGRESQL-AUTHORITATIVE)                  */}
      {/* ======================================================================== */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-[#FF6A00]" />
            <h2 className="text-base font-bold text-[#211B18]">Operational Overview Metrics</h2>
          </div>
          <span className="text-[11px] text-[#817A75] font-medium">
            PostgreSQL Real-Time Aggregates
          </span>
        </div>

        {/* Primary Operational Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ClayStatCard
            title="Today's Milk Collection"
            value={Number(metrics?.totalMilkLiters || 0).toFixed(1)}
            unit="Liters"
            subtitle={`${metrics?.transactionCount || 0} verified collections`}
            icon={<MilkCanVisual size={24} />}
            iconBgColor="bg-[#FFE9DC]"
            onClick={() => navigate('/collection/register')}
          />

          <ClayStatCard
            title="Today's Collection Value"
            value={`₹${Number(metrics?.totalAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
            subtitle="Accredited to farmer ledgers"
            icon={<DollarSign className="text-[#FF6A00]" size={22} />}
            iconBgColor="bg-[#FFF5EE]"
            onClick={() => navigate('/ledger')}
          />

          <ClayStatCard
            title="Active Collection Sessions"
            value={`${metrics?.activeSessionsCount || 0} Open`}
            subtitle={`${centerMetrics.length} total operational centers`}
            icon={<Clock className="text-[#FF6A00]" size={22} />}
            iconBgColor="bg-amber-100"
            onClick={() => navigate('/collection/sessions')}
          />

          <ClayStatCard
            title="Station Health Telemetry"
            value={`${metrics?.onlineStationsCount || 0} Online`}
            subtitle={
              metrics?.degradedStationsCount || metrics?.offlineStationsCount || metrics?.blockedStationsCount
                ? `${metrics?.degradedStationsCount || 0} degraded • ${metrics?.offlineStationsCount || 0} offline • ${metrics?.blockedStationsCount || 0} blocked`
                : 'All collection stations operational'
            }
            icon={<IotMachineVisual size={24} />}
            iconBgColor="bg-emerald-100"
            onClick={() => navigate('/devices')}
          />
        </div>

        {/* Secondary Operational Status Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <ClayCard className="flex items-center gap-3.5 !p-4">
            <div className="w-12 h-12 rounded-xl bg-[#FFF5EE] border border-[#FFE9DC] flex items-center justify-center shrink-0">
              <CowVisual size={28} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#817A75] uppercase">Cow Milk Intake</p>
              <h4 className="text-xl font-black text-[#211B18] mt-0.5">
                {Number(metrics?.cowLiters || 0).toFixed(1)} <span className="text-xs font-semibold text-[#817A75]">L</span>
              </h4>
              <p className="text-[11px] text-[#817A75]">Authoritative backend total</p>
            </div>
          </ClayCard>

          <ClayCard className="flex items-center gap-3.5 !p-4">
            <div className="w-12 h-12 rounded-xl bg-[#F1E7E0] border border-[#E5D8CF] flex items-center justify-center shrink-0">
              <BuffaloVisual size={28} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#817A75] uppercase">Buffalo Milk Intake</p>
              <h4 className="text-xl font-black text-[#211B18] mt-0.5">
                {Number(metrics?.buffaloLiters || 0).toFixed(1)} <span className="text-xs font-semibold text-[#817A75]">L</span>
              </h4>
              <p className="text-[11px] text-[#817A75]">Authoritative backend total</p>
            </div>
          </ClayCard>

          <ClayCard className="flex items-center gap-3.5 !p-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
              <Radio size={24} className="text-blue-700" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#817A75] uppercase">Pending Sync Telemetry</p>
              <h4 className="text-xl font-black text-[#211B18] mt-0.5">
                {metrics?.pendingSyncCount || 0} <span className="text-xs font-semibold text-[#817A75]">Items</span>
              </h4>
              <p className="text-[11px] text-blue-700 font-semibold">Station-reported offline queue</p>
            </div>
          </ClayCard>

          <ClayCard className="flex items-center gap-3.5 !p-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0">
              <ShieldAlert size={24} className="text-[#FF6A00]" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#817A75] uppercase">Operational Exceptions</p>
              <h4 className="text-xl font-black text-[#211B18] mt-0.5">
                {(metrics?.manualReviewCount || 0) + (metrics?.rejectedCount || 0)}
              </h4>
              <p className="text-[11px] text-amber-700 font-semibold">
                {metrics?.manualReviewCount || 0} review • {metrics?.rejectedCount || 0} rejected
              </p>
            </div>
          </ClayCard>
        </div>
      </div>

      {/* ======================================================================== */}
      {/* SECTION B: CENTRE-WISE LIVE OVERVIEW                                    */}
      {/* ======================================================================== */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Building size={18} className="text-[#FF6A00]" />
            <h2 className="text-base font-bold text-[#211B18]">Centre-Wise Live Overview</h2>
          </div>
          <span className="text-[11px] text-[#817A75] font-medium">
            {centerMetrics.length} Authorized Centers
          </span>
        </div>

        {centerMetrics.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {centerMetrics.map((center) => (
              <ClayCard key={center.centerId} className="space-y-3">
                <div className="flex items-center justify-between border-b border-[#F1E7E0] pb-2">
                  <div>
                    <h3 className="font-bold text-sm text-[#211B18]">{center.centerName}</h3>
                    <p className="text-[10px] text-[#817A75] font-mono">{center.centerCode}</p>
                  </div>
                  <ClayBadge
                    variant={center.status === 'OPEN' ? 'active' : 'inactive'}
                    className="text-[10px]"
                  >
                    {center.status}
                  </ClayBadge>
                </div>

                {/* Active Session Info */}
                <div className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[#817A75]">Active Session:</span>
                    <span className="font-bold text-[#211B18]">
                      {center.activeSession
                        ? `${center.activeSession.shift} (${center.activeSession.operatorName})`
                        : 'No Active Session'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#817A75]">Today's Intake:</span>
                    <span className="font-bold text-[#211B18]">
                      {Number(center.totalLiters).toFixed(1)} L ({center.totalCollections} txns)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#817A75]">Total Value:</span>
                    <span className="font-bold text-emerald-800">
                      ₹{Number(center.totalAmount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#817A75]">Latest Collection:</span>
                    <span className="font-mono text-[11px] text-[#211B18]">
                      {center.latestCollectionTime
                        ? new Date(center.latestCollectionTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : 'None today'}
                    </span>
                  </div>
                </div>

                {/* Station Telemetry Badges */}
                <div className="pt-2 border-t border-[#F1E7E0] flex flex-wrap items-center justify-between gap-1 text-[10px]">
                  <span className="text-emerald-700 font-semibold">
                    {center.activeStationsCount} stations online
                  </span>
                  {center.offlineStationsCount > 0 && (
                    <span className="text-stone-600 font-semibold">
                      {center.offlineStationsCount} offline
                    </span>
                  )}
                  {center.pendingSyncCount > 0 && (
                    <span className="text-amber-700 font-bold">
                      {center.pendingSyncCount} pending sync
                    </span>
                  )}
                  {center.manualReviewCount > 0 && (
                    <span className="text-red-700 font-bold">
                      {center.manualReviewCount} review
                    </span>
                  )}
                </div>
              </ClayCard>
            ))}
          </div>
        ) : (
          <ClayCard className="p-8 text-center text-[#817A75] text-xs">
            <Building size={32} className="mx-auto mb-2 opacity-40" />
            <p className="font-semibold text-sm text-[#211B18]">No centers registered or matching filters.</p>
          </ClayCard>
        )}
      </div>

      {/* ======================================================================== */}
      {/* SECTION C: LIVE COLLECTION ACTIVITY FEED                                */}
      {/* ======================================================================== */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-[#FF6A00]" />
            <h2 className="text-base font-bold text-[#211B18]">Live Collection Activity Feed</h2>
          </div>
          <span className="text-[11px] text-[#817A75] font-medium">
            Recent verified transactions • PII Redacted
          </span>
        </div>

        <ClayCard className="!p-0 overflow-hidden">
          <ClayTable
            columns={feedColumns}
            data={collectionsFeed}
            keyExtractor={(item) => item.id}
            isLoading={isFeedLoading}
            emptyMessage="No verified collections recorded yet today."
          />
        </ClayCard>
      </div>

      {/* ======================================================================== */}
      {/* SECTION D: SESSION MONITORING                                           */}
      {/* ======================================================================== */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-[#FF6A00]" />
            <h2 className="text-base font-bold text-[#211B18]">Session Monitoring</h2>
          </div>
          <span className="text-[11px] text-[#817A75] font-medium">
            Shift sessions for {selectedDate}
          </span>
        </div>

        <ClayCard className="!p-0 overflow-hidden">
          <ClayTable
            columns={sessionColumns}
            data={sessions}
            keyExtractor={(item) => item.sessionId}
            isLoading={isSessionsLoading}
            emptyMessage="No collection sessions recorded for this date."
          />
        </ClayCard>
      </div>
    </div>
  )
}
