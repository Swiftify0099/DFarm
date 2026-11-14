import React from 'react';
export interface BadgeProps {
    children: React.ReactNode;
    variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';
    size?: 'sm' | 'md';
}
export declare const Badge: React.FC<BadgeProps>;
export declare const StatusBadge: React.FC<{
    status: string;
}>;
//# sourceMappingURL=Badge.d.ts.map