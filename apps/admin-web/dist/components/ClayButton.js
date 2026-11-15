import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export const ClayButton = ({ children, variant = 'brand', size = 'md', isLoading = false, icon, className = '', disabled, ...props }) => {
    const sizeStyles = {
        sm: 'px-3 py-1.5 text-xs font-bold gap-1.5 rounded-xl',
        md: 'px-4 py-2.5 text-sm font-bold gap-2 rounded-xl',
        lg: 'px-6 py-3.5 text-base font-extrabold gap-2.5 rounded-2xl',
    };
    const variantStyles = {
        brand: 'bg-gradient-to-r from-[#00688F] to-[#00506E] text-white border border-white/25 shadow-[0_6px_16px_-2px_rgba(0,80,110,0.35),0_2px_4px_-1px_rgba(0,80,110,0.2),inset_0_2px_2px_rgba(255,255,255,0.35),inset_0_-2px_4px_rgba(0,0,0,0.2)] hover:shadow-[0_8px_20px_-2px_rgba(0,80,110,0.45),inset_0_2px_2px_rgba(255,255,255,0.45)] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.3)]',
        emerald: 'bg-gradient-to-r from-emerald-500 to-teal-700 text-white border border-white/25 shadow-[0_6px_16px_-2px_rgba(5,150,105,0.35),0_2px_4px_-1px_rgba(5,150,105,0.2),inset_0_2px_2px_rgba(255,255,255,0.35),inset_0_-2px_4px_rgba(0,0,0,0.2)] hover:shadow-[0_8px_20px_-2px_rgba(5,150,105,0.45),inset_0_2px_2px_rgba(255,255,255,0.45)] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.3)]',
        secondary: 'bg-white text-slate-800 border border-slate-200/90 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.07),inset_0_1.5px_2px_rgba(255,255,255,0.95),inset_0_-2px_3px_rgba(15,23,42,0.04)] hover:bg-slate-50 hover:shadow-[0_6px_16px_-2px_rgba(15,23,42,0.1)] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[inset_0_2px_4px_rgba(15,23,42,0.1)]',
        danger: 'bg-gradient-to-r from-rose-500 to-red-600 text-white border border-white/25 shadow-[0_6px_16px_-2px_rgba(225,29,72,0.35),inset_0_2px_2px_rgba(255,255,255,0.35),inset_0_-2px_4px_rgba(0,0,0,0.2)] hover:shadow-[0_8px_20px_-2px_rgba(225,29,72,0.45)] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.3)]',
        ghost: 'bg-transparent text-slate-600 hover:bg-slate-200/60 active:bg-slate-200 text-slate-700 shadow-none border border-transparent',
    };
    return (_jsxs("button", { disabled: disabled || isLoading, className: `inline-flex items-center justify-center select-none transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none ${sizeStyles[size]} ${variantStyles[variant]} ${className}`, ...props, children: [isLoading ? (_jsx("span", { className: "w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" })) : (icon && _jsx("span", { className: "shrink-0", children: icon })), children] }));
};
//# sourceMappingURL=ClayButton.js.map