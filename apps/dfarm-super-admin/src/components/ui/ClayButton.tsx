import React from 'react'
import { cn } from '@/utils/cn'
import { Loader2 } from 'lucide-react'

interface ClayButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export const ClayButton: React.FC<ClayButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  disabled,
  ...props
}) => {
  const variantStyles = {
    primary: 'clay-btn-primary',
    secondary: 'clay-btn-secondary',
    danger: 'clay-btn-danger',
    outline:
      'bg-white text-[#211B18] border border-[#F1E7E0] hover:border-[#FF6A00] hover:text-[#FF6A00] shadow-sm transition-all',
    ghost:
      'bg-transparent text-[#817A75] hover:text-[#211B18] hover:bg-[#FAF2EC] transition-all',
  }[variant]

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
    md: 'px-4 py-2 text-sm rounded-xl gap-2',
    lg: 'px-6 py-3 text-base rounded-2xl gap-2.5',
  }[size]

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium select-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
        variantStyles,
        sizeStyles,
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current" />
      ) : (
        leftIcon
      )}
      <span>{children}</span>
      {!isLoading && rightIcon}
    </button>
  )
}
