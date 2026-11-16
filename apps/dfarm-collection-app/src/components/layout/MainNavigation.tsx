import React, { useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Milk, Users, Clock, Cpu, RefreshCw, Settings } from 'lucide-react'

interface NavItem {
  key: string
  label: string
  shortcut: string
  path: string
  icon: React.ElementType
}

const NAV_ITEMS: NavItem[] = [
  { key: 'collection', label: 'Milk Collection', shortcut: 'F1', path: '/collection', icon: Milk },
  { key: 'customers', label: 'Customer Directory', shortcut: 'F2', path: '/customers', icon: Users },
  { key: 'sessions', label: 'Shift Sessions', shortcut: 'F3', path: '/sessions', icon: Clock },
  { key: 'devices', label: 'Hardware Telemetry', shortcut: 'F4', path: '/devices', icon: Cpu },
  { key: 'sync', label: 'Offline Queue', shortcut: 'F5', path: '/sync', icon: RefreshCw },
  { key: 'settings', label: 'Kiosk Settings', shortcut: 'F6', path: '/settings', icon: Settings },
]

export const MainNavigation: React.FC = () => {
  const navigate = useNavigate()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent browser default help actions on F1-F6
      if (['F1', 'F2', 'F3', 'F4', 'F5', 'F6'].includes(e.key)) {
        e.preventDefault()
        const target = NAV_ITEMS.find((item) => item.shortcut === e.key)
        if (target) {
          navigate(target.path)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  return (
    <aside className="w-56 bg-cream border-r border-border-subtle flex flex-col justify-between p-3 select-none">
      <div className="space-y-1">
        <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">
          Operational Menu
        </p>
        <nav className="space-y-1.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.key}
                to={item.path}
                className={({ isActive }: { isActive: boolean }) =>
                  `flex items-center justify-between px-3 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 ${
                    isActive
                      ? 'bg-gradient-to-r from-primary-orange to-secondary-orange text-white shadow-md'
                      : 'text-text-primary hover:bg-peach/60 hover:text-primary-orange'
                  }`
                }
              >
                {({ isActive }: { isActive: boolean }) => (
                  <>
                    <div className="flex items-center space-x-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-primary-orange'}`} />
                      <span>{item.label}</span>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                        isActive
                          ? 'bg-white/25 text-white'
                          : 'bg-cream-dark text-text-muted border border-border-subtle'
                      }`}
                    >
                      {item.shortcut}
                    </span>
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>
      </div>

      {/* Terminal Info Footer */}
      <div className="p-3 bg-peach/40 rounded-xl border border-border-subtle text-[11px] text-text-muted space-y-1">
        <p className="font-semibold text-text-primary">Gokul Kiosk #1</p>
        <p>Terminal: DF-KIOSK-001</p>
        <p className="text-[10px] text-text-muted">Build 2026.11-v1.0</p>
      </div>
    </aside>
  )
}
