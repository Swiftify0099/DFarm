import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { apiClient } from '@/api/client'

export const AppLayout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Fetch pending dairies for sidebar badge
  const { data: dairies = [] } = useQuery({
    queryKey: queryKeys.dairies.list({ status: 'draft_onboarding' }),
    queryFn: () => apiClient.getDairies({ status: 'draft_onboarding' }),
    refetchInterval: 30000,
  })

  // Fetch open alerts count
  const { data: alerts = [] } = useQuery({
    queryKey: queryKeys.alerts.list({ status: 'open' }),
    queryFn: () => apiClient.getAlerts({ status: 'open' }),
    refetchInterval: 30000,
  })

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#FFF5EE]">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block shrink-0 h-full">
        <Sidebar
          pendingDairiesCount={dairies.length}
          openAlertsCount={alerts.length}
        />
      </div>

      {/* Mobile Drawer Backdrop & Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-72 h-full">
            <Sidebar
              pendingDairiesCount={dairies.length}
              openAlertsCount={alerts.length}
              onCloseMobile={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main App Workspace */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        <Topbar onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)} />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#FFF5EE]">
          <div className="max-w-7xl mx-auto w-full pb-12">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
