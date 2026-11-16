import React from 'react'
import clsx from 'clsx'

export interface ClayButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  children: React.ReactNode
}

export const ClayButton: React.FC<ClayButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  disabled,
  className = '',
  children,
  ...props
}) => {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs font-semibold gap-1.5',
    md: 'px-4 py-2.5 text-sm font-bold gap-2',
    lg: 'px-6 py-3 text-base font-extrabold gap-2.5',
    xl: 'px-8 py-4 text-lg font-black tracking-wide gap-3',
  }

  const variantClasses = {
    primary: 'clay-btn-primary cursor-pointer',
    secondary: 'clay-btn-secondary cursor-pointer',
    danger:
      'bg-red-500 hover:bg-red-600 text-white shadow-md active:translate-y-0.5 border border-red-400 cursor-pointer rounded-xl font-bold',
    success:
      'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md active:translate-y-0.5 border border-emerald-500 cursor-pointer rounded-xl font-bold',
    ghost:
      'bg-transparent hover:bg-[#FFE9DC]/60 text-[#211B18] active:translate-y-0.5 cursor-pointer rounded-xl font-bold',
    outline:
      'bg-transparent hover:bg-[#FFE9DC]/40 text-[#211B18] border border-[#F1E7E0] hover:border-[#FF6A00]/50 active:translate-y-0.5 cursor-pointer rounded-xl font-semibold',
  }

  return (
    <button
      disabled={disabled || isLoading}
      className={clsx(
        'inline-flex items-center justify-center transition-all duration-150 select-none outline-none focus:ring-2 focus:ring-[#FF6A00]/40',
        sizeClasses[size],
        variantClasses[variant],
        (disabled || isLoading) && 'opacity-50 cursor-not-allowed hover:transform-none active:transform-none shadow-none',
        className
      )}
      {...props}
    >
      {isLoading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5" />
      ) : (
        leftIcon && <span className="flex-shrink-0">{leftIcon}</span>
      )}
      <span>{children}</span>
      {rightIcon && <span className="flex-shrink-0 ml-1.5">{rightIcon}</span>}
    </button>
  )
}
