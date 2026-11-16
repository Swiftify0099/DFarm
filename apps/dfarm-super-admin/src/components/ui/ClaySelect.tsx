import React, { forwardRef } from 'react'
import { cn } from '@/utils/cn'
import { ChevronDown } from 'lucide-react'

export interface ClaySelectOption {
  value: string
  label: string
}

export interface ClaySelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options?: ClaySelectOption[]
  error?: string
  helperText?: string
}

export const ClaySelect = forwardRef<HTMLSelectElement, ClaySelectProps>(
  ({ className, label, options, error, helperText, id, children, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-xs font-semibold text-[#211B18] tracking-wide">
            {label}
            {props.required && <span className="text-[#FF6A00] ml-1">*</span>}
          </label>
        )}
        <div className="relative flex items-center">
          <select
            id={selectId}
            ref={ref}
            className={cn(
              'clay-input w-full appearance-none px-3.5 py-2 pr-9 text-sm text-[#211B18] bg-[#FAF6F3] cursor-pointer',
              error && 'border-rose-400 focus:border-rose-500 bg-rose-50/20',
              className
            )}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <div className="absolute right-3 text-[#817A75] pointer-events-none flex items-center">
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
        {helperText && !error && <p className="text-xs text-[#817A75]">{helperText}</p>}
      </div>
    )
  }
)

ClaySelect.displayName = 'ClaySelect'
