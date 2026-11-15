import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function ClayTabs({ tabs, activeTab, onChange, variant = 'pill', className = '', }) {
    if (variant === 'card') {
        return (_jsx("div", { className: `flex border-b border-slate-200/80 overflow-x-auto space-x-2 pb-1 text-sm font-semibold select-none ${className}`, children: tabs.map((tab) => {
                const isActive = tab.id === activeTab;
                return (_jsxs("button", { onClick: () => onChange(tab.id), className: `px-4 py-2.5 rounded-t-xl transition-all duration-150 whitespace-nowrap flex items-center gap-2 border-b-2 font-bold ${isActive
                        ? 'bg-white text-[#00506E] border-[#00506E] shadow-[0_-4px_12px_rgba(0,80,110,0.06),inset_0_2px_2px_rgba(255,255,255,0.95)]'
                        : 'text-slate-600 hover:text-[#00506E] hover:bg-white/60 border-transparent'}`, children: [tab.icon && _jsx("span", { children: tab.icon }), _jsx("span", { children: tab.label }), tab.badge !== undefined && (_jsx("span", { className: `text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isActive ? 'bg-[#CFEAFD] text-[#00506E]' : 'bg-slate-200 text-slate-700'}`, children: tab.badge }))] }, tab.id));
            }) }));
    }
    return (_jsx("div", { className: `p-1.5 bg-[#EDF2F7] rounded-2xl border border-slate-200/80 shadow-[inset_2px_2px_5px_rgba(15,23,42,0.06),inset_-2px_-2px_5px_rgba(255,255,255,0.85)] inline-flex flex-wrap gap-1.5 select-none ${className}`, children: tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (_jsxs("button", { onClick: () => onChange(tab.id), className: `px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 flex items-center gap-2 ${isActive
                    ? 'bg-white text-[#00506E] shadow-[0_4px_12px_rgba(0,80,110,0.12),inset_0_1.5px_2px_rgba(255,255,255,0.95),inset_0_-1px_2px_rgba(0,0,0,0.04)] transform -translate-y-0.5'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'}`, children: [tab.icon && _jsx("span", { className: "text-sm", children: tab.icon }), _jsx("span", { children: tab.label }), tab.badge !== undefined && (_jsx("span", { className: `text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isActive ? 'bg-[#CFEAFD] text-[#00506E]' : 'bg-slate-300/80 text-slate-700'}`, children: tab.badge }))] }, tab.id));
        }) }));
}
//# sourceMappingURL=ClayTabs.js.map