import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Sidebar } from './Sidebar.js';
import { Header } from './Header.js';
export const DashboardLayout = ({ activeSection, onSelectSection, children, }) => {
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const titles = {
        dashboard: 'Operations & Dairy Overview',
        customers: 'Customer Master & Farmer Directory',
        collections: 'Milk Collection Intake Register',
        rates: 'Milk Rate Charts & Matrix Management',
        accounting: 'Accounting, Billing & Settlement Subledger',
        feed: 'Cattle Feed Inventory & POS Store',
        employees: 'Staff Directory, Attendance & Payroll',
        devices: 'Hardware Terminals & Synchronization Gateway',
        reports: 'Authoritative Dairy Reports & Analytics',
        settings: 'Center Profiles & Operational Settings',
    };
    return (_jsxs("div", { className: "min-h-screen bg-[#F4F7FB] flex text-slate-800 antialiased selection:bg-[#CFEAFD] selection:text-[#00506E]", children: [_jsx(Sidebar, { activeSection: activeSection, onSelectSection: onSelectSection, isMobileOpen: isMobileSidebarOpen, onCloseMobile: () => setIsMobileSidebarOpen(false) }), _jsxs("div", { className: "flex-1 flex flex-col min-w-0", children: [_jsx(Header, { onToggleMobileSidebar: () => setIsMobileSidebarOpen(true), activeSectionTitle: titles[activeSection] || 'DFarm Dairy ERP' }), _jsx("main", { className: "flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6", children: children }), _jsx("footer", { className: "py-4 px-6 text-center text-xs text-slate-500 border-t border-slate-200/80 bg-white/60 backdrop-blur-sm select-none", children: _jsxs("div", { className: "max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "w-2 h-2 rounded-full bg-emerald-500 animate-pulse" }), _jsx("span", { className: "font-bold text-slate-700", children: "DFarm Smart Dairy Enterprise Platform \u00A9 2026" })] }), _jsx("div", { className: "text-[11px] font-medium text-slate-400", children: "Claymorphism 3D Interface Tier \u2022 End-to-End Audit Log Active \u2022 Zero Biometric Exposure" })] }) })] })] }));
};
//# sourceMappingURL=DashboardLayout.js.map