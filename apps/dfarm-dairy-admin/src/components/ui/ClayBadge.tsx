import React from 'react'
import clsx from 'clsx'

export type BadgeVariant =
  | 'approved'
  | 'pending'
  | 'rejected'
  | 'active'
  | 'inactive'
  | 'cow'
  | 'buffalo'
  | 'online'
  | 'offline'
  | 'warning'
  | 'neutral'

export interface ClayBadgeProps {
  variant?: BadgeVariant
  icon?: React.ReactNode
  className?: string
  children: React.ReactNode
}

export const ClayBadge: React.FC<ClayBadgeProps> = ({
  variant = 'neutral',
  icon,
  className = '',
  children,
}) => {
  const variantStyles: Record<BadgeVariant, string> = {
    approved: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    active: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    pending: 'bg-amber-50 text-amber-800 border border-amber-200',
    warning: 'bg-amber-50 text-amber-800 border border-amber-200',
    rejected: 'bg-red-50 text-red-800 border border-red-200',
    inactive: 'bg-stone-100 text-stone-700 border border-stone-200',
    cow: 'bg-[#FFF5EE] text-[#FF6A00] border border-[#FFE9DC]',
    buffalo: 'bg-[#FCF8F5] text-[#4A413D] border border-[#F1E7E0]',
    online: 'bg-emerald-100 text-emerald-900 border border-emerald-300',
    offline: 'bg-stone-200 text-stone-800 border border-stone-300',
    neutral: 'bg-[#FCF8F5] text-[#817A75] border border-[#F1E7E0]',
  }

  return (
    <span className={clsx('clay-badge', variantStyles[variant], className)}>
      {icon}
      <span>{children}</span>
    </span>
  )
}
