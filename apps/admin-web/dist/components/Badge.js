import { jsx as _jsx } from "react/jsx-runtime";
export const Badge = ({ children, variant = 'neutral', size = 'sm' }) => {
    const variantStyles = {
        success: 'bg-[#E6F4EA] text-[#137333] border-emerald-200/90 shadow-[0_2px_5px_-1px_rgba(19,115,51,0.15),inset_0_1px_1px_rgba(255,255,255,0.9)]',
        warning: 'bg-[#FEF7E0] text-[#B06000] border-amber-200/90 shadow-[0_2px_5px_-1px_rgba(176,96,0,0.15),inset_0_1px_1px_rgba(255,255,255,0.9)]',
        danger: 'bg-[#FCE8E6] text-[#C5221F] border-rose-200/90 shadow-[0_2px_5px_-1px_rgba(197,34,31,0.15),inset_0_1px_1px_rgba(255,255,255,0.9)]',
        info: 'bg-[#E8F0FE] text-[#1A73E8] border-sky-200/90 shadow-[0_2px_5px_-1px_rgba(26,115,232,0.15),inset_0_1px_1px_rgba(255,255,255,0.9)]',
        purple: 'bg-[#F3E5F5] text-[#6A1B9A] border-purple-200/90 shadow-[0_2px_5px_-1px_rgba(106,27,154,0.15),inset_0_1px_1px_rgba(255,255,255,0.9)]',
        neutral: 'bg-[#F1F3F4] text-[#5F6368] border-slate-200/90 shadow-[0_2px_5px_-1px_rgba(15,23,42,0.06),inset_0_1px_1px_rgba(255,255,255,0.9)]',
    };
    const sizeStyles = {
        sm: 'text-[11px] px-2.5 py-0.5 tracking-wide font-extrabold',
        md: 'text-xs px-3.5 py-1 tracking-wide font-extrabold',
    };
    return (_jsx("span", { className: `inline-flex items-center rounded-full border transition-all duration-150 select-none ${variantStyles[variant]} ${sizeStyles[size]}`, children: children }));
};
export const StatusBadge = ({ status }) => {
    const s = (status || '').toUpperCase();
    let variant = 'neutral';
    if (['ACTIVE', 'APPROVED', 'FINALIZED', 'SETTLED', 'PUBLISHED', 'COMPLETED', 'PRESENT', 'PAID'].includes(s)) {
        variant = 'success';
    }
    else if (['DRAFT', 'PENDING', 'PENDING_APPROVAL', 'PENDING_VERIFICATION', 'CALCULATED', 'OPEN', 'REQUESTED', 'PROBATION'].includes(s)) {
        variant = 'warning';
    }
    else if (['FAILED', 'REJECTED', 'BLOCKED', 'SUSPENDED', 'DECOMMISSIONED', 'TERMINATED', 'CANCELLED', 'ABSENT'].includes(s)) {
        variant = 'danger';
    }
    else if (['SUBMITTED', 'RECOVERING', 'PARTIALLY_SETTLED', 'ON_LEAVE', 'PROCESSING'].includes(s)) {
        variant = 'info';
    }
    return _jsx(Badge, { variant: variant, children: status?.replace(/_/g, ' ') || 'UNKNOWN' });
};
//# sourceMappingURL=Badge.js.map