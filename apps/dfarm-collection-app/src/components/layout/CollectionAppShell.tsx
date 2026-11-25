import React, { useState, useEffect, createContext, useContext } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useHardware } from '@/context/HardwareContext'
import { pwaService } from '@/services/pwa-service'
import { CollectionHeader } from './CollectionHeader'
import { MachineHealthBar } from './MachineHealthBar'
import { CustomerLookup } from '@/pages/customers/CustomerLookup'
import { SessionManagement } from '@/pages/sessions/SessionManagement'
import { DeviceDiagnostics } from '@/pages/devices/DeviceDiagnostics'
import { OfflineQueueView } from '@/pages/sync/OfflineQueueView'
import { SettingsView } from '@/pages/settings/SettingsView'
import { X, Users, Clock, Cpu, RefreshCw, Settings } from 'lucide-react'
import { ClayCard, ClayButton } from '@/components/ui'

export type KioskOverlayType = 'CUSTOMERS' | 'SESSIONS' | 'DEVICES' | 'SYNC' | 'SETTINGS' | null

interface KioskOverlayContextType {
  activeOverlay: KioskOverlayType
  openOverlay: (overlay: KioskOverlayType) => void
  closeOverlay: () => void
}

const KioskOverlayContext = createContext<KioskOverlayContextType>({
  activeOverlay: null,
  openOverlay: () => {},
  closeOverlay: () => {},
})

export const useKioskOverlay = () => useContext(KioskOverlayContext)

