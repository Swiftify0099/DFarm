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
    const content = (_jsxs("div", { className: "flex flex-col h-full bg-slate-900 text-slate-100 w-64 select-none", children: [_jsxs("div", { className: "px-6 py-5 border-b border-slate-800 flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white text-lg font-black shadow-lg shadow-emerald-500/20", children: "D" }), _jsxs("div", { children: [_jsx("span", { className: "font-extrabold text-base tracking-tight text-white block", children: "DFARM" }), _jsx("span", { className: "text-[10px] uppercase font-bold tracking-wider text-emerald-400 block -mt-1", children: "Smart Dairy ERP" })] })] }), _jsx("button", { onClick: onCloseMobile, className: "lg:hidden text-slate-400 hover:text-white", children: "\u2715" })] }), _jsxs("nav", { className: "flex-1 px-3 py-4 space-y-1 overflow-y-auto", children: [_jsx("div", { className: "text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 pb-2", children: "Operations" }), navItems
                        .filter((item) => item.visible)
                        .map((item) => {
                        const isActive = activeSection === item.id;
                        return (_jsxs("button", { onClick: () => {
                                onSelectSection(item.id);
                                onCloseMobile();
                            }, className: `w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 ${isActive
                                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                                : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'}`, children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "text-base", children: item.icon }), _jsx("span", { className: "truncate", children: item.label })] }), item.badge && (_jsx("span", { className: `text-[10px] font-bold px-1.5 py-0.5 rounded ${isActive ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-800 text-slate-400'}`, children: item.badge }))] }, item.id));
                    })] }), _jsx("div", { className: "p-4 border-t border-slate-800 bg-slate-950/40", children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300", children: user?.fullName?.slice(0, 2).toUpperCase() || 'ST' }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-xs font-bold text-white truncate", children: user?.fullName || 'Staff User' }), _jsx("p", { className: "text-[10px] text-emerald-400 font-semibold truncate uppercase", children: user?.role?.replace(/_/g, ' ') || 'COLLECTION OPERATOR' })] })] }) })] }));
    return (_jsxs(_Fragment, { children: [_jsx("aside", { className: "hidden lg:block shrink-0 h-screen sticky top-0 shadow-xl z-20", children: content }), isMobileOpen && (_jsx("div", { className: "lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm", onClick: onCloseMobile, children: _jsx("div", { className: "fixed inset-y-0 left-0 z-50 animate-slide-right", onClick: (e) => e.stopPropagation(), children: content }) }))] }));
};
//# sourceMappingURL=Sidebar.js.map