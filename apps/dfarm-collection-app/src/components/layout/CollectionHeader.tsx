import React from 'react'
import { useAuth } from '@/context/AuthContext'
import { useHardware } from '@/context/HardwareContext'
import { DfarmCollectionLogo } from '@/assets/illustrations'
import { ClayBadge, ClayButton } from '@/components/ui'
import { Wifi, WifiOff, RefreshCw, LogOut, User, Layers } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export const CollectionHeader: React.FC = () => {
  const { operator, logout } = useAuth()
  const { activeSession, isNetworkOnline, offlineQueueCount } = useHardware()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="h-16 bg-cream border-b border-border-subtle px-6 flex items-center justify-between clay-card rounded-none z-20">
      {/* Brand & Dairy Identity */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => navigate('/collection')}>
          <DfarmCollectionLogo size={36} />
          <div>
            <h1 className="text-lg font-bold text-text-primary tracking-tight leading-tight">
              DFarm Collection
            </h1>
            <p className="text-xs text-text-secondary font-medium">
              {operator?.dairyName || 'Authorized Dairy Cooperative'} •{' '}
              <span className="font-semibold text-primary-orange">{operator?.dairyCode || 'DAIRY'}</span>
            </p>
          </div>
        </div>

        {/* Shift Badge */}
        {activeSession && (
          <div className="hidden lg:flex items-center space-x-2 border-l border-border-subtle pl-4">
            <ClayBadge variant={activeSession.shift === 'MORNING' ? 'warning' : 'primary'} size="sm">
              <Layers className="w-3.5 h-3.5 mr-1" />
              {activeSession.shift} SHIFT
            </ClayBadge>
            <span className="text-xs text-text-muted font-mono">{activeSession.sessionCode}</span>
          </div>
        )}
      </div>

      {/* Network, Queue, and Operator Controls */}
      <div className="flex items-center space-x-3">
        {/* Offline Queue Badge */}
        {offlineQueueCount > 0 ? (
          <div
            onClick={() => navigate('/sync')}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-orange-100 text-primary-orange text-xs font-semibold cursor-pointer border border-primary-orange/30 animate-pulse"
            title="Click to view offline queue"
          >
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>{offlineQueueCount} Pending Queue</span>
          </div>
        ) : (
          <div className="hidden md:flex items-center space-x-1 text-xs text-text-muted font-medium px-2 py-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>All Synced</span>
          </div>
        )}

        {/* Network Status Pill */}
        <div
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
            isNetworkOnline
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          {isNetworkOnline ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              <span>ONLINE</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-rose-600" />
              <span>OFFLINE MODE</span>
            </>
          )}
        </div>

        {/* Operator Profile */}
        <div className="flex items-center space-x-3 border-l border-border-subtle pl-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-text-primary leading-tight">
              {operator?.fullName || 'Collection Operator'}
            </p>
            <p className="text-[10px] text-text-muted capitalize">
              {operator?.role?.replace(/_/g, ' ').toLowerCase() || 'Operator'}
            </p>
          </div>

          <div className="w-8 h-8 rounded-full bg-peach flex items-center justify-center text-primary-orange font-bold text-sm border border-border-subtle shadow-inner">
            <User className="w-4 h-4" />
          </div>

          <ClayButton
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            title="End Shift / Logout"
            className="text-text-muted hover:text-rose-600 p-2"
          >
            <LogOut className="w-4 h-4" />
          </ClayButton>
        </div>
      </div>
    </header>
  )
}
