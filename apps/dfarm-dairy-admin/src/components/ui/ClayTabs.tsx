import React from 'react'
import clsx from 'clsx'

export interface TabItem {
  id: string
  label: string
  badge?: number | string
  icon?: React.ReactNode
}

export interface ClayTabsProps {
  tabs: TabItem[]
  activeTab: string
  onChange: (tabId: string) => void
  className?: string
}

export const ClayTabs: React.FC<ClayTabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className = '',
}) => {
  return (
    <div
      className={clsx(
        'inline-flex flex-wrap p-1.5 bg-[#FFF5EE] border border-[#F1E7E0] rounded-xl shadow-inner gap-1',
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={clsx(
              'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer select-none',
              isActive
                ? 'bg-white text-[#FF6A00] shadow-sm border border-[#FFE9DC]'
                : 'text-[#817A75] hover:text-[#211B18] hover:bg-white/40'
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={clsx(
                  'px-1.5 py-0.2 rounded-full text-[10px] font-bold',
                  isActive ? 'bg-[#FFE9DC] text-[#FF6A00]' : 'bg-[#E5D8CF] text-[#211B18]'
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
