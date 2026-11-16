import React from 'react'
import clsx from 'clsx'

export type BadgeVariant =
  | 'cow'
  | 'buffalo'
  | 'approved'
  | 'pending'
  | 'rejected'
  | 'online'
  | 'offline'
  | 'measuring'
  | 'neutral'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'

export interface ClayBadgeProps {
  variant?: BadgeVariant
  size?: 'sm' | 'md'
  icon?: React.ReactNode
  className?: string
  children: React.ReactNode
}

export const ClayBadge: React.FC<ClayBadgeProps> = ({
  variant = 'neutral',
  size = 'md',
  icon,
  className = '',
  children,
}) => {
  const variantStyles: Record<BadgeVariant, string> = {
    cow: 'bg-[#FFF5EE] text-[#FF6A00] border border-[#FFE9DC]',
    buffalo: 'bg-[#FCF8F5] text-[#4A413D] border border-[#F1E7E0]',
    approved: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    pending: 'bg-amber-50 text-amber-800 border border-amber-200',
    rejected: 'bg-red-50 text-red-800 border border-red-200',
    online: 'bg-emerald-100 text-emerald-900 border border-emerald-300',
    offline: 'bg-stone-200 text-stone-800 border border-stone-300',
    measuring: 'bg-blue-50 text-blue-800 border border-blue-200 animate-pulse',
    neutral: 'bg-[#FCF8F5] text-[#817A75] border border-[#F1E7E0]',
    primary: 'bg-[#FFE9DC] text-[#FF6A00] border border-[#FF6A00]/30 font-bold',
    secondary: 'bg-[#FCF8F5] text-[#817A75] border border-[#F1E7E0] font-semibold',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold',
    warning: 'bg-amber-50 text-amber-700 border border-amber-300 font-semibold',
    danger: 'bg-rose-50 text-rose-700 border border-rose-300 font-semibold',
  }

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-[10px] gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5',
  }

  return (
    <span className={clsx('clay-badge', sizeStyles[size], variantStyles[variant], className)}>
      {icon}
      <span>{children}</span>
    </span>
  )
}
