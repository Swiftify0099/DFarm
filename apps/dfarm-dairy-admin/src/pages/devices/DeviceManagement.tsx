import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import type { StationMonitoringItem, StationStatusClassification } from '@/types'
import { useDairyAdminRealtimeEvents } from '@/hooks/useDairyAdminRealtimeEvents'
import {
  ClayCard,
  ClayButton,
  ClayBadge,
  ClayAlert,
  ClayTable,
  Column,
  ClaySelect,
  ConfirmationModal,
} from '@/components/ui'
import { IotMachineVisual } from '@/assets/illustrations'
import {
  Cpu,
  RefreshCw,
  Wifi,
  WifiOff,
  AlertTriangle,
  Shield,
  ShieldAlert,
  CheckCircle2,
  Lock,
  Unlock,
  Radio,
  Clock,
  Battery,
  Signal,
  HelpCircle,
} from 'lucide-react'

export const DeviceManagement: React.FC = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [selectedCenterId, setSelectedCenterId] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [notice, setNotice] = useState<{ type: 'success' | 'danger'; message: string } | null>(null)

  // Modal state for blocking/unblocking station
  const [blockingStation, setBlockingStation] = useState<StationMonitoringItem | null>(null)
  const [unblockingStation, setUnblockingStation] = useState<StationMonitoringItem | null>(null)

  // Realtime SSE event subscription for instant device health reflection
  const { isLive } = useDairyAdminRealtimeEvents({
    centerId: selectedCenterId,
    enabled: Boolean(user?.dairyId),
  })

  // Center list for scoping
  const { data: centers = [] } = useQuery({
    queryKey: ['dairyCenters', user?.dairyId],
    queryFn: () => api.staff.getCenters(),
    staleTime: 60000,
  })

  // Stations query
  const {
    data: stations = [],
    isLoading,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['dairyAdminStations', user?.dairyId, selectedCenterId],
    queryFn: () => api.dairyAdmin.getStations(selectedCenterId),
    refetchInterval: isLive ? false : 15000,
  })

  // Block Station Mutation
  const blockMutation = useMutation({
    mutationFn: ({ deviceId, reason }: { deviceId: string; reason?: string }) =>
      api.dairyAdmin.blockStation(deviceId, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['dairyAdminStations'] })
      queryClient.invalidateQueries({ queryKey: ['dairyAdminMetrics'] })
      setBlockingStation(null)
      setNotice({
        type: 'success',
        message: `Station ${variables.deviceId} has been blocked and revoked from collection operations.`,
      })
    },
    onError: (err: any) => {
      setNotice({ type: 'danger', message: err.message || 'Failed to block station' })
    },
  })

  // Unblock Station Mutation
  const unblockMutation = useMutation({
    mutationFn: (deviceId: string) => api.dairyAdmin.unblockStation(deviceId),
    onSuccess: (_, deviceId) => {
      queryClient.invalidateQueries({ queryKey: ['dairyAdminStations'] })
      queryClient.invalidateQueries({ queryKey: ['dairyAdminMetrics'] })
      setUnblockingStation(null)
      setNotice({
        type: 'success',
        message: `Station ${deviceId} has been successfully restored and unblocked.`,
      })
    },
    onError: (err: any) => {
      setNotice({ type: 'danger', message: err.message || 'Failed to unblock station' })
    },
  })

  const centerOptions = [
    { label: 'All Centers', value: 'ALL' },
    ...centers.map((c) => ({ label: `${c.name} (${c.code})`, value: c.id })),
  ]

  // Filter stations by status tab
  const filteredStations = stations.filter((s) => {
    if (statusFilter === 'ALL') return true
    return s.statusClassification === statusFilter
  })

  // Summary counts
  const totalCount = stations.length
  const onlineCount = stations.filter((s) => s.statusClassification === 'ONLINE').length
  const degradedCount = stations.filter((s) => s.statusClassification === 'DEGRADED').length
  const offlineCount = stations.filter((s) => s.statusClassification === 'OFFLINE').length
  const blockedCount = stations.filter((s) => s.statusClassification === 'BLOCKED').length
  const totalPendingQueue = stations.reduce((acc, s) => acc + (s.pendingQueueCount || 0), 0)

  const formatRelativeTime = (isoString: string | null) => {
    if (!isoString) return 'Never'
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  const columns: Column<StationMonitoringItem>[] = [
    {
      key: 'station',
      header: 'Station & Hardware',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <IotMachineVisual size={24} />
          <div>
            <span className="font-bold text-sm text-[#211B18]">{r.deviceName}</span>
            <p className="text-[10px] text-[#817A75] font-mono mt-0.5">
              ID: {r.deviceId} • {r.deviceType}
            </p>
            {r.appVersion && (
              <span className="text-[9px] px-1.5 py-0.2 bg-stone-100 text-stone-600 rounded font-mono">
                v{r.appVersion}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'center',
      header: 'Assigned Center',
      render: (r) => (
        <div className="text-xs">
          <p className="font-semibold text-[#211B18]">{r.centerName || 'Unassigned Center'}</p>
          <p className="text-[10px] text-[#817A75] font-mono">{r.centerCode || 'CODE: N/A'}</p>
        </div>
      ),
    },
    {
      key: 'statusClassification',
      header: 'Operational Status',
      render: (r) => {
        if (r.statusClassification === 'BLOCKED') {
          return (
            <div>
              <ClayBadge variant="rejected" icon={<ShieldAlert size={12} />} className="text-[10px]">
                BLOCKED
              </ClayBadge>
              {r.revocationReason && (
                <p className="text-[9px] text-red-600 font-medium mt-0.5 max-w-[130px] truncate" title={r.revocationReason}>
                  {r.revocationReason}
                </p>
              )}
            </div>
          )
        }
        if (r.statusClassification === 'ONLINE') {
          return (
            <ClayBadge variant="online" icon={<Wifi size={12} />} className="text-[10px]">
              ONLINE
            </ClayBadge>
          )
        }
        if (r.statusClassification === 'DEGRADED') {
          return (
            <ClayBadge variant="warning" icon={<AlertTriangle size={12} />} className="text-[10px]">
              DEGRADED
            </ClayBadge>
          )
        }
        if (r.statusClassification === 'OFFLINE') {
          return (
            <ClayBadge variant="offline" icon={<WifiOff size={12} />} className="text-[10px]">
              OFFLINE
            </ClayBadge>
          )
        }
        return (
          <ClayBadge variant="neutral" icon={<HelpCircle size={12} />} className="text-[10px]">
            UNKNOWN
          </ClayBadge>
        )
      },
    },
    {
      key: 'heartbeat',
      header: 'Last Heartbeat',
      render: (r) => (
        <div className="text-xs">
          <p className="font-semibold text-[#211B18] flex items-center gap-1">
            <Clock size={11} className="text-[#817A75]" /> {formatRelativeTime(r.lastHeartbeatAt || r.lastSeenAt)}
          </p>
          <p className="text-[10px] text-[#817A75] font-mono">
            {r.lastHeartbeatAt
              ? new Date(r.lastHeartbeatAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : r.lastSeenAt
              ? new Date(r.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : 'No heartbeat recorded'}
          </p>
        </div>
      ),
    },
    {
      key: 'syncHealth',
      header: 'Sync Health & Queue',
      render: (r) => (
        <div className="text-xs">
          {r.pendingQueueCount > 0 ? (
            <p className="text-[11px] font-bold text-amber-700 flex items-center gap-1">
              <AlertTriangle size={12} /> {r.pendingQueueCount} pending items
            </p>
          ) : (
            <p className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
              <CheckCircle2 size={12} /> Queue Clean (0)
            </p>
          )}

          {r.lastSuccessfulSyncAt ? (
            <p className="text-[10px] text-[#817A75]">
              Last sync: {formatRelativeTime(r.lastSuccessfulSyncAt)}
            </p>
          ) : (
            <p className="text-[10px] text-[#817A75]">No cloud sync recorded</p>
          )}

          {r.syncFailureCategory && (
            <p className="text-[9px] text-red-600 font-mono mt-0.5">
              Err: {r.syncFailureCategory}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'telemetry',
      header: 'Telemetry',
      render: (r) => (
        <div className="text-xs text-[#817A75] space-y-0.5">
          {r.networkMode && (
            <p className="flex items-center gap-1 font-mono text-[10px]">
              <Signal size={11} className="text-[#817A75]" /> {r.networkMode}
            </p>
          )}
          {r.batteryLevel !== null && r.batteryLevel !== undefined && (
            <p className="flex items-center gap-1 font-mono text-[10px]">
              <Battery size={11} className="text-[#817A75]" /> {r.batteryLevel}%
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          {r.isBlocked || r.statusClassification === 'BLOCKED' ? (
            <ClayButton
              variant="secondary"
              size="sm"
              onClick={() => setUnblockingStation(r)}
              leftIcon={<Unlock size={12} className="text-emerald-700" />}
            >
              Unblock
            </ClayButton>
          ) : (
            <ClayButton
              variant="secondary"
              size="sm"
              onClick={() => setBlockingStation(r)}
              leftIcon={<Lock size={12} className="text-red-600" />}
            >
              Block
            </ClayButton>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6 text-left">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-6 bg-gradient-to-r from-white via-[#FFF5EE] to-[#FFE9DC]/50 rounded-2xl border border-[#F1E7E0] shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Cpu size={28} className="text-[#FF6A00]" />
            <h1 className="text-2xl font-black text-[#211B18] tracking-tight">Collection Station Monitoring</h1>

            {/* Live SSE status indicator */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-xs bg-white">
              {isLive ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-emerald-700 text-[11px]">LIVE TELEMETRY</span>
                </>
              ) : (
                <span className="text-stone-600 text-[11px]">POLLING (15s)</span>
              )}
            </div>
          </div>

          <p className="text-xs text-[#817A75] mt-1 font-medium">
            Real-time station connectivity, authenticated heartbeat monitoring, offline queue telemetry, and device access control.
            {dataUpdatedAt ? (
              <> • Last checked: {new Date(dataUpdatedAt).toLocaleTimeString()}</>
            ) : null}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ClayButton
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            leftIcon={<RefreshCw size={14} />}
          >
            Refresh
          </ClayButton>
        </div>
      </div>

      {notice && (
        <ClayAlert
          type={notice.type}
          message={notice.message}
          action={
            <button onClick={() => setNotice(null)} className="text-xs underline font-bold cursor-pointer">
              Dismiss
            </button>
          }
        />
      )}

      {/* Station Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <ClayCard className="!p-3.5 text-center cursor-pointer hover:border-[#FF6A00] transition-colors" onClick={() => setStatusFilter('ALL')}>
          <p className="text-[10px] font-bold text-[#817A75] uppercase">Total Stations</p>
          <h4 className="text-2xl font-black text-[#211B18] mt-1">{totalCount}</h4>
          <p className="text-[10px] text-[#817A75]">Registered hardware</p>
        </ClayCard>

        <ClayCard className="!p-3.5 text-center cursor-pointer hover:border-emerald-500 transition-colors" onClick={() => setStatusFilter('ONLINE')}>
          <p className="text-[10px] font-bold text-emerald-700 uppercase">Online</p>
          <h4 className="text-2xl font-black text-emerald-700 mt-1">{onlineCount}</h4>
          <p className="text-[10px] text-emerald-600">&lt; 3m heartbeat</p>
        </ClayCard>

        <ClayCard className="!p-3.5 text-center cursor-pointer hover:border-amber-500 transition-colors" onClick={() => setStatusFilter('DEGRADED')}>
          <p className="text-[10px] font-bold text-amber-700 uppercase">Degraded</p>
          <h4 className="text-2xl font-black text-amber-700 mt-1">{degradedCount}</h4>
          <p className="text-[10px] text-amber-600">Lag / Queue &gt; 10</p>
        </ClayCard>

        <ClayCard className="!p-3.5 text-center cursor-pointer hover:border-stone-500 transition-colors" onClick={() => setStatusFilter('OFFLINE')}>
          <p className="text-[10px] font-bold text-stone-600 uppercase">Offline</p>
          <h4 className="text-2xl font-black text-stone-700 mt-1">{offlineCount}</h4>
          <p className="text-[10px] text-stone-500">&gt; 15m timeout</p>
        </ClayCard>

        <ClayCard className="!p-3.5 text-center cursor-pointer hover:border-red-500 transition-colors" onClick={() => setStatusFilter('BLOCKED')}>
          <p className="text-[10px] font-bold text-red-700 uppercase">Blocked</p>
          <h4 className="text-2xl font-black text-red-700 mt-1">{blockedCount}</h4>
          <p className="text-[10px] text-red-600">Access revoked</p>
        </ClayCard>

        <ClayCard className="!p-3.5 text-center">
          <p className="text-[10px] font-bold text-blue-700 uppercase">Pending Sync</p>
          <h4 className="text-2xl font-black text-blue-700 mt-1">{totalPendingQueue}</h4>
          <p className="text-[10px] text-blue-600">Queued in field</p>
        </ClayCard>
      </div>

      {/* Control Strip: Center Selector & Status Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white rounded-xl border border-[#F1E7E0] shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-[#817A75] mr-1.5">Status Filter:</span>
          {['ALL', 'ONLINE', 'DEGRADED', 'OFFLINE', 'BLOCKED'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === status
                  ? 'bg-[#FF6A00] text-white shadow-xs'
                  : 'bg-stone-100 text-[#817A75] hover:bg-stone-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-64">
          <ClaySelect
            options={centerOptions}
            value={selectedCenterId}
            onChange={(e) => setSelectedCenterId(e.target.value)}
          />
        </div>
      </div>

      {/* Security Architecture Notice */}
      <div className="p-4 bg-white rounded-xl border border-[#F1E7E0] flex items-start gap-3 shadow-xs text-xs text-[#817A75] leading-relaxed">
        <Shield size={18} className="text-[#FF6A00] shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-[#211B18]">Station Security & Authorization Policy: </span>
          Station online status is strictly derived from verified cryptographic device heartbeats (`last_seen_at` &lt; 3 mins).
          A station revoked or blocked by Dairy Admin is immediately barred from collection operations and cannot sync transactions.
          Station-reported queues represent operational telemetry and never supersede PostgreSQL financial records.
        </div>
      </div>

      {/* Stations Table */}
      <ClayCard className="!p-0 overflow-hidden">
        <ClayTable
          columns={columns}
          data={filteredStations}
          keyExtractor={(d) => d.deviceId}
          isLoading={isLoading}
          emptyMessage="No collection stations match the selected filters."
        />
      </ClayCard>

      {/* Block Station Confirmation Modal */}
      {blockingStation && (
        <ConfirmationModal
          isOpen={Boolean(blockingStation)}
          onClose={() => setBlockingStation(null)}
          onConfirm={(reason) =>
            blockMutation.mutate({ deviceId: blockingStation.deviceId, reason })
          }
          title={`Block Station: ${blockingStation.deviceName}`}
          message={`Are you sure you want to block station '${blockingStation.deviceName}' (${blockingStation.deviceId})? The hardware will be immediately revoked from recording collections and syncing transactions.`}
          confirmText="Block Hardware"
          variant="danger"
          requireReason={true}
          reasonLabel="Revocation Reason"
          reasonPlaceholder="Specify the reason for blocking this station (e.g., hardware tampering, counter reassignment, maintenance)..."
          isLoading={blockMutation.isPending}
        />
      )}

      {/* Unblock Station Confirmation Modal */}
      {unblockingStation && (
        <ConfirmationModal
          isOpen={Boolean(unblockingStation)}
          onClose={() => setUnblockingStation(null)}
          onConfirm={() => unblockMutation.mutate(unblockingStation.deviceId)}
          title={`Unblock Station: ${unblockingStation.deviceName}`}
          message={`Are you sure you want to restore and unblock station '${unblockingStation.deviceName}' (${unblockingStation.deviceId})? The station will be re-authorized to record collections.`}
          confirmText="Restore Station"
          variant="primary"
          isLoading={unblockMutation.isPending}
        />
      )}
    </div>
  )
}
