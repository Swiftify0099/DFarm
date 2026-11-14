import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
export const SearchBar = ({ placeholder = 'Search...', value, onChange, debounceMs = 300, }) => {
    const [innerValue, setInnerValue] = useState(value);
    useEffect(() => {
        setInnerValue(value);
    }, [value]);
    useEffect(() => {
        const handler = setTimeout(() => {
            if (innerValue !== value) {
                onChange(innerValue);
            }
        }, debounceMs);
        return () => clearTimeout(handler);
    }, [innerValue, debounceMs, onChange, value]);
    return (_jsxs("div", { className: "relative flex-1 max-w-md", children: [_jsx("div", { className: "absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400", children: "\uD83D\uDD0D" }), _jsx("input", { type: "text", value: innerValue, onChange: (e) => setInnerValue(e.target.value), placeholder: placeholder, className: "w-full pl-9 pr-8 py-2 text-sm bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder-gray-400" }), innerValue && (_jsx("button", { onClick: () => {
                    setInnerValue('');
                    onChange('');
                }, className: "absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 text-xs", children: "\u2715" }))] }));
};
//# sourceMappingURL=SearchBar.js.map