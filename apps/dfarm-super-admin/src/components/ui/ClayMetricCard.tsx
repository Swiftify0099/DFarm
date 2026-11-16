import React from 'react'
import { ClayCard } from './ClayCard'
import { cn } from '@/utils/cn'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface ClayMetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  trend?: {
    value: string
    isPositive?: boolean
    label?: string
  }
  variant?: 'default' | 'peach' | 'flat'
  className?: string
  onClick?: () => void
}

export const ClayMetricCard: React.FC<ClayMetricCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  variant = 'default',
  className,
  onClick,
}) => {
  return (
    <ClayCard
      variant={variant}
      padding="md"
      className={cn('flex flex-col justify-between gap-3 relative overflow-hidden', className)}
      hoverEffect={!!onClick}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-[#817A75]">
          {title}
        </span>
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{
            background: 'linear-gradient(135deg, #FFE9DC 0%, #FFF5EE 100%)',
            border: '1px solid #F1E7E0',
            boxShadow:
              '0 4px 8px -2px rgba(255, 106, 0, 0.15), inset 0 1px 1px 0 rgba(255, 255, 255, 0.9)',
            color: '#FF6A00',
          }}
        >
          {icon}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-2xl font-black tracking-tight text-[#211B18]">{value}</div>
        {(subtitle || trend) && (
          <div className="flex items-center gap-2 text-xs">
            {trend && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 font-bold',
                  trend.isPositive ? 'text-emerald-600' : 'text-rose-600'
                )}
              >
                {trend.isPositive ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" />
                )}
                {trend.value}
              </span>
            )}
            {subtitle && <span className="text-[#817A75]">{subtitle}</span>}
          </div>
        )}
      </div>
    </ClayCard>
  )
}
