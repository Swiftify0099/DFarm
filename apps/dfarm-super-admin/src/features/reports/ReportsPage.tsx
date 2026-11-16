import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { apiClient } from '@/api/client'
import { ClayCard } from '@/components/ui/ClayCard'
import { ClaySelect } from '@/components/ui/ClaySelect'
import { ClayInput } from '@/components/ui/ClayInput'
import { ClayButton } from '@/components/ui/ClayButton'
import { ClayTable, type ColumnDef } from '@/components/ui/ClayTable'
import { useAuth } from '@/context/AuthContext'
import type { ReportType, ReportDataRow } from '@/types'
import { formatDate } from '@/utils/formatters'
import {
  BarChart3,
  Download,
  Calendar,
  Building2,
  FileSpreadsheet,
  CheckCircle2,
  FileText,
} from 'lucide-react'

export const ReportsPage: React.FC = () => {
  const { user } = useAuth()

  const [reportType, setReportType] = useState<ReportType>('dairy_growth')
  const [startDate, setStartDate] = useState('2026-01-01')
  const [endDate, setEndDate] = useState('2026-11-30')

  const { data: reportResult, isLoading, refetch } = useQuery({
    queryKey: queryKeys.reports.generated({ reportType, startDate, endDate }),
    queryFn: () => {
      if (!user) throw new Error('Unauthenticated')
      return apiClient.generateReport(
        {
          reportType,
          startDate,
          endDate,
        },
        user
      )
    },
    enabled: !!user,
  })

  // Export to CSV
  const handleExportCsv = () => {
    if (!reportResult?.rows || reportResult.rows.length === 0) return

    const headers = ['Record ID', 'Timestamp', 'Tenant Code', 'Tenant Name', 'Metric / Event', 'Region / Detail', 'Status', 'Value', 'Notes']
    const csvRows = [headers.join(',')]

    reportResult.rows.forEach((r) => {
      const row = [
        `"${r.id}"`,
        `"${r.date}"`,
        `"${r.dairyCode || ''}"`,
        `"${(r.dairyName || '').replace(/"/g, '""')}"`,
        `"${(r.metricOrEvent || '').replace(/"/g, '""')}"`,
        `"${r.stateOrRegion || ''}"`,
        `"${r.status}"`,
        `"${r.value || ''}"`,
        `"${(r.notes || '').replace(/"/g, '""')}"`,
      ]
      csvRows.push(row.join(','))
    })

    const csvBlob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(csvBlob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `dfarm_report_${reportType}_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  // Export to JSON
  const handleExportJson = () => {
    if (!reportResult) return
    const jsonStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(reportResult, null, 2))
    const link = document.createElement('a')
    link.setAttribute('href', jsonStr)
    link.setAttribute('download', `dfarm_report_${reportType}_${Date.now()}.json`)
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const columns: ColumnDef<ReportDataRow>[] = [
    {
      key: 'date',
      header: 'Date / Timestamp',
      render: (r) => <span className="font-mono text-xs">{formatDate(r.date)}</span>,
    },
    {
      key: 'dairy',
      header: 'Tenant Name & Code',
      render: (r) => (
        <div className="flex flex-col text-xs">
          <span className="font-bold text-[#211B18]">{r.dairyName || 'Platform Global'}</span>
          <span className="font-mono text-[11px] text-[#817A75]">{r.dairyCode || '—'}</span>
        </div>
      ),
    },
    {
      key: 'metricOrEvent',
      header: 'Report Metric / Event',
      render: (r) => <span className="font-semibold text-xs text-[#211B18]">{r.metricOrEvent}</span>,
    },
    {
      key: 'region',
      header: 'Region / Domain',
      render: (r) => <span className="text-xs text-[#817A75]">{r.stateOrRegion || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#FAF2EC] text-[#211B18]">
          {r.status}
        </span>
      ),
    },
    {
      key: 'value',
      header: 'Metric Value',
      render: (r) => <span className="font-mono font-bold text-xs text-[#FF6A00]">{r.value || '—'}</span>,
    },
    {
      key: 'notes',
      header: 'Compliance Reference',
      render: (r) => <span className="text-xs text-[#817A75] max-w-xs truncate">{r.notes || '—'}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#211B18] tracking-tight">
            Platform Aggregate Reports
          </h1>
          <p className="text-xs text-[#817A75] mt-0.5">
            Platform adoption, tenant lifecycle compliance, hardware synchronization, and audit summaries.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ClayButton
            variant="outline"
            size="sm"
            onClick={handleExportJson}
            disabled={!reportResult || reportResult.rows.length === 0}
            leftIcon={<FileText className="w-4 h-4" />}
          >
            Export JSON
          </ClayButton>

          <ClayButton
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            disabled={!reportResult || reportResult.rows.length === 0}
            leftIcon={<FileSpreadsheet className="w-4 h-4 text-emerald-600" />}
          >
            Export CSV
          </ClayButton>
        </div>
      </div>

      {/* Filter and Configuration Bar */}
      <ClayCard variant="flat" padding="sm" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ClaySelect
          label="Report Category"
          value={reportType}
          onChange={(e) => setReportType(e.target.value as ReportType)}
        >
          <option value="dairy_growth">Dairy Registration & Adoption Growth</option>
          <option value="dairy_lifecycle">Tenant Lifecycle & Compliance States</option>
          <option value="admin_compliance">Primary Admin Account Compliance</option>
          <option value="sync_health">Hardware Connectivity & Sync Telemetry</option>
          <option value="audit_trail">Administrative Ledger Audit Trail</option>
        </ClaySelect>

        <ClayInput
          label="Start Date"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />

        <ClayInput
          label="End Date"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </ClayCard>

      {/* Summary KPI Pills */}
      {reportResult?.summaryMetrics && (
        <div className="flex flex-wrap gap-3">
          {Object.entries(reportResult.summaryMetrics).map(([key, val]) => (
            <div
              key={key}
              className="px-4 py-2 rounded-2xl bg-white border border-[#F1E7E0] shadow-xs flex items-center gap-3 text-xs"
            >
              <span className="text-[#817A75] font-semibold">{key}:</span>
              <strong className="text-sm font-black text-[#211B18]">{val}</strong>
            </div>
          ))}
        </div>
      )}

      {/* Report Table */}
      <ClayTable
        columns={columns}
        data={reportResult?.rows || []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyMessage="No report rows generated for selected criteria."
        totalItems={reportResult?.totalRecords || 0}
      />
    </div>
  )
}
