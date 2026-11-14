import React, { useState } from 'react';
import { Sidebar, NavSection } from './Sidebar.js';
import { Header } from './Header.js';

export interface DashboardLayoutProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  activeSection,
  onSelectSection,
  children,
}) => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const titles: Record<NavSection, string> = {
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

  return (
    <div className="min-h-screen bg-slate-100/70 flex text-slate-800 antialiased">
      {/* Sidebar */}
      <Sidebar
        activeSection={activeSection}
        onSelectSection={onSelectSection}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          onToggleMobileSidebar={() => setIsMobileSidebarOpen(true)}
          activeSectionTitle={titles[activeSection] || 'DFarm Dairy ERP'}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {children}
        </main>

        <footer className="py-4 px-6 text-center text-xs text-gray-500 border-t border-gray-200 bg-white">
          DFarm Smart Dairy Enterprise Platform &copy; 2026 &bull; Production Release Tier &bull; End-to-End Audit Log Active
        </footer>
      </div>
    </div>
  );
};
