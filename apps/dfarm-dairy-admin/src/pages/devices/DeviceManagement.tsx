import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import type { CollectionDevice } from '@/types'
import {
  ClayCard,
  ClayButton,
  ClayBadge,
  ClayModal,
  ClayAlert,
  ClayTable,
  Column,
} from '@/components/ui'
import { IotMachineVisual, FaceBiometricVisual } from '@/assets/illustrations'
import { Cpu, RefreshCw, Wifi, WifiOff, AlertTriangle, Shield, CheckCircle2 } from 'lucide-react'

export const DeviceManagement: React.FC = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [notice, setNotice] = useState<{ type: 'success' | 'danger'; message: string } | null>(null)

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['collectionDevices'],
    queryFn: () => api.devices.getAll(),
  })

  // Sync Mutation
  const syncMutation = useMutation({
    mutationFn: (deviceId: string) => api.devices.sync(deviceId, user?.fullName || 'Dairy Admin'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collectionDevices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] })
      setNotice({
        type: 'success',
        message: 'Cloud sync command dispatched to collection hardware. Offline queue reconciled.',
      })
    },
    onError: (err: any) => {
      setNotice({ type: 'danger', message: err.message || 'Failed to dispatch device sync' })
    },
  })

  const columns: Column<CollectionDevice>[] = [
    {
      key: 'deviceName',
      header: 'Device Station',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <IotMachineVisual size={24} />
          <div>
            <span className="font-bold text-sm text-[#211B18]">{r.deviceName}</span>
            <p className="text-[10px] text-[#817A75] font-mono mt-0.5">
              ID: {r.deviceId} • {r.deviceType}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'location',
      header: 'Assigned Counter',
      render: (r) => (
        <div className="text-xs">
          <p className="font-semibold text-[#211B18]">{r.locationAssigned}</p>
          <p className="text-[10px] text-[#817A75] font-mono">IP: {r.ipAddress}</p>
        </div>
      ),
    },
    {
      key: 'modelCache',
      header: 'Biometric Model Cache',
      render: (r) => (
        <div className="flex items-center gap-1.5 text-xs">
          <FaceBiometricVisual size={16} />
          <div>
            <p className="font-mono font-bold text-[#211B18] text-[11px]">{r.faceModelCacheVersion}</p>
            <p className="text-[10px] text-emerald-700 font-semibold">Templates Synced</p>
          </div>
        </div>
      ),
    },
    {
      key: 'syncStatus',
      header: 'Last Cloud Sync',
      render: (r) => (
        <div className="text-xs">
          <p className="font-semibold text-[#211B18]">
            {new Date(r.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          {r.pendingOfflineSyncEvents > 0 ? (
            <p className="text-[10px] text-amber-700 font-bold flex items-center gap-0.5">
              <AlertTriangle size={11} /> {r.pendingOfflineSyncEvents} offline queue events
            </p>
          ) : (
            <p className="text-[10px] text-emerald-700 font-semibold">Queue clean (0 pending)</p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Connection',
      render: (r) => (
        <ClayBadge
          variant={r.status === 'ONLINE' ? 'online' : 'offline'}
          icon={r.status === 'ONLINE' ? <Wifi size={12} /> : <WifiOff size={12} />}
        >
          {r.status}
        </ClayBadge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <ClayButton
          variant="secondary"
          size="sm"
          onClick={() => syncMutation.mutate(r.id)}
          isLoading={syncMutation.isPending}
          leftIcon={<RefreshCw size={12} />}
        >
          Sync Now
        </ClayButton>
      ),
    },
  ]

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Cpu size={28} className="text-[#FF6A00]" />
            <h1 className="text-2xl font-black text-[#211B18] tracking-tight">Collection Hardware & Sync</h1>
          </div>
          <p className="text-xs text-[#817A75] mt-1 font-medium">
            Smart analyzer kiosks, weighing scale telemetry, biometric template cache distribution, and offline synchronization queues.
          </p>
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

      {/* Rules Notice */}
      <div className="p-4 bg-white rounded-xl border border-[#F1E7E0] flex items-start gap-3 shadow-xs text-xs text-[#817A75] leading-relaxed">
        <Shield size={18} className="text-[#FF6A00] shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-[#211B18]">Local Offline Resilience Architecture: </span>
          Collection machines operate locally during rural internet outages. All transactions, lactometer readings, and
          RFID/Face recognitions are queued securely with local digital signatures and synchronized to the central dairy
          tenant upon link reconnection.
        </div>
      </div>

      {/* Table */}
      <ClayCard className="!p-0 overflow-hidden">
        <ClayTable
          columns={columns}
          data={devices}
          keyExtractor={(d) => d.id}
          isLoading={isLoading}
          emptyMessage="No collection devices enrolled"
        />
      </ClayCard>
    </div>
  )
}
