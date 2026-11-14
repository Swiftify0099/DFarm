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
    return (_jsxs("div", { className: "inventory-history p-6 bg-white rounded-lg shadow", children: [_jsxs("div", { className: "flex justify-between items-center mb-6", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-bold text-gray-800", children: "Append-Only Stock Movement Ledger" }), _jsx("p", { className: "text-sm text-gray-500", children: "Immutable audit trail of receipts, counter sales, returns, transfers, and write-offs" })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("select", { value: movementType, onChange: (e) => setMovementType(e.target.value), className: "border rounded px-3 py-1.5 text-xs font-medium", children: [_jsx("option", { value: "", children: "All Movement Types" }), _jsx("option", { value: "PURCHASE_RECEIPT", children: "PURCHASE_RECEIPT" }), _jsx("option", { value: "CUSTOMER_SALE", children: "CUSTOMER_SALE" }), _jsx("option", { value: "CUSTOMER_RETURN", children: "CUSTOMER_RETURN" }), _jsx("option", { value: "SUPPLIER_RETURN", children: "SUPPLIER_RETURN" }), _jsx("option", { value: "DAMAGED_WRITE_OFF", children: "DAMAGED_WRITE_OFF" }), _jsx("option", { value: "STOCK_CORRECTION", children: "STOCK_CORRECTION" }), _jsx("option", { value: "CENTER_TRANSFER", children: "CENTER_TRANSFER" })] }), _jsx("button", { onClick: loadMovements, className: "bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-xs border font-medium", children: "Refresh" })] })] }), error && (_jsx("div", { className: "bg-red-50 text-red-700 p-4 rounded-md mb-4 text-sm border border-red-200", children: error })), loading ? (_jsx("div", { className: "text-center py-12 text-gray-500 text-sm", children: "Loading movement ledger..." })) : movements.length === 0 ? (_jsx("div", { className: "text-center py-12 bg-gray-50 rounded text-gray-500 text-sm", children: "No stock movements recorded yet." })) : (_jsx("div", { className: "overflow-x-auto border border-gray-200 rounded-lg", children: _jsxs("table", { className: "min-w-full divide-y divide-gray-200 text-xs text-left", children: [_jsx("thead", { className: "bg-gray-50 text-gray-600 font-semibold uppercase tracking-wider", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3", children: "Timestamp" }), _jsx("th", { className: "px-4 py-3", children: "Center" }), _jsx("th", { className: "px-4 py-3", children: "Product" }), _jsx("th", { className: "px-4 py-3", children: "Movement Type" }), _jsx("th", { className: "px-4 py-3", children: "Delta" }), _jsx("th", { className: "px-4 py-3", children: "Balance After" }), _jsx("th", { className: "px-4 py-3", children: "Actor" }), _jsx("th", { className: "px-4 py-3", children: "Reference / Notes" })] }) }), _jsx("tbody", { className: "bg-white divide-y divide-gray-200", children: movements.map((m) => {
                                const isPositive = m.direction === 'IN';
                                return (_jsxs("tr", { className: "hover:bg-gray-50", children: [_jsx("td", { className: "px-4 py-3 text-gray-500 whitespace-nowrap", children: new Date(m.movementTimestamp).toLocaleString() }), _jsx("td", { className: "px-4 py-3 font-medium text-gray-800", children: m.centerName }), _jsxs("td", { className: "px-4 py-3", children: [_jsx("div", { className: "font-semibold text-gray-900", children: m.productName }), _jsx("div", { className: "font-mono text-[10px] text-gray-400", children: m.productCode })] }), _jsx("td", { className: "px-4 py-3", children: _jsx("span", { className: "font-mono font-bold text-[11px] text-gray-700", children: m.movementType }) }), _jsx("td", { className: "px-4 py-3 font-mono font-bold", children: _jsxs("span", { className: isPositive ? 'text-emerald-700' : 'text-rose-700', children: [isPositive ? '+' : '-', Number(m.quantity).toFixed(3), " ", m.baseUnit] }) }), _jsxs("td", { className: "px-4 py-3 font-mono font-bold text-gray-900", children: [Number(m.balanceAfter).toFixed(3), " ", m.baseUnit] }), _jsx("td", { className: "px-4 py-3 text-gray-600", children: m.actorName || m.actorId.slice(0, 8) }), _jsxs("td", { className: "px-4 py-3 text-gray-500 text-[11px]", children: [_jsxs("div", { children: [m.referenceTransactionType, ": ", _jsxs("span", { className: "font-mono", children: [m.referenceId?.slice(0, 8), "..."] })] }), m.notes && _jsx("div", { className: "italic text-gray-400", children: m.notes })] })] }, m.id));
                            }) })] }) }))] }));
};
//# sourceMappingURL=InventoryHistory.js.map