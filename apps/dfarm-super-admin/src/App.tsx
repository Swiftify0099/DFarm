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
              <Route path="admins" element={<AdminListPage />} />
              <Route path="monitoring" element={<MonitoringPage />} />
              <Route path="alerts" element={<AlertsPage />} />
              <Route path="audit" element={<AuditLogsPage />} />
              <Route path="support-access" element={<SupportAccessPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="platform-access" element={<PlatformAccessPage />} />
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
