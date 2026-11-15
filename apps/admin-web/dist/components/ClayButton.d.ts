import React from 'react';
export interface ClayButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'brand' | 'emerald' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
    icon?: React.ReactNode;
}
export declare const ClayButton: React.FC<ClayButtonProps>;
//# sourceMappingURL=ClayButton.d.ts.map