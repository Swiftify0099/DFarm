import React from 'react';
import { NavSection } from './Sidebar.js';
export interface DashboardLayoutProps {
    activeSection: NavSection;
    onSelectSection: (section: NavSection) => void;
    children: React.ReactNode;
}
export declare const DashboardLayout: React.FC<DashboardLayoutProps>;
//# sourceMappingURL=DashboardLayout.d.ts.map