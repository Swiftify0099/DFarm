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
    return (_jsxs("div", { className: "relative flex-1 max-w-md", children: [_jsx("div", { className: "absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400", children: _jsx("span", { className: "text-sm", children: "\uD83D\uDD0D" }) }), _jsx("input", { type: "text", value: innerValue, onChange: (e) => setInnerValue(e.target.value), placeholder: placeholder, className: "w-full pl-10 pr-9 py-2.5 text-xs sm:text-sm font-medium bg-[#EDF2F7] border border-slate-200/90 rounded-xl shadow-[inset_2px_2px_5px_rgba(15,23,42,0.06),inset_-2px_-2px_5px_rgba(255,255,255,0.85)] focus:bg-white focus:outline-none focus:border-[#00506E] focus:shadow-[inset_1px_1px_3px_rgba(0,80,110,0.1),inset_-1px_-1px_3px_rgba(255,255,255,0.9),0_0_0_3px_rgba(0,80,110,0.15)] placeholder-slate-400 text-slate-800 transition-all duration-150" }), innerValue && (_jsx("button", { onClick: () => {
                    setInnerValue('');
                    onChange('');
                }, className: "absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 transition", children: _jsx("div", { className: "w-5 h-5 rounded-full bg-slate-200/80 flex items-center justify-center text-[10px] font-bold", children: "\u2715" }) }))] }));
};
//# sourceMappingURL=SearchBar.js.map