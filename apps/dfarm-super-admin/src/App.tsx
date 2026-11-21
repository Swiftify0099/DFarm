import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/context/AuthContext'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'

// Features
import { LoginPage } from '@/features/auth/LoginPage'
import { ActivationPage } from '@/features/auth/ActivationPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { DairyListPage } from '@/features/dairies/DairyListPage'
import { DairyDetailPage } from '@/features/dairies/DairyDetailPage'
import { AdminListPage } from '@/features/admins/AdminListPage'
import { MonitoringPage } from '@/features/monitoring/MonitoringPage'
import { AlertsPage } from '@/features/alerts/AlertsPage'
import { AuditLogsPage } from '@/features/audit/AuditLogsPage'
import { SupportAccessPage } from '@/features/support/SupportAccessPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { PlatformAccessPage } from '@/features/platform-access/PlatformAccessPage'
import { DairyLocationsPage } from '@/features/locations/DairyLocationsPage'
import { GlobalRatePoliciesPage } from '@/features/rate-policies/GlobalRatePoliciesPage'
import { GlobalFatSnfPoliciesPage } from '@/features/fat-snf-policies/GlobalFatSnfPoliciesPage'
import { HardwareInventoryPage } from '@/features/hardware/HardwareInventoryPage'
import { AmcManagementPage } from '@/features/amc/AmcManagementPage'
import { PlatformSettingsPage } from '@/features/settings/PlatformSettingsPage'
import { TenantDatabaseManagerPage } from '@/features/databases/TenantDatabaseManagerPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
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
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
