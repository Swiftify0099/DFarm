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
  // Pastel clay surfaces with subtle tint and 3D bevels
  const variantStyles = {
    default:
      'bg-white border-white/90 shadow-[8px_12px_24px_-4px_rgba(15,23,42,0.06),2px_4px_8px_-2px_rgba(15,23,42,0.04),inset_1px_1px_2px_0px_rgba(255,255,255,0.95),inset_-1px_-1px_3px_0px_rgba(0,0,0,0.03)] hover:border-slate-200',
    emerald:
      'bg-gradient-to-b from-[#F2FBF6] to-white border-emerald-100/90 shadow-[8px_12px_24px_-4px_rgba(5,150,105,0.08),inset_1px_1px_2px_0px_rgba(255,255,255,0.95),inset_-1px_-1px_3px_0px_rgba(5,150,105,0.04)]',
    amber:
      'bg-gradient-to-b from-[#FFFDF5] to-white border-amber-100/90 shadow-[8px_12px_24px_-4px_rgba(217,119,6,0.08),inset_1px_1px_2px_0px_rgba(255,255,255,0.95),inset_-1px_-1px_3px_0px_rgba(217,119,6,0.04)]',
    sky:
      'bg-gradient-to-b from-[#F5FAFF] to-white border-sky-100/90 shadow-[8px_12px_24px_-4px_rgba(2,132,199,0.08),inset_1px_1px_2px_0px_rgba(255,255,255,0.95),inset_-1px_-1px_3px_0px_rgba(2,132,199,0.04)]',
    rose:
      'bg-gradient-to-b from-[#FFF6F6] to-white border-rose-100/90 shadow-[8px_12px_24px_-4px_rgba(225,29,72,0.08),inset_1px_1px_2px_0px_rgba(255,255,255,0.95),inset_-1px_-1px_3px_0px_rgba(225,29,72,0.04)]',
    indigo:
      'bg-gradient-to-b from-[#F7F7FE] to-white border-indigo-100/90 shadow-[8px_12px_24px_-4px_rgba(79,70,229,0.08),inset_1px_1px_2px_0px_rgba(255,255,255,0.95),inset_-1px_-1px_3px_0px_rgba(79,70,229,0.04)]',
  };

  const iconBgStyles = {
    default: 'bg-slate-100 text-slate-700 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9)]',
    emerald: 'bg-emerald-100 text-emerald-800 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9)]',
    amber: 'bg-amber-100 text-amber-800 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9)]',
    sky: 'bg-sky-100 text-sky-800 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9)]',
    rose: 'bg-rose-100 text-rose-800 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9)]',
    indigo: 'bg-indigo-100 text-indigo-800 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9)]',
  };

  return (
    <div
      onClick={onClick}
      className={`p-5 rounded-2xl border transition-all duration-200 select-none ${
        variantStyles[variant]
      } ${
        onClick
          ? 'cursor-pointer hover:-translate-y-1 hover:shadow-[12px_18px_32px_-4px_rgba(15,23,42,0.1),inset_1px_1px_3px_rgba(255,255,255,1)] active:translate-y-0 active:shadow-[6px_8px_16px_-4px_rgba(15,23,42,0.06)]'
          : ''
      } ${alert ? 'ring-2 ring-rose-400 ring-offset-2 ring-offset-[#F4F7FB]' : ''}`}
    >
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</span>
        {icon && (
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg border border-white/60 ${
              iconBgStyles[variant]
            }`}
          >
            <span>{icon}</span>
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-1.5 my-1">
        <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {unit && (
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {unit}
          </span>
        )}
      </div>

      <div className="mt-2.5 pt-2 border-t border-slate-100/80 flex items-center justify-between text-xs text-slate-500 font-medium">
        {subtext && <span className="truncate pr-1">{subtext}</span>}
        {trend && (
          <span
            className={`font-bold flex items-center gap-0.5 px-2 py-0.5 rounded-full shrink-0 ${
              trend.direction === 'up'
                ? 'text-emerald-700 bg-emerald-50 border border-emerald-200/80'
                : trend.direction === 'down'
                ? 'text-rose-700 bg-rose-50 border border-rose-200/80'
                : 'text-slate-600 bg-slate-100'
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
