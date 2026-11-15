import React, { useEffect } from 'react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'xl',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div
        className={`bg-white rounded-3xl border border-white/90 shadow-[0_25px_60px_-15px_rgba(15,23,42,0.25),0_0_0_1px_rgba(255,255,255,0.85)_inset,0_10px_20px_-5px_rgba(15,23,42,0.1)] w-full ${widthClasses[maxWidth]} overflow-hidden transform transition-all`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50/90 to-white">
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 font-medium mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200/80 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9),0_2px_4px_rgba(0,0,0,0.05)] transition-all duration-150 active:scale-95 font-bold"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 max-h-[75vh] overflow-y-auto">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 bg-[#F8FAFC] border-t border-slate-100 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
