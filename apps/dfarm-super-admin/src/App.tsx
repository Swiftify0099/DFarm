import React, { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/context/AuthContext'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'

// Public routes — small footprint, loaded eagerly
import { LoginPage } from '@/features/auth/LoginPage'
import { ActivationPage } from '@/features/auth/ActivationPage'

// Authenticated routes — lazy-loaded for smaller initial bundle
const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage }))
)
const DairyListPage = lazy(() =>
  import('@/features/dairies/DairyListPage').then((m) => ({ default: m.DairyListPage }))
)
const DairyDetailPage = lazy(() =>
  import('@/features/dairies/DairyDetailPage').then((m) => ({ default: m.DairyDetailPage }))
)
const AdminListPage = lazy(() =>
  import('@/features/admins/AdminListPage').then((m) => ({ default: m.AdminListPage }))
)
const MonitoringPage = lazy(() =>
  import('@/features/monitoring/MonitoringPage').then((m) => ({ default: m.MonitoringPage }))
)
const AlertsPage = lazy(() =>
  import('@/features/alerts/AlertsPage').then((m) => ({ default: m.AlertsPage }))
)
const AuditLogsPage = lazy(() =>
  import('@/features/audit/AuditLogsPage').then((m) => ({ default: m.AuditLogsPage }))
)
const SupportAccessPage = lazy(() =>
  import('@/features/support/SupportAccessPage').then((m) => ({ default: m.SupportAccessPage }))
)
const ReportsPage = lazy(() =>
  import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage }))
)
const PlatformAccessPage = lazy(() =>
  import('@/features/platform-access/PlatformAccessPage').then((m) => ({
    default: m.PlatformAccessPage,
  }))
)
const DairyLocationsPage = lazy(() =>
  import('@/features/locations/DairyLocationsPage').then((m) => ({ default: m.DairyLocationsPage }))
)
const GlobalRatePoliciesPage = lazy(() =>
  import('@/features/rate-policies/GlobalRatePoliciesPage').then((m) => ({
    default: m.GlobalRatePoliciesPage,
  }))
)
const GlobalFatSnfPoliciesPage = lazy(() =>
  import('@/features/fat-snf-policies/GlobalFatSnfPoliciesPage').then((m) => ({
    default: m.GlobalFatSnfPoliciesPage,
  }))
)
const HardwareInventoryPage = lazy(() =>
  import('@/features/hardware/HardwareInventoryPage').then((m) => ({
    default: m.HardwareInventoryPage,
  }))
)
const AmcManagementPage = lazy(() =>
  import('@/features/amc/AmcManagementPage').then((m) => ({ default: m.AmcManagementPage }))
)
const PlatformSettingsPage = lazy(() =>
  import('@/features/settings/PlatformSettingsPage').then((m) => ({
    default: m.PlatformSettingsPage,
  }))
)
const TenantDatabaseManagerPage = lazy(() =>
  import('@/features/databases/TenantDatabaseManagerPage').then((m) => ({
    default: m.TenantDatabaseManagerPage,
  }))
)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// Minimal loading fallback shown while lazy chunks are fetched
const PageLoader: React.FC = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#f8fafc',
    }}
  >
    <div style={{ color: '#64748b', fontSize: 14 }}>Loading…</div>
  </div>
)

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public Super Admin Login & Activation */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/activate" element={<ActivationPage />} />

              {/* Authenticated Platform Operator Routes */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="dairies" element={<DairyListPage />} />
                <Route path="dairies/:dairyId" element={<DairyDetailPage />} />
                <Route path="dairies/:dairyId/database" element={<TenantDatabaseManagerPage />} />
                <Route path="databases" element={<TenantDatabaseManagerPage />} />
                <Route path="admins" element={<AdminListPage />} />
                <Route path="locations" element={<DairyLocationsPage />} />
                <Route path="policies/rate" element={<GlobalRatePoliciesPage />} />
                <Route path="policies/fat-snf" element={<GlobalFatSnfPoliciesPage />} />
                <Route path="hardware" element={<HardwareInventoryPage />} />
                <Route path="amc" element={<AmcManagementPage />} />
                <Route path="monitoring" element={<MonitoringPage />} />
                <Route path="alerts" element={<AlertsPage />} />
                <Route path="support-access" element={<SupportAccessPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="audit" element={<AuditLogsPage />} />
                <Route path="platform-access" element={<PlatformAccessPage />} />
                <Route path="settings" element={<PlatformSettingsPage />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
