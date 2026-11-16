import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/context/AuthContext'
import { AdminLayout } from '@/components/layout/AdminLayout'

// Pages
import { Login } from '@/pages/auth/Login'
import { ActivationPage } from '@/pages/auth/ActivationPage'
import { Dashboard } from '@/pages/dashboard/Dashboard'
import { PendingApprovals } from '@/pages/customers/PendingApprovals'
import { CustomerDirectory } from '@/pages/customers/CustomerDirectory'
import { CustomerDetail } from '@/pages/customers/CustomerDetail'
import { FaceEnrollmentList } from '@/pages/biometrics/FaceEnrollmentList'
import { RfidManagement } from '@/pages/rfid/RfidManagement'
import { CollectionSessions } from '@/pages/collection/CollectionSessions'
import { MilkCollectionRegister } from '@/pages/collection/MilkCollectionRegister'
import { QualityAnalytics } from '@/pages/quality/QualityAnalytics'
import { RateChartManagement } from '@/pages/rate-charts/RateChartManagement'
import { CustomerLedgerView } from '@/pages/ledger/CustomerLedgerView'
import { BillingManagement } from '@/pages/billing/BillingManagement'
import { FeedInventory } from '@/pages/feed/FeedInventory'
import { PaymentRegister } from '@/pages/payments/PaymentRegister'
import { DeviceManagement } from '@/pages/devices/DeviceManagement'
import { StaffManagement } from '@/pages/staff/StaffManagement'
import { AuditLogViewer } from '@/pages/audit/AuditLogViewer'
import { ReportsHub } from '@/pages/reports/ReportsHub'
import { DairyProfilePage } from '@/pages/profile/DairyProfile'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: false,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Auth Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/activate" element={<ActivationPage />} />

            {/* Protected Dairy Admin Routes */}
            <Route path="/" element={<AdminLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />

              {/* Customer Management */}
              <Route path="customers/approvals" element={<PendingApprovals />} />
              <Route path="customers/directory" element={<CustomerDirectory />} />
              <Route path="customers/detail/:id" element={<CustomerDetail />} />

              {/* Biometrics & Hardware */}
              <Route path="biometrics/face-enrollment" element={<FaceEnrollmentList />} />
              <Route path="rfid/cards" element={<RfidManagement />} />

              {/* Milk Collections & Quality */}
              <Route path="collection/sessions" element={<CollectionSessions />} />
              <Route path="collection/register" element={<MilkCollectionRegister />} />
              <Route path="quality/analytics" element={<QualityAnalytics />} />
              <Route path="rate-charts" element={<RateChartManagement />} />

              {/* Accounts & Settlements */}
              <Route path="ledger" element={<CustomerLedgerView />} />
              <Route path="billing" element={<BillingManagement />} />
              <Route path="payments" element={<PaymentRegister />} />

              {/* Feed & Inventory */}
              <Route path="feed/inventory" element={<FeedInventory />} />
              <Route path="feed/sales" element={<FeedInventory />} />

              {/* Hardware & Sync */}
              <Route path="devices" element={<DeviceManagement />} />

              {/* Governance & Reporting */}
              <Route path="reports" element={<ReportsHub />} />
              <Route path="staff" element={<StaffManagement />} />
              <Route path="audit" element={<AuditLogViewer />} />
              <Route path="profile" element={<DairyProfilePage />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
