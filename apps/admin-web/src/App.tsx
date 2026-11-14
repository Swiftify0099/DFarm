import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { ToastProvider } from './context/ToastContext.js';
import { LoginPage } from './features/auth/LoginPage.js';
import { DashboardLayout } from './components/DashboardLayout.js';
import { type NavSection } from './components/Sidebar.js';

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

const AppContent: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-wider text-slate-300">
          INITIALIZING DFARM DAIRY OPERATING PLATFORM...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <DashboardLayout
      activeSection={activeSection}
      onSelectSection={setActiveSection}
    >
      {activeSection === 'dashboard' && (
        <OperationalDashboard onNavigateSection={(sec: any) => setActiveSection(sec as NavSection)} />
      )}
      {activeSection === 'customers' && <CustomerManagement />}
      {activeSection === 'collections' && <MilkCollectionModule />}
      {activeSection === 'rates' && <RateManagementModule />}
      {activeSection === 'accounting' && <AccountingBillingModule />}
      {activeSection === 'feed' && <FeedManagementModule />}
      {activeSection === 'employees' && <EmployeeManagementModule />}
      {activeSection === 'devices' && <DeviceSyncModule />}
      {activeSection === 'reports' && <ReportsAnalyticsModule />}
      {activeSection === 'settings' && <SettingsModule />}
    </DashboardLayout>
  );
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ToastProvider>
  );
};

export default App;
