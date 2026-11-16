import React from 'react'
import { cn } from '@/utils/cn'

interface ClayCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'flat' | 'peach' | 'subtle'
  hoverEffect?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export const ClayCard: React.FC<ClayCardProps> = ({
  children,
  className,
  variant = 'default',
  hoverEffect = false,
  padding = 'md',
  ...props
}) => {
  const variantStyles = {
    default: 'clay-card',
    flat: 'clay-card-flat',
    peach: 'clay-card-peach',
    subtle: 'bg-[#FAF2EC] border border-[#F1E7E0] rounded-2xl shadow-sm',
  }[variant]

  const paddingStyles = {
    none: 'p-0',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  }[padding]

  return (
    <div
      className={cn(
        variantStyles,
        paddingStyles,
        hoverEffect && 'cursor-pointer hover:-translate-y-0.5',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
