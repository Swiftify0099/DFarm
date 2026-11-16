import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/context/AuthContext'
import { HardwareProvider } from '@/context/HardwareContext'
import { CollectionAppShell } from '@/components/layout/CollectionAppShell'
import { Login } from '@/pages/auth/Login'
import { CollectionWorkspace } from '@/pages/collection/CollectionWorkspace'
import { CustomerLookup } from '@/pages/customers/CustomerLookup'
import { SessionManagement } from '@/pages/sessions/SessionManagement'
import { DeviceDiagnostics } from '@/pages/devices/DeviceDiagnostics'
import { OfflineQueueView } from '@/pages/sync/OfflineQueueView'
import { SettingsView } from '@/pages/settings/SettingsView'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HardwareProvider>
          <BrowserRouter>
            <Routes>
              {/* Operator Authentication */}
              <Route path="/login" element={<Login />} />

              {/* Authenticated Kiosk Workspace Shell */}
              <Route element={<CollectionAppShell />}>
                <Route path="/collection" element={<CollectionWorkspace />} />
                <Route path="/customers" element={<CustomerLookup />} />
                <Route path="/sessions" element={<SessionManagement />} />
                <Route path="/devices" element={<DeviceDiagnostics />} />
                <Route path="/sync" element={<OfflineQueueView />} />
                <Route path="/settings" element={<SettingsView />} />
                <Route path="/" element={<Navigate to="/collection" replace />} />
                <Route path="*" element={<Navigate to="/collection" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </HardwareProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
