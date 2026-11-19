import React from 'react'
import { NavLink } from 'react-router-dom'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { cn } from '@/utils/cn'
import {
  LayoutDashboard,
  Building2,
  Users2,
  Activity,
  BellRing,
  FileText,
  ShieldAlert,
  BarChart3,
  KeyRound,
  LogOut,
  HelpCircle,
  MapPin,
  FileCheck2,
  Percent,
  HardDrive,
  ShieldCheck,
  Settings,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

interface SidebarProps {
  openAlertsCount?: number
  pendingDairiesCount?: number
  onCloseMobile?: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({
  openAlertsCount = 0,
  pendingDairiesCount = 0,
  onCloseMobile,
}) => {
  const { logout, user } = useAuth()

  const navItems = [
    {
      to: '/',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      to: '/dairies',
      label: 'Dairy Management',
      icon: <Building2 className="w-4 h-4" />,
      badge: pendingDairiesCount > 0 ? `${pendingDairiesCount} new` : undefined,
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    },
    {
      to: '/admins',
      label: 'Admin & Operator Management',
      icon: <Users2 className="w-4 h-4" />,
    },
    {
      to: '/locations',
      label: 'Dairy Locations & Discovery',
      icon: <MapPin className="w-4 h-4" />,
    },
    {
      to: '/policies/rate',
      label: 'Global Rate Policies',
      icon: <FileCheck2 className="w-4 h-4" />,
    },
    {
      to: '/policies/fat-snf',
      label: 'Global FAT/SNF Policies',
      icon: <Percent className="w-4 h-4" />,
    },
    {
      to: '/hardware',
      label: 'Hardware Inventory & Allocation',
      icon: <HardDrive className="w-4 h-4" />,
    },
    {
      to: '/amc',
      label: 'AMC & Service Management',
      icon: <ShieldCheck className="w-4 h-4" />,
    },
    {
      to: '/monitoring',
      label: 'Platform Monitoring & Alerts',
      icon: <Activity className="w-4 h-4" />,
      badge: openAlertsCount > 0 ? String(openAlertsCount) : undefined,
      badgeColor: 'bg-rose-100 text-rose-800 border-rose-200',
    },
    {
      to: '/support-access',
      label: 'Support Management',
      icon: <ShieldAlert className="w-4 h-4" />,
    },
    {
      to: '/reports',
      label: 'Platform Reports',
      icon: <BarChart3 className="w-4 h-4" />,
    },
    {
      to: '/audit',
      label: 'Audit Logs',
      icon: <FileText className="w-4 h-4" />,
    },
    {
      to: '/settings',
      label: 'Platform Settings',
      icon: <Settings className="w-4 h-4" />,
    },
  ]

  return (
    <aside className="w-64 h-full flex flex-col bg-[#FFFFFF] border-r border-[#F1E7E0] shadow-sm select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-[#F1E7E0] flex items-center justify-between">
        <BrandLogo size="md" showPlatformBadge={true} />
      </div>

      {/* Navigation Links */}
      <div className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-extrabold uppercase tracking-wider text-[#817A75]">
          Central Administration
        </div>

        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onCloseMobile}
            className={({ isActive }) =>
              cn(
                'flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150',
                isActive
                  ? 'bg-[#FFE9DC] text-[#FF6A00] font-bold shadow-sm border border-[#FDBA74]/50'
                  : 'text-[#817A75] hover:text-[#211B18] hover:bg-[#FFF5EE]'
              )
            }
          >
            <div className="flex items-center gap-2.5">
              {item.icon}
              <span>{item.label}</span>
            </div>
            {item.badge && (
              <span
                className={cn(
                  'px-2 py-0.5 rounded-full text-[10px] font-black border',
                  item.badgeColor || 'bg-[#FFE9DC] text-[#FF6A00]'
                )}
              >
                {item.badge}
              </span>
            )}
          </NavLink>
        ))}
      </div>

      {/* Operator Status Footer */}
      <div className="p-3 border-t border-[#F1E7E0] bg-[#FAF6F3]">
        <div className="p-3 rounded-2xl bg-white border border-[#F1E7E0] shadow-xs flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#FFE9DC] text-[#FF6A00] font-black text-xs flex items-center justify-center border border-[#FDBA74]/40">
              {user?.fullName?.charAt(0) || 'S'}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-bold text-[#211B18] truncate">
                {user?.fullName || 'Super Administrator'}
              </span>
              <span className="text-[10px] text-[#817A75] truncate">
                {user?.roleTitle || 'Platform Operator'}
              </span>
            </div>
          </div>

          <button
            onClick={() => logout()}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors border border-rose-200/60"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
