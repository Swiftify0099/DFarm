export const queryKeys = {
  auth: {
    session: ['auth', 'session'] as const,
    users: ['auth', 'users'] as const,
  },
  dashboard: {
    metrics: ['dashboard', 'metrics'] as const,
    analytics: ['dashboard', 'analytics'] as const,
  },
  dairies: {
    all: ['dairies'] as const,
    list: (filters?: Record<string, unknown>) => ['dairies', 'list', filters] as const,
    detail: (id: string) => ['dairies', 'detail', id] as const,
  },
  admins: {
    all: ['admins'] as const,
    list: (filters?: Record<string, unknown>) => ['admins', 'list', filters] as const,
  },
  monitoring: {
    health: ['monitoring', 'health'] as const,
  },
  alerts: {
    all: ['alerts'] as const,
    list: (filters?: Record<string, unknown>) => ['alerts', 'list', filters] as const,
  },
  audit: {
    all: ['audit'] as const,
    list: (filters?: Record<string, unknown>) => ['audit', 'list', filters] as const,
  },
  support: {
    active: ['support', 'active'] as const,
    history: ['support', 'history'] as const,
  },
  reports: {
    generated: (filter: Record<string, unknown>) => ['reports', 'generated', filter] as const,
  },
  policies: {
    rateAll: ['policies', 'rate'] as const,
    fatSnfAll: ['policies', 'fatSnf'] as const,
  },
  hardware: {
    all: ['hardware'] as const,
    list: (filters?: Record<string, unknown>) => ['hardware', 'list', filters] as const,
  },
  amc: {
    plans: ['amc', 'plans'] as const,
    subscriptions: (dairyId?: string) => ['amc', 'subscriptions', dairyId] as const,
  },
  settings: {
    platform: ['settings', 'platform'] as const,
  },
  tenantDatabase: {
    overview: (dairyId: string) => ['tenantDatabase', 'overview', dairyId] as const,
    tables: (dairyId: string) => ['tenantDatabase', 'tables', dairyId] as const,
    schema: (dairyId: string, tableName: string) => ['tenantDatabase', 'schema', dairyId, tableName] as const,
    records: (dairyId: string, tableName: string, params?: Record<string, unknown>) => ['tenantDatabase', 'records', dairyId, tableName, params] as const,
    migrations: (dairyId: string) => ['tenantDatabase', 'migrations', dairyId] as const,
  },
}
