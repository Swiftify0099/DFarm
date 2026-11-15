import React from 'react';
import { ClayButton } from './ClayButton.js';

export interface ClayEmptyStateProps {
  title: string;
  description?: string;
  icon?: string;
  illustrationSrc?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const ClayEmptyState: React.FC<ClayEmptyStateProps> = ({
  title,
  description,
  icon = '📋',
  illustrationSrc,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`clay-surface p-8 sm:p-12 text-center flex flex-col items-center justify-center space-y-4 max-w-xl mx-auto my-6 ${className}`}
    >
      {illustrationSrc ? (
        <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-3xl overflow-hidden p-2 bg-gradient-to-tr from-slate-100 to-slate-50 border border-white/80 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.04)] mb-2">
          <img
            src={illustrationSrc}
            alt={title}
            className="w-full h-full object-contain filter drop-shadow-sm"
          />
        </div>
      ) : (
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-[#E6F4FA] to-white border border-white/90 shadow-[inset_2px_2px_4px_rgba(0,80,110,0.06),4px_6px_12px_rgba(0,0,0,0.04)] flex items-center justify-center text-4xl mb-1">
          <span>{icon}</span>
        </div>
      )}

      <div className="space-y-1">
        <h4 className="text-base sm:text-lg font-extrabold text-slate-800 tracking-tight">
          {title}
        </h4>
        {description && (
          <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {actionLabel && onAction && (
        <div className="pt-2">
          <ClayButton variant="brand" size="sm" onClick={onAction}>
            {actionLabel}
          </ClayButton>
        </div>
      )}
    </div>
  );
};
