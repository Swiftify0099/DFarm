import React from 'react';
export interface ClayCardProps {
    children: React.ReactNode;
    className?: string;
    variant?: 'default' | 'elevated' | 'inset' | 'emerald' | 'amber' | 'sky' | 'rose' | 'indigo';
    padding?: 'none' | 'sm' | 'md' | 'lg';
    onClick?: () => void;
}
export declare const ClayCard: React.FC<ClayCardProps>;
//# sourceMappingURL=ClayCard.d.ts.map