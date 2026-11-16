import React, { forwardRef } from 'react'
import { cn } from '@/utils/cn'

export interface ClayTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helperText?: string
}

export const ClayTextarea = forwardRef<HTMLTextAreaElement, ClayTextareaProps>(
  ({ className, label, error, helperText, id, rows = 3, ...props }, ref) => {
    const textareaId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={textareaId} className="text-xs font-semibold text-[#211B18] tracking-wide">
            {label}
            {props.required && <span className="text-[#FF6A00] ml-1">*</span>}
          </label>
        )}
        <textarea
          id={textareaId}
          ref={ref}
          rows={rows}
          className={cn(
            'clay-input w-full px-3.5 py-2.5 text-sm text-[#211B18] placeholder-[#817A75]/60 resize-y transition-all duration-150',
            error && 'border-rose-400 focus:border-rose-500 bg-rose-50/20',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
        {helperText && !error && <p className="text-xs text-[#817A75]">{helperText}</p>}
      </div>
    )
  }
)

ClayTextarea.displayName = 'ClayTextarea'
