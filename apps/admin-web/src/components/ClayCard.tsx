import React from 'react';

export interface ClayCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'elevated' | 'inset' | 'emerald' | 'amber' | 'sky' | 'rose' | 'indigo';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

export const ClayCard: React.FC<ClayCardProps> = ({
  children,
  className = '',
  variant = 'default',
  padding = 'md',
  onClick,
}) => {
  const paddingStyles = {
    none: 'p-0',
    sm: 'p-3 sm:p-4',
    md: 'p-5 sm:p-6',
    lg: 'p-6 sm:p-8',
  };

  const variantStyles = {
    default:
      'bg-white border border-white/80 shadow-[8px_12px_24px_-4px_rgba(15,23,42,0.06),2px_4px_8px_-2px_rgba(15,23,42,0.04),inset_1px_1px_2px_0px_rgba(255,255,255,0.95),inset_-1px_-1px_3px_0px_rgba(0,0,0,0.03)]',
    elevated:
      'bg-white border border-white/90 shadow-[12px_18px_32px_-4px_rgba(15,23,42,0.09),4px_6px_12px_-2px_rgba(15,23,42,0.04),inset_1px_1px_3px_0px_rgba(255,255,255,1),inset_-1px_-1px_4px_0px_rgba(0,0,0,0.04)]',
    inset:
      'bg-[#EDF2F7] border border-slate-200/80 shadow-[inset_2px_2px_5px_rgba(15,23,42,0.06),inset_-2px_-2px_5px_rgba(255,255,255,0.85)]',
    emerald:
      'bg-[#F2FBF6] border border-emerald-100/90 shadow-[8px_12px_24px_-4px_rgba(5,150,105,0.08),inset_1px_1px_2px_0px_rgba(255,255,255,0.95),inset_-1px_-1px_3px_0px_rgba(5,150,105,0.04)]',
    amber:
      'bg-[#FFFDF5] border border-amber-100/90 shadow-[8px_12px_24px_-4px_rgba(217,119,6,0.08),inset_1px_1px_2px_0px_rgba(255,255,255,0.95),inset_-1px_-1px_3px_0px_rgba(217,119,6,0.04)]',
    sky:
      'bg-[#F5FAFF] border border-sky-100/90 shadow-[8px_12px_24px_-4px_rgba(2,132,199,0.08),inset_1px_1px_2px_0px_rgba(255,255,255,0.95),inset_-1px_-1px_3px_0px_rgba(2,132,199,0.04)]',
    rose:
      'bg-[#FFF6F6] border border-rose-100/90 shadow-[8px_12px_24px_-4px_rgba(225,29,72,0.08),inset_1px_1px_2px_0px_rgba(255,255,255,0.95),inset_-1px_-1px_3px_0px_rgba(225,29,72,0.04)]',
    indigo:
      'bg-[#F7F7FE] border border-indigo-100/90 shadow-[8px_12px_24px_-4px_rgba(79,70,229,0.08),inset_1px_1px_2px_0px_rgba(255,255,255,0.95),inset_-1px_-1px_3px_0px_rgba(79,70,229,0.04)]',
  };

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl transition-all duration-200 ${variantStyles[variant]} ${paddingStyles[padding]} ${
        onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
};
