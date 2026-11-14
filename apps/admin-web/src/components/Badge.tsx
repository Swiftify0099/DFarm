import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', size = 'sm' }) => {
  const variantStyles = {
    success: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    warning: 'bg-amber-100 text-amber-800 border-amber-200',
    danger: 'bg-rose-100 text-rose-800 border-rose-200',
    info: 'bg-sky-100 text-sky-800 border-sky-200',
    purple: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    neutral: 'bg-gray-100 text-gray-800 border-gray-200',
  };

  const sizeStyles = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
  };

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full border ${variantStyles[variant]} ${sizeStyles[size]}`}
    >
      {children}
    </span>
  );
};

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const s = (status || '').toUpperCase();
  let variant: BadgeProps['variant'] = 'neutral';

  if (['ACTIVE', 'APPROVED', 'FINALIZED', 'SETTLED', 'PUBLISHED', 'COMPLETED', 'PRESENT'].includes(s)) {
    variant = 'success';
  } else if (['DRAFT', 'PENDING', 'PENDING_APPROVAL', 'PENDING_VERIFICATION', 'CALCULATED', 'OPEN', 'REQUESTED', 'PROBATION'].includes(s)) {
    variant = 'warning';
  } else if (['FAILED', 'REJECTED', 'BLOCKED', 'SUSPENDED', 'DECOMMISSIONED', 'TERMINATED', 'CANCELLED', 'ABSENT'].includes(s)) {
    variant = 'danger';
  } else if (['SUBMITTED', 'RECOVERING', 'PARTIALLY_SETTLED', 'ON_LEAVE'].includes(s)) {
    variant = 'info';
  }

  return <Badge variant={variant}>{status?.replace(/_/g, ' ') || 'UNKNOWN'}</Badge>;
};
