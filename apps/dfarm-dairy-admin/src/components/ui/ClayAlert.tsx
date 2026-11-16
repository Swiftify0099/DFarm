import React from 'react'
import clsx from 'clsx'
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react'

export interface ClayAlertProps {
  type?: 'info' | 'warning' | 'danger' | 'success'
  title?: string
  message: React.ReactNode
  className?: string
  action?: React.ReactNode
}

export const ClayAlert: React.FC<ClayAlertProps> = ({
  type = 'info',
  title,
  message,
  className = '',
  action,
}) => {
  const styles = {
    info: {
      bg: 'bg-blue-50/70 border-blue-200 text-blue-900',
      icon: <Info className="text-blue-600 shrink-0" size={18} />,
    },
    warning: {
      bg: 'bg-amber-50/70 border-amber-200 text-amber-900',
      icon: <AlertTriangle className="text-amber-600 shrink-0" size={18} />,
    },
    danger: {
      bg: 'bg-red-50/70 border-red-200 text-red-900',
      icon: <AlertCircle className="text-red-600 shrink-0" size={18} />,
    },
    success: {
      bg: 'bg-emerald-50/70 border-emerald-200 text-emerald-900',
      icon: <CheckCircle2 className="text-emerald-600 shrink-0" size={18} />,
    },
  }

  const current = styles[type]

  return (
    <div
      className={clsx(
        'p-4 rounded-xl border flex items-start gap-3 shadow-xs',
        current.bg,
        className
      )}
    >
      <div className="mt-0.5">{current.icon}</div>
      <div className="flex-1 text-sm">
        {title && <h5 className="font-bold mb-0.5">{title}</h5>}
        <div className="text-xs leading-relaxed opacity-90">{message}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
