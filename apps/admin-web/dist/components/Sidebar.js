import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useAuth } from '../context/AuthContext.js';
export const Sidebar = ({ activeSection, onSelectSection, isMobileOpen, onCloseMobile, }) => {
    const { user, hasRole } = useAuth();
    const navItems = [
        {
            id: 'dashboard',
            label: 'Main Dashboard',
            icon: '📊',
            visible: true,
        },
        {
            id: 'customers',
            label: 'Customer Management',
            icon: '👥',
            visible: true,
        },
        {
            id: 'collections',
            label: 'Milk Collections',
            icon: '🥛',
            visible: true,
        },
        {
            id: 'rates',
            label: 'Rate Charts & Pricing',
            icon: '📈',
            visible: hasRole(['SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'SUPERVISOR']),
        },
        {
            id: 'accounting',
            label: 'Billing & Accounting',
            icon: '💰',
            visible: hasRole(['SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'ACCOUNTANT', 'SUPERVISOR']),
        },
        {
            id: 'feed',
            label: 'Feed Inventory & POS',
            icon: '🌾',
            badge: 'P14',
            visible: true,
        },
        {
            id: 'employees',
            label: 'Staff & Payroll',
            icon: '👔',
            badge: 'P16',
            visible: hasRole(['SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'ACCOUNTANT', 'SUPERVISOR']),
        },
        {
            id: 'devices',
            label: 'Devices & Offline Sync',
            icon: '📟',
            visible: hasRole(['SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'SUPERVISOR']),
        },
        {
            id: 'reports',
            label: 'Reports & Analytics',
            icon: '📑',
            visible: hasRole(['SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'SUPERVISOR', 'ACCOUNTANT']),
        },
        {
            id: 'settings',
            label: 'Settings & Centers',
            icon: '⚙️',
            visible: true,
        },
    ];
    const content = (_jsxs("div", { className: "flex flex-col h-full bg-[#0A1824] text-slate-100 w-64 select-none border-r border-slate-800/80 shadow-[6px_0_24px_rgba(0,0,0,0.18)]", children: [_jsxs("div", { className: "px-6 py-5 border-b border-slate-800/90 flex items-center justify-between bg-gradient-to-b from-[#0F2334] to-[#0A1824]", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "w-10 h-10 rounded-2xl bg-gradient-to-br from-[#10B981] via-[#0D9488] to-[#00506E] flex items-center justify-center text-white text-xl font-black border border-white/30 shadow-[0_4px_12px_rgba(16,185,129,0.35),inset_0_2px_2px_rgba(255,255,255,0.5),inset_0_-2px_4px_rgba(0,0,0,0.25)]", children: "D" }), _jsxs("div", { children: [_jsx("span", { className: "font-black text-base tracking-tight text-white block", children: "DFARM" }), _jsx("span", { className: "text-[10px] uppercase font-extrabold tracking-widest text-emerald-400 block -mt-0.5", children: "Smart Dairy ERP" })] })] }), _jsx("button", { onClick: onCloseMobile, className: "lg:hidden w-8 h-8 rounded-xl bg-slate-800/80 text-slate-400 hover:text-white flex items-center justify-center font-bold", children: "\u2715" })] }), _jsxs("nav", { className: "flex-1 px-3 py-4 space-y-1.5 overflow-y-auto", children: [_jsx("div", { className: "text-[10px] font-extrabold uppercase tracking-widest text-slate-400 px-3.5 pb-2", children: "Operations" }), navItems
                        .filter((item) => item.visible)
                        .map((item) => {
                        const isActive = activeSection === item.id;
                        return (_jsxs("button", { onClick: () => {
                                onSelectSection(item.id);
                                onCloseMobile();
                            }, className: `w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 ${isActive
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white border border-white/25 shadow-[0_6px_16px_-2px_rgba(5,150,105,0.4),inset_0_2px_2px_rgba(255,255,255,0.4),inset_0_-2px_3px_rgba(0,0,0,0.2)] transform -translate-y-0.5'
                                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent'}`, children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "text-base shrink-0", children: item.icon }), _jsx("span", { className: "truncate", children: item.label })] }), item.badge && (_jsx("span", { className: `text-[10px] font-black px-2 py-0.5 rounded-full ${isActive
                                        ? 'bg-emerald-800/90 text-emerald-100 border border-emerald-400/30'
                                        : 'bg-slate-800 text-slate-400 border border-slate-700'}`, children: item.badge }))] }, item.id));
                    })] }), _jsx("div", { className: "p-4 border-t border-slate-800/90 bg-[#07131D]", children: _jsxs("div", { className: "p-2.5 rounded-2xl bg-[#0D2131] border border-slate-700/60 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.05),0_2px_6px_rgba(0,0,0,0.3)] flex items-center gap-3", children: [_jsx("div", { className: "w-9 h-9 rounded-xl bg-gradient-to-tr from-slate-700 to-slate-800 border border-slate-600 flex items-center justify-center text-xs font-black text-white shadow-sm shrink-0", children: user?.fullName?.slice(0, 2).toUpperCase() || 'ST' }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-xs font-black text-white truncate", children: user?.fullName || 'Staff User' }), _jsx("p", { className: "text-[10px] text-emerald-400 font-extrabold truncate uppercase tracking-wider", children: user?.role?.replace(/_/g, ' ') || 'COLLECTION OPERATOR' })] })] }) })] }));
    return (_jsxs(_Fragment, { children: [_jsx("aside", { className: "hidden lg:block shrink-0 h-screen sticky top-0 z-20", children: content }), isMobileOpen && (_jsx("div", { className: "lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm", onClick: onCloseMobile, children: _jsx("div", { className: "fixed inset-y-0 left-0 z-50 animate-slide-right", onClick: (e) => e.stopPropagation(), children: content }) }))] }));
};
//# sourceMappingURL=Sidebar.js.map