export type ReportType =
  | 'dairy_growth'
  | 'dairy_lifecycle'
  | 'admin_compliance'
  | 'sync_health'
  | 'audit_trail'

export interface ReportFilter {
  reportType: ReportType
  startDate: string
  endDate: string
  dairyId?: string
  statusFilter?: string
}

export interface ReportDataRow {
  id: string
  date: string
  dairyCode?: string
  dairyName?: string
  metricOrEvent: string
  stateOrRegion?: string
  status: string
  value?: string | number
  notes?: string
}

export interface PlatformReportResult {
  reportType: ReportType
  title: string
  generatedAt: string
  generatedBy: string
  totalRecords: number
  summaryMetrics: Record<string, string | number>
  rows: ReportDataRow[]
}
