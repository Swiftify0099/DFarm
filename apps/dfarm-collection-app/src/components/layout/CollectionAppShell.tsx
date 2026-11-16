import React from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { CollectionHeader } from './CollectionHeader'
import { MainNavigation } from './MainNavigation'
import { MachineHealthBar } from './MachineHealthBar'

export const CollectionAppShell: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-full border-4 border-peach border-t-primary-orange animate-spin" />
        <p className="text-sm font-semibold text-text-secondary tracking-wide">
          Initializing DFarm Collection Terminal...
        </p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col text-text-primary antialiased font-sans select-none overflow-hidden h-screen">
      {/* 1. Kiosk Top Bar */}
      <CollectionHeader />

      {/* 2. Main Workstation Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <MainNavigation />

        {/* Dynamic Operational Content */}
        <main className="flex-1 overflow-y-auto bg-cream-dark p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      {/* 3. Live Hardware Telemetry Strip */}
      <MachineHealthBar />
    </div>
  )
}
