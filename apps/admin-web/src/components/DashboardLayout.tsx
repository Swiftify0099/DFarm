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
    <div className="min-h-screen bg-[#F4F7FB] flex text-slate-800 antialiased selection:bg-[#CFEAFD] selection:text-[#00506E]">
      {/* Sidebar */}
      <Sidebar
        activeSection={activeSection}
        onSelectSection={onSelectSection}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          onToggleMobileSidebar={() => setIsMobileSidebarOpen(true)}
          activeSectionTitle={titles[activeSection] || 'DFarm Dairy ERP'}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {children}
        </main>

        <footer className="py-4 px-6 text-center text-xs text-slate-500 border-t border-slate-200/80 bg-white/60 backdrop-blur-sm select-none">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-bold text-slate-700">DFarm Smart Dairy Enterprise Platform &copy; 2026</span>
            </div>
            <div className="text-[11px] font-medium text-slate-400">
              Claymorphism 3D Interface Tier &bull; End-to-End Audit Log Active &bull; Zero Biometric Exposure
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};
