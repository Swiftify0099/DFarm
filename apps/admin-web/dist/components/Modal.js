import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
export const Modal = ({ isOpen, onClose, title, subtitle, children, footer, maxWidth = 'xl', }) => {
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape')
                onClose();
        };
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            document.body.style.overflow = 'unset';
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);
    if (!isOpen)
        return null;
    const widthClasses = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl',
        '3xl': 'max-w-3xl',
        '4xl': 'max-w-4xl',
        '5xl': 'max-w-5xl',
    };
    return (_jsx("div", { className: "fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-center justify-center p-4", children: _jsxs("div", { className: `bg-white rounded-2xl shadow-2xl border border-gray-100 w-full ${widthClasses[maxWidth]} overflow-hidden animate-scale-in`, onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-lg font-bold text-gray-900", children: title }), subtitle && _jsx("p", { className: "text-xs text-gray-500 mt-0.5", children: subtitle })] }), _jsx("button", { onClick: onClose, className: "w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition", children: "\u2715" })] }), _jsx("div", { className: "px-6 py-5 max-h-[75vh] overflow-y-auto", children: children }), footer && (_jsx("div", { className: "px-6 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3", children: footer }))] }) }));
};
//# sourceMappingURL=Modal.js.map