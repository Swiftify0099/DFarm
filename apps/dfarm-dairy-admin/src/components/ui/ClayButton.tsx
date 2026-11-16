import React from 'react'
import clsx from 'clsx'

export interface ClayButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
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
    md: 'px-4 py-2.5 text-sm font-semibold gap-2',
    lg: 'px-6 py-3 text-base font-bold gap-2.5',
  }

  const variantClasses = {
    primary: 'clay-btn-primary cursor-pointer',
    secondary: 'clay-btn-secondary cursor-pointer',
    danger:
      'bg-red-500 hover:bg-red-600 text-white shadow-md active:translate-y-0.5 border border-red-400 cursor-pointer rounded-xl',
    success:
      'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md active:translate-y-0.5 border border-emerald-500 cursor-pointer rounded-xl',
    ghost:
      'bg-transparent hover:bg-[#FFE9DC]/50 text-[#211B18] active:translate-y-0.5 cursor-pointer rounded-xl',
  }

  return (
    <button
      disabled={disabled || isLoading}
      className={clsx(
        'inline-flex items-center justify-center transition-all duration-150 select-none outline-none focus:ring-2 focus:ring-[#FF6A00]/30',
        sizeClasses[size],
        variantClasses[variant],
        (disabled || isLoading) && 'opacity-55 cursor-not-allowed hover:transform-none active:transform-none shadow-none',
        className
      )}
      {...props}
    >
      {isLoading ? (
        <svg
          className="animate-spin h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
      ) : (
        leftIcon
      )}
      <span>{children}</span>
      {!isLoading && rightIcon}
    </button>
  )
}
