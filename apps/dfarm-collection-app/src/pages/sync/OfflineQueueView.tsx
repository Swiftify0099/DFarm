import React, { useState, useEffect, useCallback } from 'react'
import type { OfflineQueueItem, QueueSummary } from '@/types'
import { localDB } from '@/services/local-storage'
import { useHardware } from '@/context/HardwareContext'
import { ClayCard, ClayButton, ClayBadge, ClayTable } from '@/components/ui'
import { SyncCloudVisual } from '@/assets/illustrations'
import {
  RefreshCw,
  Wifi,
  WifiOff,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  ShieldAlert,
  ServerCrash,
} from 'lucide-react'

export const OfflineQueueView: React.FC = () => {
  const {
    isNetworkOnline,
    setNetworkOnline,
    refreshOfflineCount,
    syncStatus,
    networkStatus,
    triggerSync,
  } = useHardware()

  const [queueItems, setQueueItems] = useState<OfflineQueueItem[]>([])
  const [queueSummary, setQueueSummary] = useState<QueueSummary>({
    total: 0,
    pending: 0,
    syncing: 0,
    synced: 0,
    retryable: 0,
    rejected: 0,
    manualReview: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStatusNote, setSyncStatusNote] = useState<string | null>(null)

  const loadQueue = useCallback(async () => {
    setIsLoading(true)
    try {
      const [items, summary] = await Promise.all([
        localDB.getOfflineQueue(),
        localDB.getQueueSummary(),
      ])
      setQueueItems(items)
      setQueueSummary(summary)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadQueue()
  }, [loadQueue, syncStatus.lastSyncedAt])

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
      await triggerSync()
      await loadQueue()
      await refreshOfflineCount()
      setSyncStatusNote(
        `Sync completed. Engine state: ${syncStatus.state}. Records synced in last batch: ${syncStatus.recordsSyncedLastRun}.`
      )
    } catch (err: any) {
      alert(`Sync error: ${err.message || 'Unknown sync error'}`)
    } finally {
      setIsSyncing(false)
    }
  }

  const getStatusBadge = (item: OfflineQueueItem) => {
    const st = (item.syncQueueStatus || item.status) as string
    let variant: 'success' | 'warning' | 'danger' | 'info' | 'secondary' = 'warning'
    let label: string = st

    switch (st) {
      case 'SYNCED':
      case 'SYNCED_CLOUD':
        variant = 'success'
        label = 'SYNCED'
        break
      case 'SYNCING':
        variant = 'info'
        label = 'SYNCING'
        break
      case 'PENDING':
      case 'QUEUED':
        variant = 'warning'
        label = 'PENDING'
        break
      case 'RETRYABLE':
        variant = 'warning'
        label = 'RETRYABLE'
        break
      case 'REJECTED':
      case 'FAILED':
        variant = 'danger'
        label = 'REJECTED'
        break
      case 'MANUAL_REVIEW':
        variant = 'danger'
        label = 'REVIEW'
        break
      case 'AUTH_REQUIRED':
        variant = 'danger'
        label = 'AUTH REQUIRED'
        break
      case 'DEVICE_BLOCKED':
        variant = 'danger'
        label = 'BLOCKED'
        break
      default:
        variant = 'secondary'
    }

    return (
      <div className="flex flex-col items-start gap-0.5">
        <ClayBadge variant={variant as any} size="sm">
          {label}
        </ClayBadge>
        {item.errorCode && (
          <span className="font-mono text-[9px] text-rose-700 font-semibold">
            {item.errorCode}
          </span>
        )}
      </div>
    )
  }

  const columns = [
    {
      key: 'eventId',
      header: 'Event ID / UUID',
      render: (item: OfflineQueueItem) => (
        <div className="font-mono text-xs">
          <span className="font-semibold text-text-primary block">{item.eventId}</span>
          <span className="text-[10px] text-text-muted">
            {(item.clientIntakeUuid || item.transactionId || '').substring(0, 16)}...
          </span>
        </div>
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
        <div className="font-mono text-xs">
          <span className="text-text-primary font-semibold">{item.retryCount || 0}</span>
          {(item.nextAttemptAt || item.nextRetryAt) && (
            <span className="text-[9px] text-text-muted block">
              Next: {new Date((item.nextAttemptAt || item.nextRetryAt)!).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Queue Status',
      render: (item: OfflineQueueItem) => getStatusBadge(item),
    },
    {
      key: 'notes',
      header: 'Diagnostic Reason',
      render: (item: OfflineQueueItem) => (
        <span className="text-xs text-text-muted line-clamp-1 max-w-[200px]" title={item.errorReason || ''}>
          {item.errorReason || (item.syncQueueStatus === 'SYNCED' ? 'Synchronized' : '—')}
        </span>
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
            Zero data loss buffer powered by local IndexedDB. All transactions are queued automatically before network dispatch.
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
            disabled={isSyncing || syncStatus.state === 'SYNCING' || !isNetworkOnline}
            className="flex items-center space-x-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing || syncStatus.state === 'SYNCING' ? 'animate-spin' : ''}`} />
            <span>
              {isSyncing || syncStatus.state === 'SYNCING' ? 'Flushing Queue...' : 'Flush Queue Now'}
            </span>
          </ClayButton>
        </div>
      </div>

      {/* Sync Success / Status Banner */}
      {syncStatusNote && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center space-x-2 text-emerald-800 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span className="font-semibold">{syncStatusNote}</span>
        </div>
      )}

      {/* Engine Error Alert if any */}
      {syncStatus.lastErrorMessage && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-center space-x-2 text-amber-900 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span className="font-semibold">
            Sync Engine Notice: {syncStatus.lastErrorMessage}
            {(syncStatus.currentBackoffSeconds ?? 0) > 0 && ` (Retry backoff: ${syncStatus.currentBackoffSeconds}s)`}
          </span>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {/* Pending & Retryable */}
        <ClayCard className="p-4 bg-cream flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-peach flex items-center justify-center text-primary-orange">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-bold text-text-secondary uppercase">Pending Queue</span>
            <p className="text-2xl font-mono font-bold text-text-primary mt-0.5">
              {queueSummary.pending + queueSummary.retryable}
            </p>
            <span className="text-[10px] text-text-muted">
              {queueSummary.pending} fresh • {queueSummary.retryable} retryable
            </span>
          </div>
        </ClayCard>

        {/* Sync Engine State */}
        <ClayCard className="p-4 bg-cream flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-peach flex items-center justify-center text-primary-orange">
            <RefreshCw className={`w-5 h-5 ${syncStatus.state === 'SYNCING' ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <span className="text-xs font-bold text-text-secondary uppercase">Sync Engine</span>
            <p className="text-sm font-bold text-text-primary mt-0.5">
              {syncStatus.state}
            </p>
            <span className="text-[10px] text-text-muted">
              {syncStatus.lastSyncedAt
                ? `Last sync: ${new Date(syncStatus.lastSyncedAt).toLocaleTimeString()}`
                : 'No sync completed yet'}
            </span>
          </div>
        </ClayCard>

        {/* Network Reachability State */}
        <ClayCard className="p-4 bg-cream flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-peach flex items-center justify-center text-primary-orange">
            {networkStatus === 'ONLINE' ? (
              <Wifi className="w-5 h-5 text-emerald-600" />
            ) : (
              <WifiOff className="w-5 h-5 text-rose-600" />
            )}
          </div>
          <div>
            <span className="text-xs font-bold text-text-secondary uppercase">Network State</span>
            <p
              className={`text-sm font-bold mt-0.5 ${
                networkStatus === 'ONLINE'
                  ? 'text-emerald-700'
                  : networkStatus === 'DEVICE_BLOCKED'
                  ? 'text-rose-900'
                  : 'text-rose-700'
              }`}
            >
              {networkStatus}
            </p>
            <span className="text-[10px] text-text-muted">
              {networkStatus === 'ONLINE' ? 'Backend authenticated' : 'Offline local queueing'}
            </span>
          </div>
        </ClayCard>

        {/* Rejection / Problem count */}
        <ClayCard className="p-4 bg-cream flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-peach flex items-center justify-center text-rose-600">
            {queueSummary.rejected > 0 ? (
              <XCircle className="w-5 h-5 text-rose-600" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            )}
          </div>
          <div>
            <span className="text-xs font-bold text-text-secondary uppercase">Failed / Review</span>
            <p className="text-2xl font-mono font-bold text-text-primary mt-0.5">
              {queueSummary.rejected + queueSummary.manualReview}
            </p>
            <span className="text-[10px] text-text-muted">
              {queueSummary.rejected} rejected • {queueSummary.manualReview} review
            </span>
          </div>
        </ClayCard>
      </div>

      {/* Queue Items Table */}
      <ClayCard className="p-4 bg-cream">
        <div className="flex items-center justify-between pb-3 mb-2 border-b border-border-subtle">
          <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide">
            IndexedDB Offline Operational Journal
          </h3>
          <span className="text-xs text-text-muted">
            Monotonic queue • Idempotent sync gateway • Multi-tab protected
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
