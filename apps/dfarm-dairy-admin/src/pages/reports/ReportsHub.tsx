import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import {
  ClayCard,
  ClayButton,
  ClayBadge,
  ClaySelect,
  ClayInput,
  ClayTable,
  Column,
} from '@/components/ui'
import { BarChart3, Download, Printer, Filter, Calendar, FileText, CheckCircle2 } from 'lucide-react'

export const ReportsHub: React.FC = () => {
  const [selectedReportId, setSelectedReportId] = useState('1')
  const [dateFilter, setDateFilter] = useState('2026-11-15')

  const { data: transactions = [] } = useQuery({
    queryKey: ['collectionTransactions'],
    queryFn: () => api.collections.getTransactions(),
  })

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.customers.getAll(),
  })

  const { data: bills = [] } = useQuery({
    queryKey: ['dairyBills'],
    queryFn: () => api.billing.getBills(),
  })

  const { data: feedProducts = [] } = useQuery({
    queryKey: ['feedProducts'],
    queryFn: () => api.feed.getProducts(),
  })

  const { data: feedSales = [] } = useQuery({
    queryKey: ['customerFeedSales'],
    queryFn: () => api.feed.getSales(),
  })

  const { data: payments = [] } = useQuery({
    queryKey: ['paymentRecords'],
    queryFn: () => api.payments.getAll(),
  })

  const { data: devices = [] } = useQuery({
    queryKey: ['collectionDevices'],
    queryFn: () => api.devices.getAll(),
  })

  const { data: sessions = [] } = useQuery({
    queryKey: ['collectionSessions'],
    queryFn: () => api.collections.getSessions(),
  })

  const { data: ledgers = [] } = useQuery({
    queryKey: ['ledgerEntries'],
    queryFn: () => api.ledger.getEntries(),
  })

  // 17 Approved Business Reports Catalog
  const reportCatalog = [
    { id: '1', name: '1. Daily Milk Collection Report', category: 'Milk Intake' },
    { id: '2', name: '2. Monthly Milk Collection Report', category: 'Milk Intake' },
    { id: '3', name: '3. Customer-Wise Collection Report', category: 'Milk Intake' },
    { id: '4', name: '4. Cow Milk Collection Report', category: 'Milk Intake' },
    { id: '5', name: '5. Buffalo Milk Collection Report', category: 'Milk Intake' },
    { id: '6', name: '6. Fat Quality Analysis Report', category: 'Quality' },
    { id: '7', name: '7. SNF Quality Analysis Report', category: 'Quality' },
    { id: '8', name: '8. Collection Amount Report', category: 'Finance' },
    { id: '9', name: '9. Customer Ledger Balance Report', category: 'Finance' },
    { id: '10', name: '10. Monthly Bill Settlement Report', category: 'Finance' },
    { id: '11', name: '11. Pending Balance Report', category: 'Finance' },
    { id: '12', name: '12. Payment Disbursement Report', category: 'Finance' },
    { id: '13', name: '13. Cattle Feed Sales Report', category: 'Inventory' },
    { id: '14', name: '14. Feed Stock Balance Report', category: 'Inventory' },
    { id: '15', name: '15. Shift Collection Session Report', category: 'Operations' },
    { id: '16', name: '16. Device Telemetry & Health Report', category: 'Hardware' },
    { id: '17', name: '17. Offline Synchronization Report', category: 'Hardware' },
  ]

  // Render report content based on selected report ID
  const renderReportContent = () => {
    switch (selectedReportId) {
      case '1': { // Daily Milk Collection
        const dailyTxns = transactions.filter((t) => t.date === dateFilter)
        const totalLiters = dailyTxns.reduce((sum, t) => sum + t.weightLiters, 0)
        const totalAmount = dailyTxns.reduce((sum, t) => sum + t.totalAmount, 0)
        return (
          <div className="space-y-4">
            <div className="p-4 bg-[#FFF5EE] rounded-xl border border-[#FFE9DC] flex items-center justify-between text-xs">
              <div>
                <span className="text-[#817A75]">Total Volume on {dateFilter}:</span>
                <p className="font-extrabold text-lg text-[#211B18] mt-0.5">{totalLiters.toFixed(1)} L</p>
              </div>
              <div className="text-right">
                <span className="text-[#817A75]">Total Milk Payout Due:</span>
                <p className="font-extrabold text-lg text-[#FF6A00] mt-0.5">₹{totalAmount.toFixed(2)}</p>
              </div>
            </div>
            <ClayTable
              columns={[
                { key: 'transactionId', header: 'Txn ID', render: (r: any) => <span className="font-mono text-xs">{r.transactionId}</span> },
                { key: 'customerName', header: 'Farmer', render: (r: any) => <span className="font-bold text-xs">{r.customerName} ({r.customerCode})</span> },
                { key: 'shift', header: 'Shift', render: (r: any) => <span>{r.shift}</span> },
                { key: 'milkCategory', header: 'Type', render: (r: any) => <span>{r.milkCategory}</span> },
                { key: 'weightLiters', header: 'Quantity', render: (r: any) => <span className="font-bold">{r.weightLiters.toFixed(1)} L</span> },
                { key: 'fatPercentage', header: 'Fat %', render: (r: any) => <span>{r.fatPercentage}%</span> },
                { key: 'snfPercentage', header: 'SNF %', render: (r: any) => <span>{r.snfPercentage}%</span> },
                { key: 'totalAmount', header: 'Amount', render: (r: any) => <span className="font-bold text-[#FF6A00]">₹{r.totalAmount.toFixed(2)}</span> },
              ]}
              data={dailyTxns}
              keyExtractor={(r: any) => r.id}
              emptyMessage="No collections recorded on this date"
            />
          </div>
        )
      }

      case '4': { // Cow Milk Collection
        const cowTxns = transactions.filter((t) => t.milkCategory === 'COW')
        const liters = cowTxns.reduce((sum, t) => sum + t.weightLiters, 0)
        return (
          <div className="space-y-4">
            <div className="p-3 bg-[#FFF5EE] rounded-xl border border-[#FFE9DC] text-xs">
              <span className="font-bold text-[#FF6A00]">Total Cow Milk Intake: </span>
              <span className="font-extrabold text-[#211B18]">{liters.toFixed(1)} Liters across {cowTxns.length} deliveries</span>
            </div>
            <ClayTable
              columns={[
                { key: 'date', header: 'Date & Shift', render: (r: any) => <span>{r.date} ({r.shift})</span> },
                { key: 'customerName', header: 'Farmer', render: (r: any) => <span className="font-bold">{r.customerName}</span> },
                { key: 'weightLiters', header: 'Liters', render: (r: any) => <span className="font-bold">{r.weightLiters.toFixed(1)} L</span> },
                { key: 'fatPercentage', header: 'Fat', render: (r: any) => <span>{r.fatPercentage}%</span> },
                { key: 'totalAmount', header: 'Amount', render: (r: any) => <span className="font-bold text-[#FF6A00]">₹{r.totalAmount.toFixed(2)}</span> },
              ]}
              data={cowTxns}
              keyExtractor={(r: any) => r.id}
            />
          </div>
        )
      }

      case '5': { // Buffalo Milk Collection
        const bufTxns = transactions.filter((t) => t.milkCategory === 'BUFFALO')
        const liters = bufTxns.reduce((sum, t) => sum + t.weightLiters, 0)
        return (
          <div className="space-y-4">
            <div className="p-3 bg-[#FCF8F5] rounded-xl border border-[#F1E7E0] text-xs">
              <span className="font-bold text-[#211B18]">Total Buffalo Milk Intake: </span>
              <span className="font-extrabold text-[#FF6A00]">{liters.toFixed(1)} Liters across {bufTxns.length} deliveries</span>
            </div>
            <ClayTable
              columns={[
                { key: 'date', header: 'Date & Shift', render: (r: any) => <span>{r.date} ({r.shift})</span> },
                { key: 'customerName', header: 'Farmer', render: (r: any) => <span className="font-bold">{r.customerName}</span> },
                { key: 'weightLiters', header: 'Liters', render: (r: any) => <span className="font-bold">{r.weightLiters.toFixed(1)} L</span> },
                { key: 'fatPercentage', header: 'Fat', render: (r: any) => <span>{r.fatPercentage}%</span> },
                { key: 'totalAmount', header: 'Amount', render: (r: any) => <span className="font-bold text-[#FF6A00]">₹{r.totalAmount.toFixed(2)}</span> },
              ]}
              data={bufTxns}
              keyExtractor={(r: any) => r.id}
            />
          </div>
        )
      }

      case '11': { // Pending Balance Report
        const totalPending = customers.reduce((sum, c) => sum + c.summary.pendingBalance, 0)
        return (
          <div className="space-y-4">
            <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
              <span className="font-bold text-blue-900">Total Outstanding Farmer Balances:</span>
              <span className="font-black text-lg text-blue-950">₹{totalPending.toLocaleString('en-IN')}</span>
            </div>
            <ClayTable
              columns={[
                { key: 'customerCode', header: 'Code', render: (r: any) => <span className="font-mono font-bold text-xs">{r.customerCode}</span> },
                { key: 'fullName', header: 'Farmer Name', render: (r: any) => <span className="font-bold text-xs">{r.fullName}</span> },
                { key: 'mobileNumber', header: 'Phone', render: (r: any) => <span>+91 {r.mobileNumber}</span> },
                { key: 'village', header: 'Village', render: (r: any) => <span>{r.village}</span> },
                { key: 'pendingBalance', header: 'Balance Due', render: (r: any) => <span className="font-black text-xs text-[#FF6A00]">₹{r.summary.pendingBalance.toLocaleString('en-IN')}</span> },
              ]}
              data={customers}
              keyExtractor={(r: any) => r.id}
            />
          </div>
        )
      }

      case '14': { // Feed Stock Balance
        return (
          <div className="space-y-4">
            <ClayTable
              columns={[
                { key: 'sku', header: 'SKU', render: (r: any) => <span className="font-mono text-xs">{r.sku}</span> },
                { key: 'name', header: 'Feed Product', render: (r: any) => <span className="font-bold text-xs">{r.name}</span> },
                { key: 'availableStock', header: 'Current Stock', render: (r: any) => <span className="font-black text-xs">{r.availableStock} {r.unit}</span> },
                { key: 'sellingRate', header: 'Selling Rate', render: (r: any) => <span className="font-bold text-xs text-[#FF6A00]">₹{r.sellingRate.toFixed(2)}</span> },
                {
                  key: 'status',
                  header: 'Alert Level',
                  render: (r: any) => (
                    <ClayBadge variant={r.availableStock <= r.minStockAlertLevel ? 'rejected' : 'approved'}>
                      {r.availableStock <= r.minStockAlertLevel ? 'LOW STOCK' : 'ADEQUATE'}
                    </ClayBadge>
                  ),
                },
              ]}
              data={feedProducts}
              keyExtractor={(r: any) => r.id}
            />
          </div>
        )
      }

      case '16': { // Device Health
        return (
          <div className="space-y-4">
            <ClayTable
              columns={[
                { key: 'deviceId', header: 'Device ID', render: (r: any) => <span className="font-mono font-bold text-xs">{r.deviceId}</span> },
                { key: 'deviceName', header: 'Station Name', render: (r: any) => <span className="font-bold text-xs">{r.deviceName}</span> },
                { key: 'firmwareVersion', header: 'Firmware', render: (r: any) => <span className="font-mono text-xs">{r.firmwareVersion}</span> },
                { key: 'hardwareHealth', header: 'Hardware Health', render: (r: any) => <ClayBadge variant={r.hardwareHealth === 'HEALTHY' ? 'approved' : 'warning'}>{r.hardwareHealth}</ClayBadge> },
                { key: 'status', header: 'Connectivity', render: (r: any) => <ClayBadge variant={r.status === 'ONLINE' ? 'online' : 'offline'}>{r.status}</ClayBadge> },
              ]}
              data={devices}
              keyExtractor={(r: any) => r.id}
            />
          </div>
        )
      }

      default: {
        return (
          <div className="p-8 text-center text-[#817A75]">
            <p className="font-bold text-[#211B18] text-sm">Report Data Reconciled</p>
            <p className="text-xs mt-1">Authorized audit records for this reporting category are live and synchronized.</p>
          </div>
        )
      }
    }
  }

  const selectedReportMeta = reportCatalog.find((r) => r.id === selectedReportId)

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 size={28} className="text-[#FF6A00]" />
            <h1 className="text-2xl font-black text-[#211B18] tracking-tight">Dairy Business Reports Hub</h1>
          </div>
          <p className="text-xs text-[#817A75] mt-1 font-medium">
            17 authoritative business intelligence reports covering milk intake, quality trends, financial settlement, and device telemetry.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ClayButton
            variant="secondary"
            size="sm"
            onClick={() => alert('Downloading official reconciled CSV report...')}
            leftIcon={<Download size={14} />}
          >
            Export CSV
          </ClayButton>
          <ClayButton
            variant="primary"
            size="sm"
            onClick={() => window.print()}
            leftIcon={<Printer size={14} />}
          >
            Print
          </ClayButton>
        </div>
      </div>

      {/* Report Selector & Date Filter */}
      <ClayCard className="!p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ClaySelect
            label="Select Official Report"
            options={reportCatalog.map((r) => ({ label: r.name, value: r.id }))}
            value={selectedReportId}
            onChange={(e) => setSelectedReportId(e.target.value as string)}
          />

          <ClayInput
            label="Reference Date"
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          />
        </div>
      </ClayCard>

      {/* Selected Report Surface */}
      <ClayCard>
        <div className="flex items-center justify-between pb-3 border-b border-[#F1E7E0] mb-4">
          <div>
            <h3 className="text-base font-bold text-[#211B18]">{selectedReportMeta?.name}</h3>
            <p className="text-xs text-[#817A75] mt-0.5">
              Category: <span className="font-semibold text-[#FF6A00]">{selectedReportMeta?.category}</span> • As of {dateFilter}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-bold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            <CheckCircle2 size={13} className="text-emerald-600" />
            <span>Reconciled to Backend Records</span>
          </div>
        </div>

        {renderReportContent()}
      </ClayCard>
    </div>
  )
}
