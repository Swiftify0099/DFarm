import React from 'react';
export interface StatCardProps {
    title: string;
    value: string | number;
    unit?: string;
    subtext?: string;
    icon?: string;
    trend?: {
        direction: 'up' | 'down' | 'neutral';
        text: string;
    };
    variant?: 'default' | 'emerald' | 'amber' | 'sky' | 'rose' | 'indigo';
    alert?: boolean;
    onClick?: () => void;
}
export declare const StatCard: React.FC<StatCardProps>;
//# sourceMappingURL=StatCard.d.ts.map