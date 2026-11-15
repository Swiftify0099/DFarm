import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { feedApi } from '../../api/feedApi.js';
export const InventoryHistory = () => {
    const [movements, setMovements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [movementType, setMovementType] = useState('');
    const loadMovements = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await feedApi.getMovements({
                movementType: movementType || undefined,
                limit: 100,
            });
            setMovements(data);
        }
        catch (err) {
            setError(err.message || 'Failed to load stock movements');
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        loadMovements();
    }, [movementType]);
    return (_jsxs("div", { className: "inventory-history clay-card rounded-3xl p-6 sm:p-8 bg-white shadow-clay-card border border-white/80 space-y-6", children: [_jsxs("div", { className: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-black text-slate-800 tracking-tight", children: "Append-Only Stock Movement Ledger" }), _jsx("p", { className: "text-sm text-slate-500 font-medium", children: "Immutable audit trail of receipts, counter sales, returns, transfers, and write-offs" })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("select", { value: movementType, onChange: (e) => setMovementType(e.target.value), className: "clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm", children: [_jsx("option", { value: "", children: "All Movement Types" }), _jsx("option", { value: "PURCHASE_RECEIPT", children: "PURCHASE_RECEIPT" }), _jsx("option", { value: "CUSTOMER_SALE", children: "CUSTOMER_SALE" }), _jsx("option", { value: "CUSTOMER_RETURN", children: "CUSTOMER_RETURN" }), _jsx("option", { value: "SUPPLIER_RETURN", children: "SUPPLIER_RETURN" }), _jsx("option", { value: "DAMAGED_WRITE_OFF", children: "DAMAGED_WRITE_OFF" }), _jsx("option", { value: "STOCK_CORRECTION", children: "STOCK_CORRECTION" }), _jsx("option", { value: "CENTER_TRANSFER", children: "CENTER_TRANSFER" })] }), _jsx("button", { onClick: loadMovements, className: "bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-xs border border-slate-300 font-bold shadow-sm active:scale-95 transition-all", children: "\uD83D\uDD04 Refresh" })] })] }), error && (_jsx("div", { className: "p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold shadow-sm", children: error })), loading ? (_jsxs("div", { className: "text-center py-16 text-slate-400 text-sm font-semibold space-y-2", children: [_jsx("div", { className: "w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" }), _jsx("div", { children: "Loading movement ledger..." })] })) : movements.length === 0 ? (_jsx("div", { className: "text-center py-16 clay-inset rounded-2xl bg-slate-50/80 text-slate-500 text-sm font-semibold", children: "No stock movements recorded yet." })) : (_jsx("div", { className: "overflow-x-auto rounded-2xl border border-slate-200/80 shadow-sm", children: _jsxs("table", { className: "min-w-full divide-y divide-slate-200 text-xs text-left", children: [_jsx("thead", { className: "bg-[#F8FAFC] text-slate-600 font-extrabold uppercase tracking-wider", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3.5", children: "Timestamp" }), _jsx("th", { className: "px-4 py-3.5", children: "Center" }), _jsx("th", { className: "px-4 py-3.5", children: "Product" }), _jsx("th", { className: "px-4 py-3.5", children: "Movement Type" }), _jsx("th", { className: "px-4 py-3.5", children: "Delta" }), _jsx("th", { className: "px-4 py-3.5", children: "Balance After" }), _jsx("th", { className: "px-4 py-3.5", children: "Actor" }), _jsx("th", { className: "px-4 py-3.5", children: "Reference / Notes" })] }) }), _jsx("tbody", { className: "bg-white divide-y divide-slate-100", children: movements.map((m) => {
                                const isPositive = m.direction === 'IN';
                                return (_jsxs("tr", { className: "hover:bg-slate-50/80 transition-colors", children: [_jsx("td", { className: "px-4 py-3.5 text-slate-500 font-medium whitespace-nowrap", children: new Date(m.movementTimestamp).toLocaleString() }), _jsx("td", { className: "px-4 py-3.5 font-bold text-slate-800", children: m.centerName }), _jsxs("td", { className: "px-4 py-3.5", children: [_jsx("div", { className: "font-extrabold text-slate-900", children: m.productName }), _jsx("div", { className: "font-mono text-[10px] text-slate-400 font-bold", children: m.productCode })] }), _jsx("td", { className: "px-4 py-3.5", children: _jsx("span", { className: "font-mono font-bold text-[11px] bg-slate-100 px-2 py-0.5 rounded-md text-slate-700", children: m.movementType }) }), _jsx("td", { className: "px-4 py-3.5 font-mono font-extrabold text-xs", children: _jsxs("span", { className: isPositive ? 'text-emerald-700' : 'text-rose-700', children: [isPositive ? '+' : '-', Number(m.quantity).toFixed(3), " ", m.baseUnit] }) }), _jsxs("td", { className: "px-4 py-3.5 font-mono font-black text-slate-900", children: [Number(m.balanceAfter).toFixed(3), " ", m.baseUnit] }), _jsx("td", { className: "px-4 py-3.5 text-slate-600 font-medium", children: m.actorName || m.actorId.slice(0, 8) }), _jsxs("td", { className: "px-4 py-3.5 text-slate-500 text-[11px]", children: [_jsxs("div", { children: [m.referenceTransactionType, ": ", _jsxs("span", { className: "font-mono font-bold", children: [m.referenceId?.slice(0, 8), "..."] })] }), m.notes && _jsx("div", { className: "italic text-slate-400", children: m.notes })] })] }, m.id));
                            }) })] }) }))] }));
};
//# sourceMappingURL=InventoryHistory.js.map