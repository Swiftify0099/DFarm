import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { ToastProvider } from './context/ToastContext.js';
import { LoginPage } from './features/auth/LoginPage.js';
import { DashboardLayout } from './components/DashboardLayout.js';
// Feature Modules
import { OperationalDashboard } from './features/dashboard/OperationalDashboard.js';
import { CustomerManagement } from './features/customers/CustomerManagement.js';
import { MilkCollectionModule } from './features/collections/MilkCollectionModule.js';
import { RateManagementModule } from './features/rates/RateManagementModule.js';
import { AccountingBillingModule } from './features/accounting/AccountingBillingModule.js';
import { FeedManagementModule } from './features/feed/FeedManagementModule.js';
import { EmployeeManagementModule } from './features/employees/EmployeeManagementModule.js';
import { DeviceSyncModule } from './features/devices/DeviceSyncModule.js';
import { ReportsAnalyticsModule } from './features/reports/ReportsAnalyticsModule.js';
import { SettingsModule } from './features/settings/SettingsModule.js';
const AppContent = () => {
    const { isAuthenticated, loading } = useAuth();
    const [activeSection, setActiveSection] = useState('dashboard');
    if (loading) {
        return (_jsx("div", { className: "min-h-screen bg-[#F4F7FB] flex flex-col items-center justify-center p-6 text-slate-800 antialiased", children: _jsxs("div", { className: "clay-surface p-10 max-w-sm w-full text-center space-y-5 flex flex-col items-center", children: [_jsxs("div", { className: "relative", children: [_jsx("div", { className: "w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#10B981] via-[#0D9488] to-[#00506E] flex items-center justify-center text-white text-2xl font-black shadow-[0_10px_25px_rgba(16,185,129,0.35),inset_0_2px_2px_rgba(255,255,255,0.5)]", children: "D" }), _jsx("div", { className: "absolute -inset-2 border-2 border-[#10B981]/30 border-t-[#00506E] rounded-full animate-spin" })] }), _jsxs("div", { className: "space-y-1", children: [_jsx("h3", { className: "text-base font-black tracking-tight text-slate-900", children: "DFARM Smart Dairy" }), _jsx("p", { className: "text-xs font-bold tracking-wider text-slate-500 uppercase", children: "INITIALIZING DFARM DAIRY OPERATING PLATFORM..." })] })] }) }));
    }
    if (!isAuthenticated) {
        return _jsx(LoginPage, {});
    }
    return (_jsxs(DashboardLayout, { activeSection: activeSection, onSelectSection: setActiveSection, children: [activeSection === 'dashboard' && (_jsx(OperationalDashboard, { onNavigateSection: (sec) => setActiveSection(sec) })), activeSection === 'customers' && _jsx(CustomerManagement, {}), activeSection === 'collections' && _jsx(MilkCollectionModule, {}), activeSection === 'rates' && _jsx(RateManagementModule, {}), activeSection === 'accounting' && _jsx(AccountingBillingModule, {}), activeSection === 'feed' && _jsx(FeedManagementModule, {}), activeSection === 'employees' && _jsx(EmployeeManagementModule, {}), activeSection === 'devices' && _jsx(DeviceSyncModule, {}), activeSection === 'reports' && _jsx(ReportsAnalyticsModule, {}), activeSection === 'settings' && _jsx(SettingsModule, {})] }));
};
export const App = () => {
    return (_jsx(ToastProvider, { children: _jsx(AuthProvider, { children: _jsx(AppContent, {}) }) }));
};
export default App;
//# sourceMappingURL=App.js.map