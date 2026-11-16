import React from 'react'
import { cn } from '@/utils/cn'

export interface TabItem {
  id: string
  label: string
  icon?: React.ReactNode
  badge?: string | number
}

interface ClayTabsProps {
  tabs: TabItem[]
  activeTab: string
  onChange: (tabId: string) => void
  className?: string
}

export const ClayTabs: React.FC<ClayTabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className,
}) => {
  return (
    <div
      className={cn(
        'inline-flex p-1.5 bg-[#FAF2EC] rounded-2xl border border-[#F1E7E0] gap-1 overflow-x-auto shadow-inner',
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 select-none whitespace-nowrap cursor-pointer',
              isActive
                ? 'bg-white text-[#211B18] shadow-sm border border-[#F1E7E0] scale-[1.02]'
                : 'text-[#817A75] hover:text-[#211B18] hover:bg-white/50'
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded-full text-[10px] font-extrabold',
                  isActive
                    ? 'bg-[#FFE9DC] text-[#FF6A00]'
                    : 'bg-[#EBDDD3] text-[#817A75]'
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
