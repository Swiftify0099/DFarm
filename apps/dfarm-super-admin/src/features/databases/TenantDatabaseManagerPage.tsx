import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import { queryKeys } from '@/api/queryKeys'
import { ClayCard } from '@/components/ui/ClayCard'
import { ClayTable, type ColumnDef } from '@/components/ui/ClayTable'
import { ClayBadge } from '@/components/ui/ClayBadge'
import { ClayButton } from '@/components/ui/ClayButton'
import { ClayInput } from '@/components/ui/ClayInput'
import { ClaySelect } from '@/components/ui/ClaySelect'
import { ClayModal } from '@/components/ui/ClayModal'
import { ClayTabs, type TabItem } from '@/components/ui/ClayTabs'
import { ClayMetricCard } from '@/components/ui/ClayMetricCard'
import { ClayTextarea } from '@/components/ui/ClayTextarea'
import type { DairyTenant } from '@/types'
import { formatDateOnly } from '@/utils/formatters'
import {
  Database,
  Server,
  Layers,
  Table as TableIcon,
  Shield,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  Eye,
  Edit2,
  Trash2,
  Plus,
  Lock,
  FileText,
  Key,
  ExternalLink,
  ChevronRight,
  Info,
  Clock,
  ArrowUpDown,
  History,
} from 'lucide-react'

