import React from 'react';

export interface StatCardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  icon?: string;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    text: string;
  };
  variant?: 'default' | 'emerald' | 'amber' | 'sky' | 'rose' | 'indigo';
  alert?: boolean;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  unit,
  subtext,
  icon,
  trend,
  variant = 'default',
  alert = false,
  onClick,
}) => {
  const borderColors = {
    default: 'border-gray-200 hover:border-gray-300',
    emerald: 'border-emerald-200 bg-emerald-50/30',
    amber: 'border-amber-200 bg-amber-50/30',
    sky: 'border-sky-200 bg-sky-50/30',
    rose: 'border-rose-200 bg-rose-50/30',
    indigo: 'border-indigo-200 bg-indigo-50/30',
  };

  return (
    <div
      onClick={onClick}
      className={`p-5 bg-white rounded-xl border shadow-sm transition-all duration-200 ${
        borderColors[variant]
      } ${onClick ? 'cursor-pointer hover:shadow-md' : ''} ${
        alert ? 'ring-2 ring-rose-400' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{title}</span>
        {icon && <span className="text-xl">{icon}</span>}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {unit && <span className="text-xs font-semibold text-gray-500 uppercase">{unit}</span>}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
        {subtext && <span>{subtext}</span>}
        {trend && (
          <span
            className={`font-semibold flex items-center gap-0.5 ${
              trend.direction === 'up'
                ? 'text-emerald-600'
                : trend.direction === 'down'
                ? 'text-rose-600'
                : 'text-gray-500'
            }`}
          >
            {trend.direction === 'up' && '↑'}
            {trend.direction === 'down' && '↓'}
            {trend.text}
          </span>
        )}
      </div>
    </div>
  );
};
