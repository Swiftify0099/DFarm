import React from 'react';
import { useAuth } from '../context/AuthContext.js';

export type NavSection =
  | 'dashboard'
  | 'customers'
  | 'collections'
  | 'rates'
  | 'accounting'
  | 'feed'
  | 'employees'
  | 'devices'
  | 'reports'
  | 'settings';

export interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  isMobileOpen,
  onCloseMobile,
}) => {
  const { user, hasRole } = useAuth();

  const navItems: {
    id: NavSection;
    label: string;
    icon: string;
    badge?: string;
    visible: boolean;
  }[] = [
    {
      id: 'dashboard',
      label: 'Main Dashboard',
      icon: '📊',
      visible: true,
    },
    {
      id: 'customers',
      label: 'Customer Management',
      icon: '👥',
      visible: true,
    },
    {
      id: 'collections',
      label: 'Milk Collections',
      icon: '🥛',
      visible: true,
    },
    {
      id: 'rates',
      label: 'Rate Charts & Pricing',
      icon: '📈',
      visible: hasRole(['SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'SUPERVISOR']),
    },
    {
      id: 'accounting',
      label: 'Billing & Accounting',
      icon: '💰',
      visible: hasRole(['SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'ACCOUNTANT', 'SUPERVISOR']),
    },
    {
      id: 'feed',
      label: 'Feed Inventory & POS',
      icon: '🌾',
      badge: 'P14',
      visible: true,
    },
    {
      id: 'employees',
      label: 'Staff & Payroll',
      icon: '👔',
      badge: 'P16',
      visible: hasRole(['SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'ACCOUNTANT', 'SUPERVISOR']),
    },
    {
      id: 'devices',
      label: 'Devices & Offline Sync',
      icon: '📟',
      visible: hasRole(['SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'SUPERVISOR']),
    },
    {
      id: 'reports',
      label: 'Reports & Analytics',
      icon: '📑',
      visible: hasRole(['SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'SUPERVISOR', 'ACCOUNTANT']),
    },
    {
      id: 'settings',
      label: 'Settings & Centers',
      icon: '⚙️',
      visible: true,
    },
  ];

  const content = (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 w-64 select-none">
      {/* Brand Header */}
      <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white text-lg font-black shadow-lg shadow-emerald-500/20">
            D
          </div>
          <div>
            <span className="font-extrabold text-base tracking-tight text-white block">
              DFARM
            </span>
            <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 block -mt-1">
              Smart Dairy ERP
            </span>
          </div>
        </div>
        <button
          onClick={onCloseMobile}
          className="lg:hidden text-slate-400 hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 pb-2">
          Operations
        </div>
        {navItems
          .filter((item) => item.visible)
          .map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectSection(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-base">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      isActive ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
      </nav>

      {/* Staff Identity Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
            {user?.fullName?.slice(0, 2).toUpperCase() || 'ST'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white truncate">{user?.fullName || 'Staff User'}</p>
            <p className="text-[10px] text-emerald-400 font-semibold truncate uppercase">
              {user?.role?.replace(/_/g, ' ') || 'COLLECTION OPERATOR'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block shrink-0 h-screen sticky top-0 shadow-xl z-20">
        {content}
      </aside>

      {/* Mobile Drawer Backdrop */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={onCloseMobile}
        >
          <div
            className="fixed inset-y-0 left-0 z-50 animate-slide-right"
            onClick={(e) => e.stopPropagation()}
          >
            {content}
          </div>
        </div>
      )}
    </>
  );
};
