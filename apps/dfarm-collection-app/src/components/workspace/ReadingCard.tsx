import React from 'react'
import { ClayCard } from '@/components/ui'

interface ReadingCardProps {
  label: string
  value: number | string
  unit: string
  icon: React.ElementType
  status?: 'valid' | 'warning' | 'error'
  statusNote?: string
  onChangeValue?: (val: number) => void
  editable?: boolean
  step?: number
  min?: number
  max?: number
}

export const ReadingCard: React.FC<ReadingCardProps> = ({
  label,
  value,
  unit,
  icon: Icon,
  status = 'valid',
  statusNote,
  onChangeValue,
  editable = false,
  step = 0.1,
  min = 0,
  max = 100,
}) => {
  const statusColors = {
    valid: 'text-text-primary border-border-subtle focus-within:border-primary-orange',
    warning: 'text-amber-700 border-amber-300 bg-amber-50/40',
    error: 'text-rose-700 border-rose-300 bg-rose-50/40',
  }

  const indicatorColors = {
    valid: 'bg-emerald-500',
    warning: 'bg-amber-500 animate-pulse',
    error: 'bg-rose-500 animate-ping',
  }

  return (
    <ClayCard className={`p-4 flex flex-col justify-between border ${statusColors[status]} transition-all`}>
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-peach/60 flex items-center justify-center text-primary-orange">
            <Icon className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">{label}</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className={`w-2 h-2 rounded-full ${indicatorColors[status]}`} />
          {statusNote && <span className="text-[10px] font-medium text-text-muted">{statusNote}</span>}
        </div>
      </div>

      {/* Large Digital Inset LCD Display */}
      <div className="my-2 py-2 px-3 bg-stone-900 rounded-xl border border-stone-800 shadow-inner flex items-baseline justify-between">
        {editable ? (
          <input
            type="number"
            step={step}
            min={min}
            max={max}
            value={value}
            onChange={(e) => onChangeValue && onChangeValue(parseFloat(e.target.value) || 0)}
            className="w-full bg-transparent text-emerald-400 font-mono font-bold text-2xl tracking-wider focus:outline-none"
          />
        ) : (
          <span className="text-2xl font-mono font-bold text-emerald-400 tracking-wider">
            {typeof value === 'number' ? value.toFixed(2) : value}
          </span>
        )}
        <span className="text-xs font-mono font-semibold text-stone-400 ml-2">{unit}</span>
      </div>

      {/* Footer Info */}
      <div className="text-[10px] text-text-muted flex justify-between items-center">
        <span>Hardware Sync: Live</span>
        <span className="font-mono">COM Verified</span>
      </div>
    </ClayCard>
  )
}
