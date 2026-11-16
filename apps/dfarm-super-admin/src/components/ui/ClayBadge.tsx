import React from 'react'
import { cn } from '@/utils/cn'
import { CheckCircle2, AlertTriangle, Clock, XCircle, ShieldCheck, Activity } from 'lucide-react'

export type BadgeVariant =
  | 'active'
  | 'draft_onboarding'
  | 'suspended'
  | 'pending_verification'
  | 'disabled'
  | 'verified'
  | 'unverified'
  | 'healthy'
  | 'degraded'
  | 'failing'
  | 'critical'
  | 'warning'
  | 'info'
  | 'open'
  | 'resolved'
  | 'acknowledged'
  | 'neutral'
  | 'operational'
  | 'outage'
  | 'major'
  | 'minor'

interface ClayBadgeProps {
  variant: BadgeVariant
  label?: string
  className?: string
  showIcon?: boolean
}

export const ClayBadge: React.FC<ClayBadgeProps> = ({
  variant,
  label,
  className,
  showIcon = true,
}) => {
  const config: Record<
    BadgeVariant,
    { text: string; bgClass: string; icon: React.ReactNode }
  > = {
    active: {
      text: 'Active',
      bgClass: 'clay-pill-active',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
    },
    operational: {
      text: 'Operational',
      bgClass: 'clay-pill-active',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
    },
    draft_onboarding: {
      text: 'Draft / Onboarding',
      bgClass: 'clay-pill-draft',
      icon: <Clock className="w-3.5 h-3.5 text-amber-600" />,
    },
    suspended: {
      text: 'Suspended',
      bgClass: 'clay-pill-suspended',
      icon: <XCircle className="w-3.5 h-3.5 text-rose-600" />,
    },
    outage: {
      text: 'Outage',
      bgClass: 'clay-pill-suspended',
      icon: <XCircle className="w-3.5 h-3.5 text-rose-600" />,
    },
    disabled: {
      text: 'Disabled',
      bgClass: 'clay-pill-suspended',
      icon: <XCircle className="w-3.5 h-3.5 text-rose-600" />,
    },
    pending_verification: {
      text: 'Pending Verification',
      bgClass: 'clay-pill-draft',
      icon: <Clock className="w-3.5 h-3.5 text-amber-600" />,
    },
    verified: {
      text: 'Verified',
      bgClass: 'clay-pill-active',
      icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />,
    },
    unverified: {
      text: 'Unverified',
      bgClass: 'clay-pill-draft',
      icon: <Clock className="w-3.5 h-3.5 text-amber-600" />,
    },
    healthy: {
      text: 'Healthy',
      bgClass: 'clay-pill-active',
      icon: <Activity className="w-3.5 h-3.5 text-emerald-600" />,
    },
    degraded: {
      text: 'Degraded',
      bgClass: 'clay-pill-draft',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />,
    },
    failing: {
      text: 'Failing',
      bgClass: 'clay-pill-suspended',
      icon: <XCircle className="w-3.5 h-3.5 text-rose-600" />,
    },
    critical: {
      text: 'Critical',
      bgClass: 'clay-pill-suspended',
      icon: <XCircle className="w-3.5 h-3.5 text-rose-600" />,
    },
    major: {
      text: 'Major Incident',
      bgClass: 'clay-pill-suspended',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />,
    },
    warning: {
      text: 'Warning',
      bgClass: 'clay-pill-draft',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />,
    },
    minor: {
      text: 'Minor Incident',
      bgClass: 'clay-pill-draft',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />,
    },
    info: {
      text: 'Info',
      bgClass: 'clay-pill-info',
      icon: <Activity className="w-3.5 h-3.5 text-blue-600" />,
    },
    open: {
      text: 'Open',
      bgClass: 'clay-pill-orange',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />,
    },
    acknowledged: {
      text: 'Acknowledged',
      bgClass: 'clay-pill-draft',
      icon: <Clock className="w-3.5 h-3.5 text-amber-600" />,
    },
    resolved: {
      text: 'Resolved',
      bgClass: 'clay-pill-active',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
    },
    neutral: {
      text: 'Standard',
      bgClass: 'bg-stone-100 text-stone-700 border-stone-200',
      icon: null,
    },
  }

  const current = config[variant] || config.neutral

  return (
    <span className={cn('clay-pill', current.bgClass, className)}>
      {showIcon && current.icon}
      <span>{label || current.text}</span>
    </span>
  )
}