export const TenantDatabaseManagerPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Dairy selection state
  const dairyIdFromUrl = searchParams.get('dairyId') || ''
  const [selectedDairyId, setSelectedDairyId] = useState<string>(dairyIdFromUrl)

  // Tab state
  const [activeTab, setActiveTab] = useState<string>('overview')

  // Table exploration state
  const [selectedTable, setSelectedTable] = useState<string>('')
  const [tableSearch, setTableSearch] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')

  // Records pagination & filter state
  const [recordsPage, setRecordsPage] = useState<number>(1)
  const [recordsLimit, setRecordsLimit] = useState<number>(25)
  const [recordSearch, setRecordSearch] = useState<string>('')
  const [recordsSortBy, setRecordsSortBy] = useState<string>('')
  const [recordsSortOrder, setRecordsSortOrder] = useState<'ASC' | 'DESC'>('DESC')

  // Modal states
  const [viewRecord, setViewRecord] = useState<Record<string, any> | null>(null)
  const [editRecord, setEditRecord] = useState<Record<string, any> | null>(null)
  const [editUpdates, setEditUpdates] = useState<string>('{}')
  const [editReason, setEditReason] = useState<string>('')
  const [deleteRecord, setDeleteRecord] = useState<Record<string, any> | null>(null)
  const [deleteReason, setDeleteReason] = useState<string>('')
  const [insertModalOpen, setInsertModalOpen] = useState<boolean>(false)
  const [insertData, setInsertData] = useState<string>('{}')
  const [insertReason, setInsertReason] = useState<string>('')
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // 1. Fetch all dairies for dropdown
  const { data: dairies = [] } = useQuery<DairyTenant[]>({
    queryKey: queryKeys.dairies.list(),
    queryFn: () => apiClient.getDairies(),
  })

  // Auto-select first dairy if none selected
  useEffect(() => {
    if (!selectedDairyId && dairies.length > 0) {
      const firstId = dairies[0].id
      setSelectedDairyId(firstId)
      setSearchParams({ dairyId: firstId })
    }
  }, [dairies, selectedDairyId, setSearchParams])

  // Sync state when URL param changes
  useEffect(() => {
    if (dairyIdFromUrl && dairyIdFromUrl !== selectedDairyId) {
      setSelectedDairyId(dairyIdFromUrl)
    }
  }, [dairyIdFromUrl])

  const currentDairy = dairies.find((d) => d.id === selectedDairyId)

  // 2. Fetch Database Overview
  const {
    data: dbOverview,
    isLoading: isOverviewLoading,
    refetch: refetchOverview,
  } = useQuery({
    queryKey: queryKeys.tenantDatabase.overview(selectedDairyId),
    queryFn: () => apiClient.getTenantDatabaseOverview(selectedDairyId),
    enabled: Boolean(selectedDairyId),
  })

  // 3. Fetch Tenant Tables
  const {
    data: tables = [],
    isLoading: isTablesLoading,
    refetch: refetchTables,
  } = useQuery({
    queryKey: queryKeys.tenantDatabase.tables(selectedDairyId),
    queryFn: () => apiClient.getTenantTables(selectedDairyId),
    enabled: Boolean(selectedDairyId),
  })

  // Auto-select first table if none selected
  useEffect(() => {
    if (tables.length > 0 && !selectedTable) {
      setSelectedTable(tables[0].tableName)
    }
  }, [tables, selectedTable])

  // 4. Fetch Selected Table Schema
  const { data: tableSchema, isLoading: isSchemaLoading } = useQuery({
    queryKey: queryKeys.tenantDatabase.schema(selectedDairyId, selectedTable),
    queryFn: () => apiClient.getTableSchema(selectedDairyId, selectedTable),
    enabled: Boolean(selectedDairyId && selectedTable),
  })

  // 5. Fetch Table Records
  const {
    data: recordsResult,
    isLoading: isRecordsLoading,
    refetch: refetchRecords,
  } = useQuery({
    queryKey: queryKeys.tenantDatabase.records(selectedDairyId, selectedTable, {
      page: recordsPage,
      limit: recordsLimit,
      search: recordSearch,
      sortBy: recordsSortBy,
      sortOrder: recordsSortOrder,
    }),
    queryFn: () =>
      apiClient.getTableRecords(selectedDairyId, selectedTable, {
        page: recordsPage,
        limit: recordsLimit,
        search: recordSearch,
        sortBy: recordsSortBy || undefined,
        sortOrder: recordsSortOrder,
      }),
    enabled: Boolean(selectedDairyId && selectedTable && activeTab === 'explorer'),
  })

  // 6. Fetch Migration History
  const { data: migrationHistory, refetch: refetchMigrations } = useQuery({
    queryKey: queryKeys.tenantDatabase.migrations(selectedDairyId),
    queryFn: () => apiClient.getMigrationHistory(selectedDairyId),
    enabled: Boolean(selectedDairyId && activeTab === 'migrations'),
  })

  // 7. Mutations
  const verifyConnMutation = useMutation({
    mutationFn: () => apiClient.verifyConnection(selectedDairyId),
    onSuccess: (data) => {
      setActionFeedback({
        type: 'success',
        message: `Connection healthy! Latency: ${data.latencyMs}ms. Database: ${data.databaseName}`,
      })
      refetchOverview()
    },
    onError: (err: any) => {
      setActionFeedback({ type: 'error', message: `Connection verification failed: ${err.message}` })
    },
  })

  const validateSchemaMutation = useMutation({
    mutationFn: () => apiClient.validateSchema(selectedDairyId),
    onSuccess: (data) => {
      setActionFeedback({
        type: 'success',
        message: `Schema validated! Discovered ${data.discoveredTablesCount} tables. Missing required: ${data.missingTables.length}`,
      })
    },
    onError: (err: any) => {
      setActionFeedback({ type: 'error', message: `Schema validation error: ${err.message}` })
    },
  })

  const reconcileMappingMutation = useMutation({
    mutationFn: () => apiClient.reconcileMapping(selectedDairyId),
    onSuccess: () => {
      setActionFeedback({ type: 'success', message: 'Central database mapping successfully reconciled with physical catalog!' })
      refetchOverview()
      refetchTables()
    },
    onError: (err: any) => {
      setActionFeedback({ type: 'error', message: `Reconciliation error: ${err.message}` })
    },
  })

  const insertRecordMutation = useMutation({
    mutationFn: ({ data, reason }: { data: any; reason: string }) =>
      apiClient.insertRecord(selectedDairyId, selectedTable, data, reason),
    onSuccess: () => {
      setActionFeedback({ type: 'success', message: 'Record created successfully!' })
      setInsertModalOpen(false)
      setInsertData('{}')
      setInsertReason('')
      refetchRecords()
    },
    onError: (err: any) => {
      setActionFeedback({ type: 'error', message: `Insert failed: ${err.message}` })
    },
  })

  const updateRecordMutation = useMutation({
    mutationFn: ({ recordId, updates, reason }: { recordId: string; updates: any; reason: string }) =>
      apiClient.updateRecord(selectedDairyId, selectedTable, recordId, updates, reason),
    onSuccess: () => {
      setActionFeedback({ type: 'success', message: 'Record updated successfully!' })
      setEditRecord(null)
      setEditUpdates('{}')
      setEditReason('')
      refetchRecords()
    },
    onError: (err: any) => {
      setActionFeedback({ type: 'error', message: `Update rejected: ${err.message}` })
    },
  })

  const deleteRecordMutation = useMutation({
    mutationFn: ({ recordId, reason }: { recordId: string; reason: string }) =>
      apiClient.deleteRecord(selectedDairyId, selectedTable, recordId, reason),
    onSuccess: (res: any) => {
      setActionFeedback({ type: 'success', message: res.message || 'Record deleted successfully!' })
      setDeleteRecord(null)
      setDeleteReason('')
      refetchRecords()
    },
    onError: (err: any) => {
      setActionFeedback({ type: 'error', message: `Deletion rejected: ${err.message}` })
    },
  })

  // Handle dairy switch
  const handleDairyChange = (newDairyId: string) => {
    setSelectedDairyId(newDairyId)
    setSearchParams({ dairyId: newDairyId })
    setSelectedTable('')
    setRecordsPage(1)
    setActionFeedback(null)
  }

  // Filtered tables
  const filteredTables = tables.filter((t: any) => {
    const matchesSearch = t.tableName.toLowerCase().includes(tableSearch.toLowerCase())
    const matchesCategory =
      categoryFilter === 'ALL' ||
      (categoryFilter === 'A' && t.category === 'CATEGORY_A_OPERATIONAL') ||
      (categoryFilter === 'B' && t.category === 'CATEGORY_B_LIFECYCLE') ||
      (categoryFilter === 'C' && t.category === 'CATEGORY_C_FINANCIAL') ||
      (categoryFilter === 'D' && t.category === 'CATEGORY_D_SECURITY')
    return matchesSearch && matchesCategory
  })

  // Category Badge Helper
  const renderCategoryBadge = (category: string) => {
    switch (category) {
      case 'CATEGORY_A_OPERATIONAL':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            Category A: Operational
          </span>
        )
      case 'CATEGORY_B_LIFECYCLE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
            Category B: Lifecycle
          </span>
        )
      case 'CATEGORY_C_FINANCIAL':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
            Category C: Immutable Financial
          </span>
        )
      case 'CATEGORY_D_SECURITY':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
            Category D: Security Protected
          </span>
        )
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-800 border border-gray-200">
            {category}
          </span>
        )
    }
  }

  // Access Mode Badge Helper
  const renderAccessModeBadge = (mode: string) => {
    switch (mode) {
      case 'CONTROLLED_CRUD':
        return <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Controlled CRUD</span>
      case 'IMMUTABLE_FINANCIAL':
        return <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Immutable</span>
      case 'SECURITY_PROTECTED':
        return <span className="text-[10px] font-semibold text-rose-800 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 flex items-center gap-1"><Shield className="w-2.5 h-2.5" /> Redacted / No Edit</span>
      case 'LIFECYCLE_ACTION_ONLY':
        return <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">Lifecycle Action Only</span>
      case 'READ_ONLY':
        return <span className="text-[10px] font-semibold text-gray-700 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">Read-Only View</span>
      default:
        return <span className="text-[10px] font-semibold text-gray-700">{mode}</span>
    }
  }

  const selectedTableMeta = tables.find((t: any) => t.tableName === selectedTable)
  const isImmutable = selectedTableMeta?.category === 'CATEGORY_C_FINANCIAL'
  const isSecurityProtected = selectedTableMeta?.category === 'CATEGORY_D_SECURITY'

  const tabs: TabItem[] = [
    { id: 'overview', label: 'Database Overview', icon: <Server className="w-4 h-4" /> },
    { id: 'catalog', label: 'All Tables Catalog', icon: <Layers className="w-4 h-4" />, badge: tables.length },
    { id: 'explorer', label: 'Schema & Real Records Explorer', icon: <TableIcon className="w-4 h-4" /> },
    { id: 'migrations', label: 'Migration Track & Manifest', icon: <FileText className="w-4 h-4" /> },
  ]

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <ClayCard className="p-6 border-b-2 border-b-[#FF6A00]/20">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[#FFE9DC] text-[#FF6A00]">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-black text-[#211B18] tracking-tight">
                    Tenant Database Control Console
                  </h1>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#FAF2EC] text-[#817A75] border border-[#F1E7E0] font-mono">
                    SUPER ADMIN EXCLUSIVE
                  </span>
                </div>
                <p className="text-xs text-[#817A75]">
                  Dedicated physical PostgreSQL multi-tenant database explorer, live catalog schema inspection & controlled CRUD.
                </p>
              </div>
            </div>
          </div>

          {/* Dairy Selector */}
          <div className="flex items-center gap-3 self-start lg:self-center">
            <label className="text-xs font-bold text-[#817A75] whitespace-nowrap">Target Dairy:</label>
            <ClaySelect
              value={selectedDairyId}
              onChange={(e) => handleDairyChange(e.target.value)}
              className="w-72 font-semibold text-xs"
            >
              {dairies.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </ClaySelect>
          </div>
        </div>

        {/* Selected Dairy Status Bar */}
        {currentDairy && (
          <div className="mt-5 pt-4 border-t border-[#F1E7E0] grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div>
              <span className="text-[#817A75] block text-[10px] uppercase font-bold">Physical Database</span>
              <span className="font-mono font-bold text-[#211B18] truncate block" title={dbOverview?.databaseName || `dfarm_tenant_${currentDairy.code.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${currentDairy.id.slice(0, 8)}`}>
                {dbOverview?.databaseName || `dfarm_tenant_${currentDairy.code.toLowerCase().replace(/[^a-z0-9]/g, '_')}`}
              </span>
            </div>
            <div>
              <span className="text-[#817A75] block text-[10px] uppercase font-bold">Dairy Code</span>
              <span className="font-mono font-bold text-[#FF6A00]">{currentDairy.code}</span>
            </div>
            <div>
              <span className="text-[#817A75] block text-[10px] uppercase font-bold">Dairy Lifecycle</span>
              <ClayBadge variant={currentDairy.status} />
            </div>
            <div>
              <span className="text-[#817A75] block text-[10px] uppercase font-bold">Provisioning Status</span>
              <span
                className={`inline-block font-mono font-extrabold text-[11px] px-2 py-0.5 rounded ${
                  (dbOverview?.provisioningStatus || currentDairy.provisioningStatus) === 'FAILED'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {dbOverview?.provisioningStatus || currentDairy.provisioningStatus || 'READY'}
              </span>
            </div>
            <div>
              <span className="text-[#817A75] block text-[10px] uppercase font-bold">Connection Health</span>
              <span className="font-bold text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {dbOverview?.connectionHealth || 'HEALTHY'}
              </span>
            </div>
            <div>
              <span className="text-[#817A75] block text-[10px] uppercase font-bold">Last Health Check</span>
              <span className="text-[#817A75]">{dbOverview?.lastVerifiedAt ? formatDateOnly(dbOverview.lastVerifiedAt) : 'Just now'}</span>
            </div>
          </div>
        )}

        {/* Action Buttons Toolbar */}
        <div className="mt-4 pt-3 border-t border-[#F1E7E0] flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <ClayButton
              variant="secondary"
              size="sm"
              onClick={() => verifyConnMutation.mutate()}
              disabled={verifyConnMutation.isPending}
              className="text-xs"
            >
              <Activity className="w-3.5 h-3.5 mr-1 text-emerald-600" />
              {verifyConnMutation.isPending ? 'Verifying...' : 'Verify Connection'}
            </ClayButton>

            <ClayButton
              variant="secondary"
              size="sm"
              onClick={() => validateSchemaMutation.mutate()}
              disabled={validateSchemaMutation.isPending}
              className="text-xs"
            >
              <Shield className="w-3.5 h-3.5 mr-1 text-blue-600" />
              {validateSchemaMutation.isPending ? 'Validating...' : 'Validate Schema Compliance'}
            </ClayButton>

            <ClayButton
              variant="secondary"
              size="sm"
              onClick={() => reconcileMappingMutation.mutate()}
              disabled={reconcileMappingMutation.isPending}
              className="text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1 text-[#FF6A00]" />
              {reconcileMappingMutation.isPending ? 'Reconciling...' : 'Reconcile Registry Mapping'}
            </ClayButton>
          </div>

          <div className="text-xs text-[#817A75] flex items-center gap-1 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Isolated Physical Storage: PostgreSQL 16
          </div>
        </div>

        {/* Action Feedback Banner */}
        {actionFeedback && (
          <div
            className={`mt-4 p-3 rounded-xl text-xs font-semibold flex items-center justify-between ${
              actionFeedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            <span>{actionFeedback.message}</span>
            <button onClick={() => setActionFeedback(null)} className="text-[#817A75] hover:text-[#211B18] font-bold">
              ✕
            </button>
          </div>
        )}
      </ClayCard>

      {/* Tabs Navigation */}
      <ClayTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <ClayMetricCard
              title="Physical Database Status"
              value={dbOverview?.connectionHealth || 'HEALTHY'}
              icon={<Database className="w-5 h-5 text-emerald-600" />}
              subtitle={dbOverview?.databaseName || 'Separate Physical DB'}
            />
            <ClayMetricCard
              title="Total Discovered Tables"
              value={dbOverview?.totalTables ?? tables.length}
              icon={<TableIcon className="w-5 h-5 text-blue-600" />}
              subtitle="System Catalog tables in 'public'"
            />
            <ClayMetricCard
              title="Operational Row Count"
              value={dbOverview?.totalRows?.toLocaleString() ?? 0}
              icon={<Layers className="w-5 h-5 text-purple-600" />}
              subtitle="Aggregated real database rows"
            />
            <ClayMetricCard
              title="Migration Version Track"
              value={dbOverview?.migrationStatus || 'CURRENT'}
              icon={<FileText className="w-5 h-5 text-[#FF6A00]" />}
              subtitle="Manifest: 37 Versioned Scripts"
            />
          </div>

          {/* Architecture Specification Notice */}
          <ClayCard className="p-5 bg-gradient-to-r from-[#FFF5EE] to-[#FAF2EC] border-[#FDBA74]/40">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-[#FF6A00] shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <h3 className="font-bold text-[#211B18] text-sm">Permanent Database-Per-Dairy Architecture</h3>
                <p className="text-[#817A75]">
                  Every registered Dairy operates with a distinct physical PostgreSQL database (<code className="bg-white px-1 py-0.5 rounded border border-[#F1E7E0] text-[#FF6A00]">{dbOverview?.databaseName || 'dfarm_tenant_<code_hash>'}</code>).
                  Cross-tenant leakage is physically impossible at the connection level. Platform records reside in <code className="bg-white px-1 py-0.5 rounded border border-[#F1E7E0]">dfarm_central</code>, while operational records (farmers, milk collections, double-entry financial journals, bills) reside in this dedicated tenant database.
                </p>
              </div>
            </div>
          </ClayCard>

          {/* Detailed Database Properties Card */}
          <ClayCard className="p-6">
            <h2 className="text-sm font-black text-[#211B18] uppercase tracking-wider mb-4 flex items-center gap-2">
              <Server className="w-4 h-4 text-[#FF6A00]" />
              Database Engine & Catalog Telemetry
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-[#FAF2EC] rounded-xl border border-[#F1E7E0] space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#817A75]">Cluster Engine:</span>
                  <span className="font-mono font-bold text-[#211B18]">{dbOverview?.postgresVersion || 'PostgreSQL 16.2'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#817A75]">Catalog Schema:</span>
                  <span className="font-mono font-bold text-[#211B18]">public</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#817A75]">Total Views:</span>
                  <span className="font-mono font-bold text-[#211B18]">{dbOverview?.totalViews ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#817A75]">Total Indexes:</span>
                  <span className="font-mono font-bold text-[#211B18]">{dbOverview?.totalIndexes ?? 0}</span>
                </div>
              </div>
              <div className="p-3 bg-[#FAF2EC] rounded-xl border border-[#F1E7E0] space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#817A75]">Resource Mode:</span>
                  <span className="font-bold text-emerald-700">Dedicated Physical Database</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#817A75]">Tenant Mapping ID:</span>
                  <span className="font-mono font-bold text-[#211B18] truncate max-w-[200px]">{selectedDairyId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#817A75]">Estimated Disk Usage:</span>
                  <span className="font-mono font-bold text-[#211B18]">{dbOverview?.estimatedSize || '120 KB'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#817A75]">Isolation Guarantee:</span>
                  <span className="font-bold text-emerald-700">Strict Separate Connection Pool</span>
                </div>
              </div>
            </div>
          </ClayCard>
        </div>
      )}

      {/* TAB 2: ALL TABLES CATALOG */}
      {activeTab === 'catalog' && (
        <div className="space-y-4">
          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#817A75]" />
              <ClayInput
                placeholder="Search catalog table name..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap self-start sm:self-auto">
              <button
                onClick={() => setCategoryFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  categoryFilter === 'ALL'
                    ? 'bg-[#211B18] text-white shadow-sm'
                    : 'bg-[#FAF2EC] text-[#817A75] hover:bg-[#F1E7E0]'
                }`}
              >
                All Tables ({tables.length})
              </button>
              <button
                onClick={() => setCategoryFilter('A')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  categoryFilter === 'A'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                Category A: Operational
              </button>
              <button
                onClick={() => setCategoryFilter('B')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  categoryFilter === 'B'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                }`}
              >
                Category B: Lifecycle
              </button>
              <button
                onClick={() => setCategoryFilter('C')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  categoryFilter === 'C'
                    ? 'bg-amber-700 text-white shadow-sm'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                Category C: Financial
              </button>
              <button
                onClick={() => setCategoryFilter('D')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  categoryFilter === 'D'
                    ? 'bg-rose-700 text-white shadow-sm'
                    : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                }`}
              >
                Category D: Security
              </button>
            </div>
          </div>

          {/* Tables Table */}
          <ClayCard className="p-0 overflow-hidden">
            <ClayTable
              data={filteredTables}
              isLoading={isTablesLoading}
              emptyMessage="No catalog tables match your search query."
              keyExtractor={(t: any) => t.tableName}
              columns={[
                {
                  key: 'tableName',
                  header: 'Table Name & Catalog Type',
                  render: (t: any) => (
                    <div className="flex flex-col">
                      <span className="font-mono font-bold text-sm text-[#211B18] hover:text-[#FF6A00] cursor-pointer flex items-center gap-1.5" onClick={() => {
                        setSelectedTable(t.tableName)
                        setActiveTab('explorer')
                      }}>
                        <TableIcon className="w-3.5 h-3.5 text-[#FF6A00]" />
                        {t.tableName}
                      </span>
                      <span className="text-[10px] text-[#817A75] font-mono">{t.isView ? 'VIEW (Virtual Catalog)' : 'BASE TABLE (Persistent)'}</span>
                    </div>
                  ),
                },
                {
                  key: 'category',
                  header: 'Data Classification',
                  render: (t: any) => renderCategoryBadge(t.category),
                },
                {
                  key: 'accessMode',
                  header: 'Access & CRUD Mode',
                  render: (t: any) => renderAccessModeBadge(t.accessMode),
                },
                {
                  key: 'rowCount',
                  header: 'Row Count',
                  align: 'right',
                  render: (t: any) => (
                    <span className="font-mono text-xs font-bold text-[#211B18]">
                      {t.rowCount?.toLocaleString() ?? 0}
                    </span>
                  ),
                },
                {
                  key: 'columnCount',
                  header: 'Columns',
                  align: 'right',
                  render: (t: any) => (
                    <span className="font-mono text-xs text-[#817A75]">{t.columnCount ?? 0}</span>
                  ),
                },
                {
                  key: 'primaryKey',
                  header: 'Primary Key',
                  render: (t: any) => (
                    <span className="font-mono text-[11px] text-[#817A75] bg-[#FAF2EC] px-1.5 py-0.5 rounded border border-[#F1E7E0]">
                      {t.primaryKey?.length ? t.primaryKey.join(', ') : 'None'}
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  header: 'Action',
                  align: 'right',
                  render: (t: any) => (
                    <ClayButton
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setSelectedTable(t.tableName)
                        setActiveTab('explorer')
                      }}
                      className="text-xs"
                    >
                      <Eye className="w-3 h-3 mr-1" /> Inspect Records
                    </ClayButton>
                  ),
                },
              ]}
            />
          </ClayCard>
        </div>
      )}

      {/* TAB 3: SCHEMA & REAL RECORDS EXPLORER */}
      {activeTab === 'explorer' && (
        <div className="space-y-6">
          {/* Table Header Bar */}
          <ClayCard className="p-4 bg-[#FFF5EE] border-[#FDBA74]/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-white text-[#FF6A00] shadow-sm border border-[#F1E7E0]">
                  <TableIcon className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-mono font-black text-lg text-[#211B18]">{selectedTable}</h2>
                    {selectedTableMeta && renderCategoryBadge(selectedTableMeta.category)}
                    {selectedTableMeta && renderAccessModeBadge(selectedTableMeta.accessMode)}
                  </div>
                  <p className="text-xs text-[#817A75] mt-0.5">
                    Physical Tenant Table in <code className="font-mono font-bold text-[#FF6A00]">{dbOverview?.databaseName}</code> (public.{selectedTable})
                  </p>
                </div>
              </div>

              {/* Table Switcher & Insert Action */}
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <ClaySelect
                  value={selectedTable}
                  onChange={(e) => {
                    setSelectedTable(e.target.value)
                    setRecordsPage(1)
                  }}
                  className="w-52 font-mono text-xs"
                >
                  {tables.map((t: any) => (
                    <option key={t.tableName} value={t.tableName}>
                      {t.tableName} ({t.rowCount} rows)
                    </option>
                  ))}
                </ClaySelect>

                {/* Controlled Insert Button */}
                <ClayButton
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setInsertData('{}')
                    setInsertReason('')
                    setInsertModalOpen(true)
                  }}
                  disabled={isImmutable || isSecurityProtected}
                  title={
                    isImmutable
                      ? 'Category C (Financial) tables are strictly immutable. Direct administrative inserts are prohibited.'
                      : isSecurityProtected
                      ? 'Category D (Security) tables require authorized biometric enrollment workflows.'
                      : 'Insert Record'
                  }
                  className="text-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Insert Record
                </ClayButton>
              </div>
            </div>

            {/* Immutability Banner */}
            {isImmutable && (
              <div className="mt-3 p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center gap-2">
                <Lock className="w-4 h-4 shrink-0 text-amber-700" />
                <span>
                  <strong>Financial Immutability Rule:</strong> Direct UPDATE and DELETE operations on <code className="font-mono font-bold">{selectedTable}</code> are strictly blocked by double-entry integrity constraints. Modifications must occur through authorized reversal transactions.
                </span>
              </div>
            )}
            {isSecurityProtected && (
              <div className="mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-center gap-2">
                <Shield className="w-4 h-4 shrink-0 text-rose-700" />
                <span>
                  <strong>Security Data Classification:</strong> Sensitive credentials, authentication tokens, and high-dimensional biometric vectors are masked or redacted in this console according to DFarm data protection standards.
                </span>
              </div>
            )}
          </ClayCard>

          {/* Table Columns Schema Inspection Drawer */}
          <ClayCard className="p-5">
            <h3 className="text-xs font-black text-[#211B18] uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#FF6A00]" />
              Physical Column Definitions ({tableSchema?.columns?.length ?? 0} columns)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
              {tableSchema?.columns?.map((col: any) => (
                <div key={col.columnName} className="p-2.5 rounded-xl bg-[#FAF2EC] border border-[#F1E7E0] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-1">
                      {col.isPrimaryKey && <Key className="w-3 h-3 text-amber-600 shrink-0" />}
                      <span className="font-mono font-bold text-[#211B18] truncate block" title={col.columnName}>
                        {col.columnName}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#817A75] font-mono block mt-0.5">{col.dataType}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-[9px] font-bold">
                    {col.isPrimaryKey ? (
                      <span className="text-amber-800 bg-amber-100 px-1 rounded">PK</span>
                    ) : col.isNullable ? (
                      <span className="text-gray-600 bg-gray-100 px-1 rounded">NULL</span>
                    ) : (
                      <span className="text-rose-700 bg-rose-100 px-1 rounded">NOT NULL</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ClayCard>

          {/* Real Records Table */}
          <ClayCard className="p-0 overflow-hidden">
            {/* Records Toolbar */}
            <div className="p-4 border-b border-[#F1E7E0] flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative w-full sm:w-72">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#817A75]" />
                  <ClayInput
                    placeholder="Search records in table..."
                    value={recordSearch}
                    onChange={(e) => {
                      setRecordSearch(e.target.value)
                      setRecordsPage(1)
                    }}
                    className="pl-8 text-xs py-1.5"
                  />
                </div>
                <ClayButton
                  size="sm"
                  variant="secondary"
                  onClick={() => refetchRecords()}
                  className="text-xs"
                >
                  <RefreshCw className="w-3 h-3" />
                </ClayButton>
              </div>

              {/* Records Count & Limit */}
              <div className="flex items-center gap-3 text-xs text-[#817A75]">
                <span>
                  Showing {recordsResult?.records?.length || 0} of {recordsResult?.totalRecords || 0} total records
                </span>
                <ClaySelect
                  value={String(recordsLimit)}
                  onChange={(e) => {
                    setRecordsLimit(Number(e.target.value))
                    setRecordsPage(1)
                  }}
                  className="w-24 text-xs py-1"
                >
                  <option value="10">10 / page</option>
                  <option value="25">25 / page</option>
                  <option value="50">50 / page</option>
                  <option value="100">100 / page</option>
                </ClaySelect>
              </div>
            </div>

            {/* Dynamic Records Grid */}
            <div className="overflow-x-auto max-h-[600px]">
              {isRecordsLoading ? (
                <div className="p-12 text-center text-xs text-[#817A75]">Loading physical table records...</div>
              ) : !recordsResult?.records?.length ? (
                <div className="p-12 text-center text-xs text-[#817A75]">
                  No records found in table <code className="font-mono font-bold">{selectedTable}</code>.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#FAF2EC] sticky top-0 border-b border-[#F1E7E0] z-10">
                    <tr>
                      <th className="p-3 font-bold text-[#817A75] text-[10px] uppercase w-12 text-center">#</th>
                      {tableSchema?.columns?.slice(0, 7).map((col: any) => (
                        <th key={col.columnName} className="p-3 font-bold text-[#817A75] text-[10px] uppercase font-mono">
                          {col.columnName}
                        </th>
                      ))}
                      <th className="p-3 font-bold text-[#817A75] text-[10px] uppercase text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1E7E0]">
                    {recordsResult.records.map((row: any, idx: number) => {
                      const rowId = row.id || row[tableSchema?.columns?.[0]?.columnName] || String(idx)
                      return (
                        <tr key={rowId} className="hover:bg-[#FFF5EE]/60 transition-colors">
                          <td className="p-3 text-center text-[#817A75] font-mono text-[10px]">
                            {(recordsPage - 1) * recordsLimit + idx + 1}
                          </td>
                          {tableSchema?.columns?.slice(0, 7).map((col: any) => {
                            const val = row[col.columnName]
                            return (
                              <td key={col.columnName} className="p-3 font-mono text-xs max-w-[200px] truncate" title={String(val ?? '')}>
                                {val === null || val === undefined ? (
                                  <span className="text-[#A8A19B] italic font-sans text-[11px]">null</span>
                                ) : typeof val === 'object' ? (
                                  <span className="text-purple-700">{JSON.stringify(val).slice(0, 25)}...</span>
                                ) : typeof val === 'boolean' ? (
                                  <span className={val ? 'text-emerald-700 font-bold' : 'text-gray-500'}>
                                    {String(val)}
                                  </span>
                                ) : (
                                  String(val)
                                )}
                              </td>
                            )
                          })}
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* View Details */}
                              <button
                                onClick={() => setViewRecord(row)}
                                className="p-1 rounded bg-[#FAF2EC] hover:bg-[#FFE9DC] text-[#211B18] hover:text-[#FF6A00] transition-colors"
                                title="View Record Details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {/* Edit Record */}
                              <button
                                onClick={() => {
                                  setEditRecord(row)
                                  setEditUpdates(JSON.stringify(row, null, 2))
                                  setEditReason('')
                                }}
                                disabled={isImmutable || isSecurityProtected}
                                className={`p-1 rounded transition-colors ${
                                  isImmutable || isSecurityProtected
                                    ? 'opacity-30 cursor-not-allowed bg-gray-100 text-gray-400'
                                    : 'bg-[#FAF2EC] hover:bg-blue-100 text-[#211B18] hover:text-blue-700'
                                }`}
                                title={
                                  isImmutable
                                    ? 'Financial tables cannot be directly updated.'
                                    : isSecurityProtected
                                    ? 'Security tables cannot be directly edited.'
                                    : 'Edit Record'
                                }
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Soft Delete */}
                              <button
                                onClick={() => {
                                  setDeleteRecord(row)
                                  setDeleteReason('')
                                }}
                                disabled={isImmutable || isSecurityProtected}
                                className={`p-1 rounded transition-colors ${
                                  isImmutable || isSecurityProtected
                                    ? 'opacity-30 cursor-not-allowed bg-gray-100 text-gray-400'
                                    : 'bg-[#FAF2EC] hover:bg-rose-100 text-[#211B18] hover:text-rose-700'
                                }`}
                                title={
                                  isImmutable
                                    ? 'Financial records are immutable.'
                                    : isSecurityProtected
                                    ? 'Security records cannot be deleted directly.'
                                    : 'Soft Delete Record'
                                }
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination Controls */}
            {recordsResult && recordsResult.totalRecords > recordsLimit && (
              <div className="p-4 border-t border-[#F1E7E0] flex items-center justify-between">
                <ClayButton
                  size="sm"
                  variant="secondary"
                  disabled={recordsPage <= 1}
                  onClick={() => setRecordsPage((p) => Math.max(1, p - 1))}
                  className="text-xs"
                >
                  Previous Page
                </ClayButton>
                <span className="text-xs font-mono font-bold text-[#817A75]">
                  Page {recordsPage} of {Math.ceil(recordsResult.totalRecords / recordsLimit)}
                </span>
                <ClayButton
                  size="sm"
                  variant="secondary"
                  disabled={recordsPage >= Math.ceil(recordsResult.totalRecords / recordsLimit)}
                  onClick={() => setRecordsPage((p) => p + 1)}
                  className="text-xs"
                >
                  Next Page
                </ClayButton>
              </div>
            )}
          </ClayCard>
        </div>
      )}

      {/* TAB 4: MIGRATION TRACK & MANIFEST */}
      {activeTab === 'migrations' && (
        <div className="space-y-4">
          <ClayCard className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-black text-[#211B18] uppercase tracking-wider">
                  Tenant Migration Manifest (37 Versioned Migrations)
                </h2>
                <p className="text-xs text-[#817A75] mt-0.5">
                  Authoritative migration pipeline applied to each dedicated tenant database.
                </p>
              </div>
              <ClayButton size="sm" variant="secondary" onClick={() => refetchMigrations()} className="text-xs">
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh Status
              </ClayButton>
            </div>

            <div className="divide-y divide-[#F1E7E0] max-h-[600px] overflow-y-auto">
              {migrationHistory?.tenantOperationalTrack?.map((m: any) => (
                <div key={m.version + m.filename} className="py-3 flex items-start justify-between gap-4 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#FF6A00] bg-[#FFF5EE] px-1.5 py-0.5 rounded border border-[#FDBA74]/30">
                        v{m.version}
                      </span>
                      <span className="font-mono font-bold text-[#211B18]">{m.filename}</span>
                    </div>
                    <p className="text-[#817A75] text-[11px] mt-1">{m.description}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200">
                    {m.status || 'APPLIED'}
                  </span>
                </div>
              ))}
            </div>
          </ClayCard>
        </div>
      )}

      {/* MODAL 1: VIEW RECORD DETAILS */}
      <ClayModal
        isOpen={Boolean(viewRecord)}
        onClose={() => setViewRecord(null)}
        title={`Record Detail: ${selectedTable}`}
      >
        <div className="space-y-4 text-xs max-h-[70vh] overflow-y-auto p-1">
          {viewRecord && (
            <div className="space-y-2">
              {Object.entries(viewRecord).map(([key, val]) => (
                <div key={key} className="p-2.5 bg-[#FAF2EC] rounded-xl border border-[#F1E7E0]">
                  <span className="font-mono font-bold text-[#817A75] block text-[10px] uppercase">{key}</span>
                  <div className="font-mono text-[#211B18] break-all mt-0.5">
                    {val === null || val === undefined ? (
                      <span className="italic text-[#A8A19B]">null</span>
                    ) : typeof val === 'object' ? (
                      <pre className="text-[11px] bg-white p-2 rounded border border-[#F1E7E0] overflow-x-auto mt-1">
                        {JSON.stringify(val, null, 2)}
                      </pre>
                    ) : (
                      String(val)
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="pt-2 flex justify-end">
            <ClayButton size="sm" variant="secondary" onClick={() => setViewRecord(null)}>
              Close
            </ClayButton>
          </div>
        </div>
      </ClayModal>

      {/* MODAL 2: CONTROLLED INSERT */}
      <ClayModal
        isOpen={insertModalOpen}
        onClose={() => setInsertModalOpen(false)}
        title={`Controlled Insert: ${selectedTable}`}
      >
        <div className="space-y-4 text-xs">
          <p className="text-[#817A75]">
            Provide valid JSON attributes matching the columns of table <code className="font-mono font-bold text-[#FF6A00]">{selectedTable}</code>.
          </p>

          <div>
            <label className="font-bold text-[#211B18] block mb-1">Record Payload (JSON)</label>
            <ClayTextarea
              rows={8}
              value={insertData}
              onChange={(e) => setInsertData(e.target.value)}
              className="font-mono text-xs"
              placeholder='{ "code": "VAL01", "name": "Item Name" }'
            />
          </div>

          <div>
            <label className="font-bold text-[#211B18] block mb-1">Audit Justification / Reason *</label>
            <ClayInput
              placeholder="e.g. Super Admin administrative seed for Baramati branch"
              value={insertReason}
              onChange={(e) => setInsertReason(e.target.value)}
              className="text-xs"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <ClayButton size="sm" variant="secondary" onClick={() => setInsertModalOpen(false)}>
              Cancel
            </ClayButton>
            <ClayButton
              size="sm"
              variant="primary"
              disabled={!insertReason.trim() || insertRecordMutation.isPending}
              onClick={() => {
                try {
                  const parsed = JSON.parse(insertData)
                  insertRecordMutation.mutate({ data: parsed, reason: insertReason })
                } catch {
                  setActionFeedback({ type: 'error', message: 'Invalid JSON format in record payload.' })
                }
              }}
            >
              {insertRecordMutation.isPending ? 'Inserting...' : 'Confirm Insert'}
            </ClayButton>
          </div>
        </div>
      </ClayModal>

      {/* MODAL 3: CONTROLLED UPDATE */}
      <ClayModal
        isOpen={Boolean(editRecord)}
        onClose={() => setEditRecord(null)}
        title={`Controlled Record Update: ${selectedTable}`}
      >
        <div className="space-y-4 text-xs">
          <p className="text-[#817A75]">
            Edit values in JSON format. The operation will be immutably recorded in platform audit logs.
          </p>

          <div>
            <label className="font-bold text-[#211B18] block mb-1">Updated Attributes (JSON)</label>
            <ClayTextarea
              rows={8}
              value={editUpdates}
              onChange={(e) => setEditUpdates(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <div>
            <label className="font-bold text-[#211B18] block mb-1">Audit Justification / Reason *</label>
            <ClayInput
              placeholder="Reason for modifying record..."
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              className="text-xs"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <ClayButton size="sm" variant="secondary" onClick={() => setEditRecord(null)}>
              Cancel
            </ClayButton>
            <ClayButton
              size="sm"
              variant="primary"
              disabled={!editReason.trim() || updateRecordMutation.isPending}
              onClick={() => {
                try {
                  const parsed = JSON.parse(editUpdates)
                  const recordId = editRecord?.id || editRecord?.[tableSchema?.columns?.[0]?.columnName]
                  updateRecordMutation.mutate({ recordId, updates: parsed, reason: editReason })
                } catch {
                  setActionFeedback({ type: 'error', message: 'Invalid JSON format in update payload.' })
                }
              }}
            >
              {updateRecordMutation.isPending ? 'Updating...' : 'Apply Update'}
            </ClayButton>
          </div>
        </div>
      </ClayModal>

      {/* MODAL 4: SOFT DELETE CONFIRMATION */}
      <ClayModal
        isOpen={Boolean(deleteRecord)}
        onClose={() => setDeleteRecord(null)}
        title={`Confirm Record Deletion: ${selectedTable}`}
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Are you sure you want to delete this record?</p>
              <p className="mt-0.5 text-[11px]">
                If the table supports soft-deletion, it will be marked deleted. If hard deletion is required, referential integrity will be strictly enforced.
              </p>
            </div>
          </div>

          <div>
            <label className="font-bold text-[#211B18] block mb-1">Audit Justification / Reason *</label>
            <ClayInput
              placeholder="Mandatory reason for deleting record..."
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              className="text-xs"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <ClayButton size="sm" variant="secondary" onClick={() => setDeleteRecord(null)}>
              Cancel
            </ClayButton>
            <ClayButton
              size="sm"
              variant="danger"
              disabled={!deleteReason.trim() || deleteRecordMutation.isPending}
              onClick={() => {
                const recordId = deleteRecord?.id || deleteRecord?.[tableSchema?.columns?.[0]?.columnName]
                deleteRecordMutation.mutate({ recordId, reason: deleteReason })
              }}
            >
              {deleteRecordMutation.isPending ? 'Deleting...' : 'Confirm Deletion'}
            </ClayButton>
          </div>
        </div>
      </ClayModal>
    </div>
  )
}
export default TenantDatabaseManagerPage
