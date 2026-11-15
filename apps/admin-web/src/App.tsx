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
      <div className="min-h-screen bg-[#F4F7FB] flex flex-col items-center justify-center p-6 text-slate-800 antialiased">
        <div className="clay-surface p-10 max-w-sm w-full text-center space-y-5 flex flex-col items-center">
          <div className="relative">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#10B981] via-[#0D9488] to-[#00506E] flex items-center justify-center text-white text-2xl font-black shadow-[0_10px_25px_rgba(16,185,129,0.35),inset_0_2px_2px_rgba(255,255,255,0.5)]">
              D
            </div>
            <div className="absolute -inset-2 border-2 border-[#10B981]/30 border-t-[#00506E] rounded-full animate-spin" />
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-black tracking-tight text-slate-900">DFARM Smart Dairy</h3>
            <p className="text-xs font-bold tracking-wider text-slate-500 uppercase">
              INITIALIZING DFARM DAIRY OPERATING PLATFORM...
            </p>
          </div>
        </div>
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
