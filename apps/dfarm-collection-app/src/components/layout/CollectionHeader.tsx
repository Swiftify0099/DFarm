import React from 'react'
import { useAuth } from '@/context/AuthContext'
import { useHardware } from '@/context/HardwareContext'
import { useKioskOverlay } from './CollectionAppShell'
import { DfarmCollectionLogo } from '@/assets/illustrations'
import { ClayBadge, ClayButton } from '@/components/ui'
import { Wifi, WifiOff, RefreshCw, LogOut, User, Layers, Users, Clock, Cpu, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export const CollectionHeader: React.FC = () => {
  const { operator, logout } = useAuth()
  const { activeSession, isNetworkOnline, offlineQueueCount } = useHardware()
  const { openOverlay } = useKioskOverlay()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="h-14 bg-cream border-b border-border-subtle px-4 lg:px-6 flex items-center justify-between clay-card rounded-none z-20 shrink-0">
      {/* Brand & Dairy Identity */}
      <div className="flex items-center space-x-3">
        <div
          className="flex items-center space-x-2.5 cursor-pointer"
          onClick={() => navigate('/collection')}
          title="DFarm Collection Counter (F1)"
        >
          <DfarmCollectionLogo size={32} />
          <div>
            <h1 className="text-base font-bold text-text-primary tracking-tight leading-tight">
              DFarm Collection
            </h1>
            <p className="text-[11px] text-text-secondary font-medium truncate max-w-[200px] sm:max-w-none">
              {operator?.dairyName || 'Authorized Dairy Cooperative'} •{' '}
              <span className="font-semibold text-primary-orange">{operator?.dairyCode || 'DAIRY'}</span>
            </p>
          </div>
        </div>

        {/* Shift Badge */}
        {activeSession && (
          <div className="hidden md:flex items-center space-x-2 border-l border-border-subtle pl-3">
            <ClayBadge variant={activeSession.shift === 'MORNING' ? 'warning' : 'primary'} size="sm">
              <Layers className="w-3 h-3 mr-1" />
              {activeSession.shift} SHIFT
            </ClayBadge>
            <span className="text-[11px] text-text-muted font-mono">{activeSession.sessionCode}</span>
          </div>
        )}
      </div>

      {/* Center Operational Function-Key Ribbon */}
      <div className="hidden lg:flex items-center space-x-1.5 bg-peach/40 px-2.5 py-1 rounded-xl border border-border-subtle">
        <button
          onClick={() => openOverlay('CUSTOMERS')}
          className="px-2 py-0.5 text-xs font-semibold rounded-lg hover:bg-peach text-text-primary flex items-center space-x-1.5 transition-colors"
          title="Patron Directory (F2)"
        >
          <span className="font-mono text-[10px] bg-cream px-1 rounded border border-border-subtle font-bold text-primary-orange">F2</span>
          <Users className="w-3.5 h-3.5 text-text-secondary" />
          <span>Directory</span>
        </button>

        <button
          onClick={() => openOverlay('SESSIONS')}
          className="px-2 py-0.5 text-xs font-semibold rounded-lg hover:bg-peach text-text-primary flex items-center space-x-1.5 transition-colors"
          title="Shift Sessions (F3)"
        >
          <span className="font-mono text-[10px] bg-cream px-1 rounded border border-border-subtle font-bold text-primary-orange">F3</span>
          <Clock className="w-3.5 h-3.5 text-text-secondary" />
          <span>Shifts</span>
        </button>

        <button
          onClick={() => openOverlay('DEVICES')}
          className="px-2 py-0.5 text-xs font-semibold rounded-lg hover:bg-peach text-text-primary flex items-center space-x-1.5 transition-colors"
          title="Hardware Telemetry (F4)"
        >
          <span className="font-mono text-[10px] bg-cream px-1 rounded border border-border-subtle font-bold text-primary-orange">F4</span>
          <Cpu className="w-3.5 h-3.5 text-text-secondary" />
          <span>Hardware</span>
        </button>

        <button
          onClick={() => openOverlay('SYNC')}
          className="px-2 py-0.5 text-xs font-semibold rounded-lg hover:bg-peach text-text-primary flex items-center space-x-1.5 transition-colors"
          title="Offline Queue (F5)"
        >
          <span className="font-mono text-[10px] bg-cream px-1 rounded border border-border-subtle font-bold text-primary-orange">F5</span>
          <RefreshCw className="w-3.5 h-3.5 text-text-secondary" />
          <span>Queue</span>
        </button>

        <button
          onClick={() => openOverlay('SETTINGS')}
          className="px-2 py-0.5 text-xs font-semibold rounded-lg hover:bg-peach text-text-primary flex items-center space-x-1.5 transition-colors"
          title="Kiosk Settings (F6)"
        >
          <span className="font-mono text-[10px] bg-cream px-1 rounded border border-border-subtle font-bold text-primary-orange">F6</span>
          <Settings className="w-3.5 h-3.5 text-text-secondary" />
          <span>Settings</span>
        </button>
      </div>

      {/* Network, Queue, and Operator Controls */}
      <div className="flex items-center space-x-2.5">
        {/* Offline Queue Badge */}
        {offlineQueueCount > 0 ? (
          <div
            onClick={() => openOverlay('SYNC')}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-orange-100 text-primary-orange text-xs font-semibold cursor-pointer border border-primary-orange/30 animate-pulse"
            title="Click to view offline queue (F5)"
          >
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>{offlineQueueCount} Offline</span>
          </div>
        ) : (
          <div className="hidden sm:flex items-center space-x-1 text-xs text-text-muted font-medium px-2 py-0.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>All Synced</span>
          </div>
        )}

        {/* Network Status Pill */}
        <div
          className={`flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            isNetworkOnline
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          {isNetworkOnline ? (
            <>
              <Wifi className="w-3 h-3 text-emerald-600" />
              <span>ONLINE</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3 h-3 text-rose-600" />
              <span>OFFLINE</span>
            </>
          )}
        </div>

        {/* Operator Profile */}
        <div className="flex items-center space-x-2.5 border-l border-border-subtle pl-2.5">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-text-primary leading-tight">
              {operator?.fullName || 'Collection Operator'}
            </p>
            <p className="text-[10px] text-text-muted capitalize">
              {operator?.role?.replace(/_/g, ' ').toLowerCase() || 'Operator'}
            </p>
          </div>

          <div className="w-7 h-7 rounded-full bg-peach flex items-center justify-center text-primary-orange font-bold text-xs border border-border-subtle shadow-inner">
            <User className="w-3.5 h-3.5" />
          </div>

          <ClayButton
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            title="End Shift / Logout"
            className="text-text-muted hover:text-rose-600 p-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
          </ClayButton>
        </div>
      </div>
    </header>
  )
}
