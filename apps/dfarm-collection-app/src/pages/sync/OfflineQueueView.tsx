import React, { useState, useEffect } from 'react'
import type { OfflineQueueItem } from '@/types'
import { localDB } from '@/services/local-storage'
import { useHardware } from '@/context/HardwareContext'
import { syncApi } from '@/api/client'
import { ClayCard, ClayButton, ClayBadge, ClayTable } from '@/components/ui'
import { SyncCloudVisual } from '@/assets/illustrations'
import { RefreshCw, Wifi, WifiOff, CheckCircle2, Clock, Trash2, ArrowUpRight } from 'lucide-react'

export const OfflineQueueView: React.FC = () => {
  const { isNetworkOnline, setNetworkOnline, refreshOfflineCount } = useHardware()
  const [queueItems, setQueueItems] = useState<OfflineQueueItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStatusNote, setSyncStatusNote] = useState<string | null>(null)

  useEffect(() => {
    loadQueue()
  }, [])

  const loadQueue = async () => {
    setIsLoading(true)
    try {
      const items = await localDB.getOfflineQueue()
      setQueueItems(items)
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggleNetwork = () => {
    setNetworkOnline(!isNetworkOnline)
  }

  const handleSyncNow = async () => {
    if (!isNetworkOnline) {
      alert('Network relay is currently offline. Please restore connectivity first.')
      return
    }

    setIsSyncing(true)
    setSyncStatusNote(null)

    try {
      const items = await localDB.getOfflineQueue()
      if (items.length === 0) {
        setSyncStatusNote('Offline queue is empty. Zero records pending sync.')
        return
      }

      // Submit batch to authoritative server sync endpoint
      const batchPayload = {
        deviceId: 'KIOSK_MAIN',
        transactions: items.map((item) => ({
          clientIntakeUuid: item.transactionId || item.transaction.id,
          sessionCode: item.transaction.sessionId,
          customerId: item.transaction.customerId,
          milkCategory: item.transaction.milkCategory as 'COW' | 'BUFFALO',
          weightLiters: item.transaction.weightLiters,
          fatPercentage: item.transaction.fatPercentage,
          snfPercentage: item.transaction.snfPercentage,
          clrDensity: item.transaction.clrDensity,
          identificationMethod: (item.transaction.identificationMethod as any) || 'FACE_YUNET_SFACE',
          idempotencyKey: `SYNC-${item.transactionId || item.transaction.id}`,
        })),
      }

      const syncResult = await syncApi.pushBatch(batchPayload)

      let flushedCount = 0
      for (const resItem of syncResult.items) {
        if (resItem.success) {
          const matching = items.find(
            (i) => (i.transactionId || i.transaction.id) === resItem.clientIntakeUuid
          )
          if (matching) {
            await localDB.removeQueueItem(matching.eventId)
            flushedCount++
          }
        }
      }

      await loadQueue()
      await refreshOfflineCount()
      setSyncStatusNote(
        `Sync completed: ${flushedCount} flushed successfully, ${syncResult.failed} failed/requires review.`
      )
    } catch (err: any) {
      alert(`Sync error: ${err.message || 'Unknown error'}`)
    } finally {
      setIsSyncing(false)
    }
  }

  const columns = [
    {
      key: 'eventId',
      header: 'Event ID',
      render: (item: OfflineQueueItem) => (
        <span className="font-mono text-xs font-semibold text-text-primary">
          {item.eventId}
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Patron',
      render: (item: OfflineQueueItem) => (
        <div>
          <span className="font-semibold text-xs text-text-primary block">{item.customerName}</span>
          <span className="font-mono text-[10px] text-text-muted">{item.customerCode}</span>
        </div>
      ),
    },
    {
      key: 'time',
      header: 'Queued At',
      render: (item: OfflineQueueItem) => (
        <span className="font-mono text-xs text-text-muted">
          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
    {
      key: 'volume',
      header: 'Volume',
      render: (item: OfflineQueueItem) => (
        <span className="font-mono font-bold text-xs text-text-primary">
          {item.transaction.weightLiters.toFixed(2)} L
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Total Value',
      render: (item: OfflineQueueItem) => (
        <span className="font-mono font-bold text-xs text-primary-orange">
          ₹{item.transaction.totalAmount.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'retries',
      header: 'Retries',
      render: (item: OfflineQueueItem) => (
        <span className="font-mono text-xs text-text-muted">{item.retryCount}</span>
      ),
    },
    {
      key: 'status',
      header: 'Queue Status',
      render: (item: OfflineQueueItem) => (
        <ClayBadge
          variant={item.status === 'QUEUED' ? 'warning' : 'success'}
          size="sm"
        >
          {item.status}
        </ClayBadge>
      ),
    },
  ]

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <SyncCloudVisual size={24} />
            <h2 className="text-xl font-bold text-text-primary">Offline Queue & Cloud Relay (F5)</h2>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Zero data loss buffer powered by local IndexedDB. All transactions are queued automatically when offline.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Network Simulator Toggle */}
          <ClayButton
            variant={isNetworkOnline ? 'outline' : 'danger'}
            size="sm"
            onClick={handleToggleNetwork}
            className="flex items-center space-x-1.5 text-xs"
            title="Toggle network online/offline state to test queueing"
          >
            {isNetworkOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                <span>Simulate Offline</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-rose-600" />
                <span>Restore Online</span>
              </>
            )}
          </ClayButton>

          {/* Sync CTA */}
          <ClayButton
            variant="primary"
            size="sm"
            onClick={handleSyncNow}
            disabled={isSyncing || queueItems.length === 0 || !isNetworkOnline}
            className="flex items-center space-x-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Flushing Queue...' : 'Flush Queue Now'}</span>
          </ClayButton>
        </div>
      </div>

      {/* Sync Success Banner */}
      {syncStatusNote && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center space-x-2 text-emerald-800 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span className="font-semibold">{syncStatusNote}</span>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ClayCard className="p-4 bg-cream flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-peach flex items-center justify-center text-primary-orange">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-bold text-text-secondary uppercase">Pending Records</span>
            <p className="text-2xl font-mono font-bold text-text-primary mt-0.5">
              {queueItems.length}
            </p>
          </div>
        </ClayCard>

        <ClayCard className="p-4 bg-cream flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-peach flex items-center justify-center text-primary-orange">
            {isNetworkOnline ? (
              <Wifi className="w-5 h-5 text-emerald-600" />
            ) : (
              <WifiOff className="w-5 h-5 text-rose-600" />
            )}
          </div>
          <div>
            <span className="text-xs font-bold text-text-secondary uppercase">Network Relay State</span>
            <p
              className={`text-sm font-bold mt-0.5 ${
                isNetworkOnline ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {isNetworkOnline ? 'ONLINE (HTTPS Relay Active)' : 'OFFLINE (Local Queue Mode)'}
            </p>
          </div>
        </ClayCard>

        <ClayCard className="p-4 bg-cream flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-peach flex items-center justify-center text-primary-orange">
            <CheckCircle2 className="w-5 h-5 text-primary-orange" />
          </div>
          <div>
            <span className="text-xs font-bold text-text-secondary uppercase">Local Datastore</span>
            <p className="text-xs font-mono font-semibold text-text-primary mt-0.5">
              IndexedDB: dfarm_collection_local_db
            </p>
          </div>
        </ClayCard>
      </div>

      {/* Queue Items Table */}
      <ClayCard className="p-4 bg-cream">
        <div className="flex items-center justify-between pb-3 mb-2 border-b border-border-subtle">
          <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide">
            IndexedDB Offline Buffer
          </h3>
          <span className="text-xs text-text-muted">
            Monotonic monotonic queue • Idempotent sync
          </span>
        </div>

        <ClayTable
          columns={columns}
          data={queueItems}
          keyExtractor={(item) => item.eventId}
          isLoading={isLoading}
          emptyMessage="Offline buffer is clean. No transactions awaiting synchronization."
        />
      </ClayCard>
    </div>
  )
}
