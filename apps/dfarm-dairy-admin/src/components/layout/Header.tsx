import React, { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { DfarmLogo } from '@/assets/illustrations'
import { Bell, LogOut, Shield, Wifi, WifiOff, User } from 'lucide-react'
import { ClayBadge } from '@/components/ui'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'

interface HeaderProps {
  onToggleMobileSidebar: () => void
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileSidebar }) => {
  const { user, logout } = useAuth()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.notifications.getAll(),
    refetchInterval: 15000,
  })

  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: () => api.devices.getAll(),
    refetchInterval: 15000,
  })

  const unreadCount = notifications.filter((n) => !n.isRead).length
  const offlineDevices = devices.filter((d) => d.status === 'OFFLINE')

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 sm:px-6 bg-white/90 backdrop-blur-md border-b border-[#F1E7E0] shadow-xs">
      {/* Left: Mobile Toggle & Tenant Identifier */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileSidebar}
          className="lg:hidden p-2 rounded-xl text-[#817A75] hover:bg-[#FFF5EE] cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex items-center gap-2.5">
          <DfarmLogo size={28} className="hidden sm:block" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm sm:text-base text-[#211B18] tracking-tight">
                {user?.dairyName || 'DFarm Dairy Platform'}
              </span>
              {user?.dairyCode && (
                <ClayBadge variant="neutral" className="hidden md:inline-flex text-[11px] py-0.5 font-mono">
                  {user.dairyCode}
                </ClayBadge>
              )}
            </div>
            <p className="text-[11px] text-[#817A75] font-medium hidden sm:block">
              {user?.dairyName ? `Authorized Dairy Workspace • ${user.dairyCode}` : 'Dairy Management Workspace'}
            </p>
          </div>
        </div>
      </div>

      {/* Right: Operational Status, Alerts & Admin Profile */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Device Sync Status Pill */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[#FFF5EE] border border-[#F1E7E0] rounded-full text-xs">
          {offlineDevices.length === 0 ? (
            <>
              <Wifi size={14} className="text-emerald-600 animate-pulse" />
              <span className="font-semibold text-emerald-800">All Devices Synced</span>
            </>
          ) : (
            <>
              <WifiOff size={14} className="text-amber-600" />
              <span className="font-semibold text-amber-800">{offlineDevices.length} Offline</span>
            </>
          )}
        </div>

        {/* Notifications Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-xl text-[#817A75] hover:text-[#211B18] hover:bg-[#FFF5EE] transition-colors cursor-pointer"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-[#FF6A00] text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-bounce">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Drawer */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-[#F1E7E0] rounded-2xl shadow-xl z-50 p-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-[#F1E7E0]">
                <h4 className="font-bold text-sm text-[#211B18]">Dairy Notifications</h4>
                <span className="text-xs text-[#817A75]">{unreadCount} unread</span>
              </div>
              <div className="mt-2 divide-y divide-[#F1E7E0]/60 max-h-80 overflow-y-auto">
                {notifications.map((notif) => (
                  <div key={notif.id} className="py-3 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <h5 className="text-xs font-bold text-[#211B18]">{notif.title}</h5>
                      <span className="text-[10px] text-[#817A75]">
                        {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-[#817A75] mt-1 leading-relaxed">{notif.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-xl border border-[#F1E7E0] hover:bg-[#FFF5EE] transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-[#FFE9DC] text-[#FF6A00] flex items-center justify-center font-bold text-xs">
              {user?.fullName?.charAt(0) || 'A'}
            </div>
            <div className="text-left hidden lg:block">
              <p className="text-xs font-bold text-[#211B18] leading-tight">{user?.fullName}</p>
              <p className="text-[10px] text-[#817A75] font-semibold">{user?.role?.replace(/_/g, ' ')}</p>
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white border border-[#F1E7E0] rounded-2xl shadow-xl z-50 p-2 animate-in fade-in zoom-in-95 duration-150 text-left">
              <div className="px-3 py-2 border-b border-[#F1E7E0] mb-1">
                <p className="text-xs font-bold text-[#211B18]">{user?.fullName}</p>
                <p className="text-[11px] text-[#817A75] mt-0.5">+91 {user?.mobileNumber}</p>
                <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-700 font-bold">
                  <Shield size={12} />
                  <span>Verified Dairy Admin</span>
                </div>
              </div>

              <button
                onClick={logout}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
