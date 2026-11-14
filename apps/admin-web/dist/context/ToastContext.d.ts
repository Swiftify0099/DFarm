import React, { ReactNode } from 'react';
export type ToastType = 'success' | 'error' | 'warning' | 'info';
export interface Toast {
    id: string;
    type: ToastType;
    message: string;
}
interface ToastContextValue {
    showToast: (message: string, type?: ToastType) => void;
    toasts: Toast[];
    removeToast: (id: string) => void;
}
export declare const ToastProvider: React.FC<{
    children: ReactNode;
}>;
export declare function useToast(): ToastContextValue;
export {};
//# sourceMappingURL=ToastContext.d.ts.map