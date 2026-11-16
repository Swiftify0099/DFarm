export type ServiceHealthStatus = 'operational' | 'degraded' | 'outage'

export interface ServiceComponentHealth {
  name: string
  status: ServiceHealthStatus
  uptime24h: number
  responseTimeMs: number
  lastCheckedAt: string
  details: string
}

export interface SyncEngineMetrics {
  totalSyncedEventsToday: number
  pendingQueueDepth: number
  avgSyncLatencyMs: number
  failedEvents24h: number
  activeDairyNodesOnline: number
}

export interface CollectionDeviceMetrics {
  totalRegisteredHardwareUnits: number
  onlineHardwareUnits: number
  offlineHardwareUnits: number
  bluetoothMilkAnalyzersConnected: number
  digitalScalesConnected: number
}

export interface OperationalIncident {
  id: string
  title: string
  severity: 'critical' | 'major' | 'minor'
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved'
  affectedServices: string[]
  affectedDairiesCount: number
  startedAt: string
  resolvedAt?: string
  summary: string
}

export interface PlatformHealthSummary {
  overallStatus: ServiceHealthStatus
  systemVersion: string
  deploymentRegion: string
  lastHealthCheck: string
  components: ServiceComponentHealth[]
  syncMetrics: SyncEngineMetrics
  deviceMetrics: CollectionDeviceMetrics
  activeIncidents: OperationalIncident[]
}
