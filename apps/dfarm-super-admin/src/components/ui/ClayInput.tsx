import React, { forwardRef } from 'react'
import { cn } from '@/utils/cn'

export interface ClayInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export const ClayInput = forwardRef<HTMLInputElement, ClayInputProps>(
  ({ className, label, error, helperText, leftIcon, rightIcon, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-xs font-semibold text-[#211B18] tracking-wide">
            {label}
            {props.required && <span className="text-[#FF6A00] ml-1">*</span>}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 text-[#817A75] pointer-events-none flex items-center">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={cn(
              'clay-input w-full px-3.5 py-2 text-sm text-[#211B18] placeholder-[#817A75]/60 transition-all duration-150',
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              error && 'border-rose-400 focus:border-rose-500 focus:ring-rose-200 bg-rose-50/20',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 text-[#817A75] flex items-center">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
        {helperText && !error && <p className="text-xs text-[#817A75]">{helperText}</p>}
      </div>
    )
  }
)

ClayInput.displayName = 'ClayInput'