export const CollectionAppShell: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth()
  const { setManualCustomer, activeAttempt } = useHardware()
  const [activeOverlay, setActiveOverlay] = useState<KioskOverlayType>(null)
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false)

  useEffect(() => {
    return pwaService.subscribe((info) => {
      setIsUpdateAvailable(info.isUpdateAvailable)
    })
  }, [])

  const handleApplyUpdate = () => {
    pwaService.applyUpdate(() => {
      if (activeAttempt) {
        alert('An active milk collection is in progress. Please complete or cancel the transaction before updating.')
        return false
      }
      return true
    })
  }

  const openOverlay = (overlay: KioskOverlayType) => {
    setActiveOverlay(overlay)
  }

  const closeOverlay = () => {
    setActiveOverlay(null)
  }

  // Keyboard navigation for Function keys (F1-F6) and Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape key closes any active overlay
      if (e.key === 'Escape') {
        if (activeOverlay !== null) {
          e.preventDefault()
          closeOverlay()
          // Return focus to counter farmer input
          const farmerInput = document.getElementById('farmer-code-input')
          farmerInput?.focus()
          return
        }
      }

      // Intercept F1-F6
      if (['F1', 'F2', 'F3', 'F4', 'F5', 'F6'].includes(e.key)) {
        e.preventDefault()
        switch (e.key) {
          case 'F1':
            closeOverlay()
            const farmerInput = document.getElementById('farmer-code-input')
            farmerInput?.focus()
            break
          case 'F2':
            setActiveOverlay((prev) => (prev === 'CUSTOMERS' ? null : 'CUSTOMERS'))
            break
          case 'F3':
            setActiveOverlay((prev) => (prev === 'SESSIONS' ? null : 'SESSIONS'))
            break
          case 'F4':
            setActiveOverlay((prev) => (prev === 'DEVICES' ? null : 'DEVICES'))
            break
          case 'F5':
            setActiveOverlay((prev) => (prev === 'SYNC' ? null : 'SYNC'))
            break
          case 'F6':
            setActiveOverlay((prev) => (prev === 'SETTINGS' ? null : 'SETTINGS'))
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeOverlay])

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
    <KioskOverlayContext.Provider value={{ activeOverlay, openOverlay, closeOverlay }}>
      <div className="min-h-screen bg-cream flex flex-col text-text-primary antialiased font-sans select-none overflow-hidden h-screen">
        {/* 1. Kiosk Top Bar */}
        <CollectionHeader />

        {/* PWA Background Update Available Notification */}
        {isUpdateAvailable && (
          <div className="bg-primary-orange text-white text-xs font-semibold px-4 py-2 flex items-center justify-between shadow-md z-30 shrink-0">
            <div className="flex items-center space-x-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>A new version of DFarm is available.</span>
            </div>
            <button
              onClick={handleApplyUpdate}
              className="bg-white text-primary-orange hover:bg-cream px-3 py-1 rounded-lg font-bold text-xs transition-colors shadow-sm cursor-pointer"
            >
              Update App
            </button>
          </div>
        )}

        {/* 2. Full-Width Main Workstation Area (Permanent Left Sidebar Removed) */}
        <div className="flex-1 flex overflow-hidden w-full">
          {/* Dynamic Operational Content (Full available screen width) */}
          <main className="flex-1 overflow-y-auto bg-cream-dark p-3 md:p-5 w-full">
            <Outlet />
          </main>
        </div>

        {/* 3. Live Hardware Telemetry Strip */}
        <MachineHealthBar />

        {/* 4. Non-Destructive Secondary Module Overlays (F2-F6) */}
        {activeOverlay && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-fade-in">
            <div className="relative w-full max-w-6xl max-h-[90vh] bg-cream rounded-2xl shadow-2xl border border-border-subtle flex flex-col overflow-hidden">
              {/* Overlay Modal Header */}
              <div className="px-6 py-4 bg-cream border-b border-border-subtle flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {activeOverlay === 'CUSTOMERS' && <Users className="w-6 h-6 text-primary-orange" />}
                  {activeOverlay === 'SESSIONS' && <Clock className="w-6 h-6 text-primary-orange" />}
                  {activeOverlay === 'DEVICES' && <Cpu className="w-6 h-6 text-primary-orange" />}
                  {activeOverlay === 'SYNC' && <RefreshCw className="w-6 h-6 text-primary-orange" />}
                  {activeOverlay === 'SETTINGS' && <Settings className="w-6 h-6 text-primary-orange" />}
                  <div>
                    <h2 className="text-lg font-bold text-text-primary">
                      {activeOverlay === 'CUSTOMERS' && 'Customer Directory (F2)'}
                      {activeOverlay === 'SESSIONS' && 'Shift Sessions (F3)'}
                      {activeOverlay === 'DEVICES' && 'Hardware Telemetry & Diagnostics (F4)'}
                      {activeOverlay === 'SYNC' && 'Offline Queue & Batch Sync (F5)'}
                      {activeOverlay === 'SETTINGS' && 'Kiosk Terminal Settings (F6)'}
                    </h2>
                    <p className="text-xs text-text-secondary">
                      {activeOverlay === 'CUSTOMERS' && 'Search and select patrons to load them directly into the collection counter.'}
                      {activeOverlay === 'SESSIONS' && 'Manage shift sessions, monitor throughput, and reconcile intakes.'}
                      {activeOverlay === 'DEVICES' && 'Real-time port polling, camera configuration, and hardware reconnect.'}
                      {activeOverlay === 'SYNC' && 'Inspect pending offline intakes, trigger cloud sync, and resolve conflicts.'}
                      {activeOverlay === 'SETTINGS' && 'Configure peripheral options, test voice announcer, and manage storage.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-[11px] font-mono font-semibold px-2 py-1 rounded bg-cream-dark text-text-muted border border-border-subtle">
                    ESC to close
                  </span>
                  <ClayButton
                    variant="ghost"
                    size="sm"
                    onClick={closeOverlay}
                    className="p-1.5 text-text-muted hover:text-rose-600 rounded-lg"
                    title="Close Overlay (Esc)"
                  >
                    <X className="w-5 h-5" />
                  </ClayButton>
                </div>
              </div>

              {/* Overlay Content Body */}
              <div className="flex-1 overflow-y-auto p-6 bg-cream-dark">
                {activeOverlay === 'CUSTOMERS' && (
                  <CustomerLookup
                    onSelectCustomer={(cust) => {
                      setManualCustomer(cust)
                      closeOverlay()
                      const farmerInput = document.getElementById('farmer-code-input')
                      farmerInput?.focus()
                    }}
                  />
                )}
                {activeOverlay === 'SESSIONS' && <SessionManagement />}
                {activeOverlay === 'DEVICES' && <DeviceDiagnostics />}
                {activeOverlay === 'SYNC' && <OfflineQueueView />}
                {activeOverlay === 'SETTINGS' && <SettingsView />}
              </div>
            </div>
          </div>
        )}
      </div>
    </KioskOverlayContext.Provider>
  )
}
