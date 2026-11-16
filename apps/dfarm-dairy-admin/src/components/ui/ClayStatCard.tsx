import React from 'react'
import { ClayCard } from './ClayCard'
import clsx from 'clsx'

export interface ClayStatCardProps {
  title: string
  value: string | number
  unit?: string
  subtitle?: string
  trend?: {
    value: string | number
    isPositive?: boolean
    label?: string
  }
  icon?: React.ReactNode
  iconBgColor?: string
  className?: string
  onClick?: () => void
}

export const ClayStatCard: React.FC<ClayStatCardProps> = ({
  title,
  value,
  unit,
  subtitle,
  trend,
  icon,
  iconBgColor = 'bg-[#FFE9DC]',
  className = '',
  onClick,
}) => {
  return (
    <ClayCard
      interactive={!!onClick}
      onClick={onClick}
      className={clsx('flex flex-col justify-between !p-5 relative overflow-hidden', className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-[#817A75] uppercase tracking-wider">{title}</p>
          <div className="flex items-baseline gap-1.5 mt-2">
            <h3 className="text-2xl sm:text-3xl font-extrabold text-[#211B18] tracking-tight">{value}</h3>
            {unit && <span className="text-xs font-semibold text-[#817A75]">{unit}</span>}
          </div>
        </div>
        {icon && (
          <div
            className={clsx(
              'w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border border-white/60 shadow-xs',
              iconBgColor
            )}
          >
            {icon}
          </div>
        )}
      </div>

      {(subtitle || trend) && (
        <div className="mt-3 pt-3 border-t border-[#F1E7E0]/60 flex items-center justify-between text-xs">
          {subtitle && <span className="text-[#817A75] font-medium truncate">{subtitle}</span>}
          {trend && (
            <span
              className={clsx(
                'inline-flex items-center gap-1 font-bold shrink-0',
                trend.isPositive ? 'text-emerald-700' : 'text-amber-700'
              )}
            >
              {trend.isPositive ? '↑' : '↓'} {trend.value} {trend.label}
            </span>
          )}
        </div>
      )}
    </ClayCard>
  )
}
