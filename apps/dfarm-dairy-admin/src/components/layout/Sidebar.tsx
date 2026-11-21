import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  UserCheck,
  Users,
  ScanFace,
  CreditCard,
  Clock,
  Droplet,
  Activity,
  TrendingUp,
  BookOpen,
  FileText,
  Receipt,
  Package,
  ShoppingCart,
  Cpu,
  ShieldCheck,
  History,
  BarChart3,
  Building2,
  X,
} from 'lucide-react'
import { DfarmLogo } from '@/assets/illustrations'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import clsx from 'clsx'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

interface NavSection {
  title: string
  items: {
    label: string
    path: string
    icon: React.ReactNode
    badgeQuery?: boolean
  }[]
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth()
  const { data: pendingRequests = [] } = useQuery({
    queryKey: ['pendingRegistrations', user?.dairyId],
    queryFn: () => api.customers.getPending(),
    refetchInterval: 10000,
  })

  const pendingCount = pendingRequests.filter((r) => r.status === 'PENDING').length

  const sections: NavSection[] = [
    {
      title: 'Overview',
      items: [
        {
          label: 'Dairy Dashboard',
          path: '/dashboard',
          icon: <LayoutDashboard size={18} />,
        },
      ],
    },
    {
      title: 'Farmers & Identity',
      items: [
        {
          label: 'Pending Approvals',
          path: '/customers/approvals',
          icon: <UserCheck size={18} />,
          badgeQuery: true,
        },
        {
          label: 'Customer Directory',
          path: '/customers/directory',
          icon: <Users size={18} />,
        },
        {
          label: 'Face Biometrics (YuNet)',
          path: '/biometrics/face-enrollment',
          icon: <ScanFace size={18} />,
        },
        {
          label: 'RFID Card Registry',
          path: '/rfid/cards',
          icon: <CreditCard size={18} />,
        },
      ],
    },
    {
      title: 'Collection & Quality',
      items: [
        {
          label: 'Collection Sessions',
          path: '/collection/sessions',
          icon: <Clock size={18} />,
        },
        {
          label: 'Milk Collection Register',
          path: '/collection/register',
          icon: <Droplet size={18} />,
        },
        {
          label: 'Quality Trends (Fat/SNF)',
          path: '/quality/analytics',
          icon: <Activity size={18} />,
        },
        {
          label: 'Milk Rate Charts',
          path: '/rate-charts',
          icon: <TrendingUp size={18} />,
        },
      ],
    },
    {
      title: 'Accounts & Settlement',
      items: [
        {
          label: 'Customer Ledger',
          path: '/ledger',
          icon: <BookOpen size={18} />,
        },
        {
          label: 'Billing & Settlement',
          path: '/billing',
          icon: <FileText size={18} />,
        },
        {
          label: 'Payments & Receipts',
          path: '/payments',
          icon: <Receipt size={18} />,
        },
      ],
    },
    {
      title: 'Inventory & Feed',
      items: [
        {
          label: 'Feed Inventory',
          path: '/feed/inventory',
          icon: <Package size={18} />,
        },
        {
          label: 'Customer Feed Sales',
          path: '/feed/sales',
          icon: <ShoppingCart size={18} />,
        },
      ],
    },
    {
      title: 'Hardware & Sync',
      items: [
        {
          label: 'Collection Devices',
          path: '/devices',
          icon: <Cpu size={18} />,
        },
      ],
    },
    {
      title: 'Governance & Analytics',
      items: [
        {
          label: 'Reports Hub (17 Reports)',
          path: '/reports',
          icon: <BarChart3 size={18} />,
        },
        {
          label: 'Staff & Permissions',
          path: '/staff',
          icon: <ShieldCheck size={18} />,
        },
        {
          label: 'Audit Trail',
          path: '/audit',
          icon: <History size={18} />,
        },
        {
          label: 'Dairy Profile',
          path: '/profile',
          icon: <Building2 size={18} />,
        },
      ],
    },
  ]

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#211B18]/40 backdrop-blur-xs lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={clsx(
          'fixed top-0 bottom-0 left-0 z-40 w-72 bg-[#FCF8F5] border-r border-[#F1E7E0] flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand header */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-[#F1E7E0] bg-white">
          <div className="flex items-center gap-3">
            <DfarmLogo size={32} />
            <div>
              <span className="font-black text-base text-[#211B18] tracking-tight">DFarm</span>
              <span className="text-[10px] ml-1.5 uppercase font-extrabold tracking-wider px-1.5 py-0.5 bg-[#FFE9DC] text-[#FF6A00] rounded">
                Admin
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-[#817A75] hover:bg-[#FFE9DC]/50 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 text-left">
          {sections.map((sec) => (
            <div key={sec.title}>
              <h5 className="px-3 text-[11px] font-extrabold uppercase tracking-wider text-[#817A75]/80 mb-1.5">
                {sec.title}
              </h5>
              <div className="space-y-0.5">
                {sec.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => onClose()}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all duration-150',
                        isActive
                          ? 'bg-white text-[#FF6A00] shadow-xs border border-[#FFE9DC]'
                          : 'text-[#817A75] hover:text-[#211B18] hover:bg-white/60'
                      )
                    }
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="shrink-0">{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                    {item.badgeQuery && pendingCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#FF6A00] text-white animate-pulse">
                        {pendingCount}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-[#F1E7E0] bg-white text-left">
          <p className="text-[11px] font-bold text-[#211B18]">DFarm Web Admin v1.0</p>
          <p className="text-[10px] text-[#817A75] mt-0.5">YuNet & SFace ONNX Standard</p>
        </div>
      </aside>
    </>
  )
}
