import React from 'react';
export type NavSection = 'dashboard' | 'customers' | 'collections' | 'rates' | 'accounting' | 'feed' | 'employees' | 'devices' | 'reports' | 'settings';
export interface SidebarProps {
    activeSection: NavSection;
    onSelectSection: (section: NavSection) => void;
    isMobileOpen: boolean;
    onCloseMobile: () => void;
}
export declare const Sidebar: React.FC<SidebarProps>;
//# sourceMappingURL=Sidebar.d.ts.map