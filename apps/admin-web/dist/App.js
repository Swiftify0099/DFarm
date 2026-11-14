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
        return (_jsxs("div", { className: "min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white", children: [_jsx("div", { className: "w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" }), _jsx("p", { className: "text-sm font-semibold tracking-wider text-slate-300", children: "INITIALIZING DFARM DAIRY OPERATING PLATFORM..." })] }));
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