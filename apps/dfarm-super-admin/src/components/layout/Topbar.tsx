import React, { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { apiClient } from '@/api/client'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { Link } from 'react-router-dom'
import {
  Menu,
  Bell,
  Activity,
  ShieldAlert,
  Clock,
  Sparkles,
  ExternalLink,
} from 'lucide-react'

interface TopbarProps {
  onToggleMobileMenu: () => void
}

export const Topbar: React.FC<TopbarProps> = ({ onToggleMobileMenu }) => {
  const { session, user } = useAuth()
  const [sessionRemaining, setSessionRemaining] = useState<string>('')

  // Fetch active support session
  const { data: activeSupportSession } = useQuery({
    queryKey: queryKeys.support.active,
    queryFn: () => apiClient.getActiveSupportSession(),
    refetchInterval: 10000,
  })

  // Fetch alerts count
  const { data: alerts = [] } = useQuery({
    queryKey: queryKeys.alerts.list({ status: 'open' }),
    queryFn: () => apiClient.getAlerts({ status: 'open' }),
    refetchInterval: 15000,
  })

  // Session timer countdown
  useEffect(() => {
    if (!session?.expiresAt) return

    const updateTimer = () => {
      const diffMs = new Date(session.expiresAt).getTime() - Date.now()
      if (diffMs <= 0) {
        setSessionRemaining('Expired')
        return
      }
      const hours = Math.floor(diffMs / (1000 * 60 * 60))
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
      setSessionRemaining(`${hours}h ${minutes}m`)
    }

    updateTimer()
    const timer = setInterval(updateTimer, 60000)
    return () => clearInterval(timer)
  }, [session])

  return (
    <header className="h-16 px-6 bg-white/95 backdrop-blur-md border-b border-[#F1E7E0] flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Left: Mobile Toggle & Status */}
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleMobileMenu}
          className="lg:hidden p-2 rounded-xl text-[#817A75] hover:text-[#211B18] hover:bg-[#FAF2EC] transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Platform Status Pulse */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#ECFDF5] border border-emerald-200/80 text-emerald-800 text-xs font-semibold shadow-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Multi-Tenant Cluster Operational</span>
          <span className="text-emerald-600/70 text-[10px]">ap-south-1</span>
        </div>
      </div>

      {/* Center: Active Controlled Support Session Notice (if active) */}
      {activeSupportSession && (
        <Link
          to="/support-access"
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold animate-pulse hover:bg-rose-100 transition-colors shadow-sm"
        >
          <ShieldAlert className="w-4 h-4 text-rose-600" />
          <span>
            Active Support Session: <strong>{activeSupportSession.dairyName}</strong>
          </span>
          <ExternalLink className="w-3.5 h-3.5 text-rose-500" />
        </Link>
      )}

      {/* Right: Session Countdown & Alerts */}
      <div className="flex items-center gap-3">
        {/* Session Time Remaining */}
        {sessionRemaining && (
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FAF2EC] text-[#817A75] text-xs border border-[#F1E7E0]">
            <Clock className="w-3.5 h-3.5 text-[#FF6A00]" />
            <span>Session:</span>
            <strong className="text-[#211B18]">{sessionRemaining}</strong>
          </div>
        )}

        {/* Alerts Bell Link */}
        <Link
          to="/alerts"
          className="relative p-2.5 rounded-xl bg-white border border-[#F1E7E0] text-[#817A75] hover:text-[#FF6A00] hover:border-[#FF6A00] transition-all shadow-xs"
          title="Platform Alerts"
        >
          <Bell className="w-4 h-4" />
          {alerts.length > 0 && (
            <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-black border-2 border-white">
              {alerts.length}
            </span>
          )}
        </Link>

        {/* Super Admin Badge */}
        <div className="flex items-center gap-2 pl-2 border-l border-[#F1E7E0]">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FF7B1A] to-[#FF6A00] text-white flex items-center justify-center font-bold text-xs shadow-sm">
            {user?.fullName?.charAt(0) || 'P'}
          </div>
          <div className="hidden xl:flex flex-col">
            <span className="text-xs font-bold text-[#211B18] leading-tight">
              {user?.fullName || 'Super Administrator'}
            </span>
            <span className="text-[10px] text-emerald-600 font-semibold leading-tight">
              Platform Authorized
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
