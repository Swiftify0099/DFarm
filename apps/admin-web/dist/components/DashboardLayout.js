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
    return (_jsxs("div", { className: "min-h-screen bg-slate-100/70 flex text-slate-800 antialiased", children: [_jsx(Sidebar, { activeSection: activeSection, onSelectSection: onSelectSection, isMobileOpen: isMobileSidebarOpen, onCloseMobile: () => setIsMobileSidebarOpen(false) }), _jsxs("div", { className: "flex-1 flex flex-col min-w-0", children: [_jsx(Header, { onToggleMobileSidebar: () => setIsMobileSidebarOpen(true), activeSectionTitle: titles[activeSection] || 'DFarm Dairy ERP' }), _jsx("main", { className: "flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6", children: children }), _jsx("footer", { className: "py-4 px-6 text-center text-xs text-gray-500 border-t border-gray-200 bg-white", children: "DFarm Smart Dairy Enterprise Platform \u00A9 2026 \u2022 Production Release Tier \u2022 End-to-End Audit Log Active" })] })] }));
};
//# sourceMappingURL=DashboardLayout.js.map