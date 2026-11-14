import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState, useCallback } from 'react';
const ToastContext = createContext(undefined);
export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);
    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);
    const showToast = useCallback((message, type = 'info') => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, type, message }]);
        setTimeout(() => {
            removeToast(id);
        }, 4500);
    }, [removeToast]);
    return (_jsxs(ToastContext.Provider, { value: { showToast, toasts, removeToast }, children: [children, _jsx("div", { className: "fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none", children: toasts.map((toast) => (_jsxs("div", { className: `pointer-events-auto p-4 rounded-lg shadow-lg border text-sm flex items-start justify-between transition-all duration-300 animate-slide-up ${toast.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : toast.type === 'error'
                            ? 'bg-rose-50 text-rose-800 border-rose-300'
                            : toast.type === 'warning'
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : 'bg-sky-50 text-sky-800 border-sky-300'}`, children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("span", { className: "text-base font-bold", children: [toast.type === 'success' && '✓', toast.type === 'error' && '✕', toast.type === 'warning' && '⚠', toast.type === 'info' && 'ℹ'] }), _jsx("span", { children: toast.message })] }), _jsx("button", { onClick: () => removeToast(toast.id), className: "ml-3 text-xs font-bold opacity-60 hover:opacity-100", children: "\u00D7" })] }, toast.id))) })] }));
};
export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return ctx;
}
//# sourceMappingURL=ToastContext.js.map