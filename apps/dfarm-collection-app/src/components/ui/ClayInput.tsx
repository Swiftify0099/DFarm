import React, { forwardRef } from 'react'
import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'

export interface ClayInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  leftIcon?: React.ReactNode
  rightElement?: React.ReactNode
}

export const ClayInput = forwardRef<HTMLInputElement, ClayInputProps>(
  ({ label, error, hint, leftIcon, rightElement, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    return (
      <div className="w-full flex flex-col gap-1.5 text-left">
        {label && (
          <label htmlFor={inputId} className="text-xs font-bold text-[#817A75] uppercase tracking-wider">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3.5 text-[#817A75] pointer-events-none flex items-center justify-center">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={clsx(
              'clay-input w-full',
              leftIcon ? 'pl-10' : 'pl-3.5',
              rightElement ? 'pr-12' : 'pr-3.5',
              error && 'border-red-400 bg-red-50/30 focus:border-red-500 focus:ring-red-400/20',
              className
            )}
            {...props}
          />
          {rightElement && <div className="absolute right-3 flex items-center">{rightElement}</div>}
        </div>
        {error && <p className="text-xs text-red-500 font-medium mt-0.5">{error}</p>}
        {hint && !error && <p className="text-xs text-[#817A75] mt-0.5">{hint}</p>}
      </div>
    )
  }
)

ClayInput.displayName = 'ClayInput'

export interface ClaySelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: string
  options: { label: string; value: string | number }[]
}

export const ClaySelect = forwardRef<HTMLSelectElement, ClaySelectProps>(
  ({ label, error, hint, options, className = '', id, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    return (
      <div className="w-full flex flex-col gap-1.5 text-left">
        {label && (
          <label htmlFor={selectId} className="text-xs font-bold text-[#817A75] uppercase tracking-wider">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          <select
            id={selectId}
            ref={ref}
            className={clsx(
              'clay-input w-full appearance-none pr-9 cursor-pointer',
              error && 'border-red-400 bg-red-50/30',
              className
            )}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="absolute right-3 pointer-events-none text-[#817A75]">
            <ChevronDown size={16} />
          </div>
        </div>
        {error && <p className="text-xs text-red-500 font-medium mt-0.5">{error}</p>}
        {hint && !error && <p className="text-xs text-[#817A75] mt-0.5">{hint}</p>}
      </div>
    )
  }
)

ClaySelect.displayName = 'ClaySelect'
