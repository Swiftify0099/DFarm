import React, { useEffect, useState } from 'react'
import type { CollectionTransaction } from '@/types'
import { localDB } from '@/services/local-storage'
import { ClayCard, ClayBadge, ClayTable } from '@/components/ui'
import { Milk, CheckCircle2, Clock, CloudOff } from 'lucide-react'

interface RecentIntakeTableProps {
  refreshTrigger?: number
}

export const RecentIntakeTable: React.FC<RecentIntakeTableProps> = ({ refreshTrigger = 0 }) => {
  const [transactions, setTransactions] = useState<CollectionTransaction[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadTxns = async () => {
      setIsLoading(true)
      try {
        const list = await localDB.getRecentTransactions()
        setTransactions(list)
      } catch (err) {
        console.error('Failed to load recent transactions:', err)
      } finally {
        setIsLoading(false)
      }
    }
    loadTxns()
  }, [refreshTrigger])

  const columns = [
    {
      key: 'time',
      header: 'Time',
      render: (txn: CollectionTransaction) => (
        <span className="font-mono text-xs text-text-muted">
          {new Date(txn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
    {
      key: 'transactionCode',
      header: 'Txn ID',
      render: (txn: CollectionTransaction) => (
        <span className="font-mono text-xs font-semibold text-text-primary">
          {txn.transactionCode}
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Patron',
      render: (txn: CollectionTransaction) => (
        <div>
          <span className="font-semibold text-text-primary text-xs block">{txn.customerName}</span>
          <span className="text-[10px] text-text-muted font-mono">{txn.customerCode}</span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Type',
      render: (txn: CollectionTransaction) => (
        <ClayBadge variant={txn.milkCategory === 'COW' ? 'warning' : 'primary'} size="sm">
          {txn.milkCategory}
        </ClayBadge>
      ),
    },
    {
      key: 'weight',
      header: 'Volume',
      render: (txn: CollectionTransaction) => (
        <span className="font-mono font-bold text-xs text-text-primary">
          {txn.weightLiters.toFixed(2)} L
        </span>
      ),
    },
    {
      key: 'quality',
      header: 'Fat / SNF',
      render: (txn: CollectionTransaction) => (
        <span className="font-mono text-xs text-text-secondary">
          {txn.fatPercentage.toFixed(1)}% / {txn.snfPercentage.toFixed(1)}%
        </span>
      ),
    },
    {
      key: 'rate',
      header: 'Rate/L',
      render: (txn: CollectionTransaction) => (
        <span className="font-mono text-xs text-text-primary">
          ₹{txn.appliedRatePerLiter.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Net Total',
      render: (txn: CollectionTransaction) => (
        <span className="font-mono font-bold text-xs text-primary-orange">
          ₹{txn.totalAmount.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'sync',
      header: 'Sync',
      render: (txn: CollectionTransaction) =>
        txn.syncStatus === 'SYNCED_CLOUD' ? (
          <div className="flex items-center space-x-1 text-emerald-600 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="text-[10px] font-medium">Synced</span>
          </div>
        ) : (
          <div className="flex items-center space-x-1 text-amber-600 text-xs">
            <CloudOff className="w-3.5 h-3.5" />
            <span className="text-[10px] font-medium">Queued</span>
          </div>
        ),
    },
  ]

  return (
    <ClayCard className="p-4 bg-cream flex flex-col space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Milk className="w-4 h-4 text-primary-orange" />
          <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide">
            Shift Intake Journal ({transactions.length} Records)
          </h3>
        </div>
        <span className="text-xs text-text-muted flex items-center space-x-1">
          <Clock className="w-3 h-3 text-text-muted" />
          <span>Real-time local journal</span>
        </span>
      </div>

      <ClayTable
        columns={columns}
        data={transactions}
        keyExtractor={(item) => item.id}
        isLoading={isLoading}
        emptyMessage="No milk intakes recorded in this active shift session yet."
      />
    </ClayCard>
  )
}
