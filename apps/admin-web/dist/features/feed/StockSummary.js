import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { feedApi } from '../../api/feedApi.js';
export const StockSummary = ({ onOpenTransferModal, onOpenAdjustmentModal, }) => {
    const [inventory, setInventory] = useState([]);
    const [valuationData, setValuationData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filterLowStockOnly, setFilterLowStockOnly] = useState(false);
    const loadStock = async () => {
        try {
            setLoading(true);
            setError(null);
            const [inv, val] = await Promise.all([
                feedApi.getInventory(),
                feedApi.getReports({ type: 'valuation' }),
            ]);
            setInventory(inv);
            setValuationData(val);
        }
        catch (err) {
            setError(err.message || 'Failed to load inventory stock');
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        loadStock();
    }, []);
    const filteredItems = inventory.filter((item) => {
        if (!filterLowStockOnly)
            return true;
        return Number(item.currentStock) <= Number(item.minimumStockLevel);
    });
    return (_jsxs("div", { className: "stock-summary p-6 bg-white rounded-lg shadow", children: [_jsxs("div", { className: "flex justify-between items-center mb-6", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-bold text-gray-800", children: "Center-Wise Feed Inventory & Valuation" }), _jsx("p", { className: "text-sm text-gray-500", children: "Real-time stock ledger, minimum threshold reorder alerts, and Weighted Average Costing (WAC)" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => onOpenTransferModal(), className: "bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded text-sm font-medium shadow", children: "\u2194 Transfer Between Centers" }), _jsx("button", { onClick: () => onOpenAdjustmentModal(), className: "bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded text-sm font-medium shadow", children: "\u00B1 Adjust / Write-off Stock" })] })] }), valuationData && (_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4 mb-6", children: [_jsxs("div", { className: "bg-emerald-50 border border-emerald-200 rounded-lg p-4", children: [_jsx("div", { className: "text-xs font-semibold text-emerald-800 uppercase", children: "Total Stock Valuation (WAC)" }), _jsxs("div", { className: "text-2xl font-bold text-emerald-700 mt-1", children: ["\u20B9", Number(valuationData.totalValuation).toLocaleString('en-IN', { minimumFractionDigits: 2 })] }), _jsx("div", { className: "text-xs text-emerald-600 mt-1", children: "Costing Method: Weighted Average Cost" })] }), _jsxs("div", { className: "bg-blue-50 border border-blue-200 rounded-lg p-4", children: [_jsx("div", { className: "text-xs font-semibold text-blue-800 uppercase", children: "Active Center Inventory Rows" }), _jsx("div", { className: "text-2xl font-bold text-blue-700 mt-1", children: inventory.length }), _jsx("div", { className: "text-xs text-blue-600 mt-1", children: "Across all registered dairy centers" })] }), _jsxs("div", { className: "bg-rose-50 border border-rose-200 rounded-lg p-4", children: [_jsx("div", { className: "text-xs font-semibold text-rose-800 uppercase", children: "Low Stock Alert Count" }), _jsx("div", { className: "text-2xl font-bold text-rose-700 mt-1", children: inventory.filter((i) => Number(i.currentStock) <= Number(i.minimumStockLevel)).length }), _jsx("div", { className: "text-xs text-rose-600 mt-1", children: "Stock at or below reorder threshold" })] })] })), _jsxs("div", { className: "flex items-center gap-4 mb-4", children: [_jsxs("label", { className: "flex items-center gap-2 text-sm text-gray-700 cursor-pointer", children: [_jsx("input", { type: "checkbox", checked: filterLowStockOnly, onChange: (e) => setFilterLowStockOnly(e.target.checked), className: "rounded text-emerald-600 focus:ring-emerald-500" }), "Show Low Stock Warnings Only"] }), _jsx("button", { onClick: loadStock, className: "ml-auto text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded border", children: "Refresh Stock" })] }), error && (_jsx("div", { className: "bg-red-50 text-red-700 p-4 rounded-md mb-4 text-sm border border-red-200", children: error })), loading ? (_jsx("div", { className: "text-center py-12 text-gray-500 text-sm", children: "Loading stock balances..." })) : filteredItems.length === 0 ? (_jsx("div", { className: "text-center py-12 bg-gray-50 rounded text-gray-500 text-sm", children: "No inventory records found." })) : (_jsx("div", { className: "overflow-x-auto border border-gray-200 rounded-lg", children: _jsxs("table", { className: "min-w-full divide-y divide-gray-200 text-sm text-left", children: [_jsx("thead", { className: "bg-gray-50 text-gray-600 font-semibold text-xs uppercase tracking-wider", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3", children: "Center" }), _jsx("th", { className: "px-4 py-3", children: "Product" }), _jsx("th", { className: "px-4 py-3", children: "Current Stock" }), _jsx("th", { className: "px-4 py-3", children: "Min Threshold" }), _jsx("th", { className: "px-4 py-3", children: "Avg Unit Cost (WAC)" }), _jsx("th", { className: "px-4 py-3", children: "Selling Rate" }), _jsx("th", { className: "px-4 py-3", children: "Valuation" }), _jsx("th", { className: "px-4 py-3", children: "Status" }), _jsx("th", { className: "px-4 py-3 text-right", children: "Quick Actions" })] }) }), _jsx("tbody", { className: "bg-white divide-y divide-gray-200", children: filteredItems.map((item) => {
                                const isLow = Number(item.currentStock) <= Number(item.minimumStockLevel);
                                const val = Number(item.currentStock) * Number(item.weightedAvgCost);
                                return (_jsxs("tr", { className: `hover:bg-gray-50 ${isLow ? 'bg-amber-50/40' : ''}`, children: [_jsx("td", { className: "px-4 py-3 font-medium text-gray-800", children: item.centerName }), _jsxs("td", { className: "px-4 py-3", children: [_jsx("div", { className: "font-semibold text-gray-900", children: item.productName }), _jsx("div", { className: "text-xs font-mono text-gray-500", children: item.productCode })] }), _jsxs("td", { className: "px-4 py-3 font-bold text-gray-900", children: [Number(item.currentStock).toFixed(3), " ", item.baseUnit] }), _jsxs("td", { className: "px-4 py-3 text-gray-600", children: [Number(item.minimumStockLevel).toFixed(3), " ", item.baseUnit] }), _jsxs("td", { className: "px-4 py-3 text-gray-700", children: ["\u20B9", Number(item.weightedAvgCost).toFixed(2)] }), _jsxs("td", { className: "px-4 py-3 text-emerald-700 font-medium", children: ["\u20B9", Number(item.sellingPrice).toFixed(2)] }), _jsxs("td", { className: "px-4 py-3 font-semibold text-gray-900", children: ["\u20B9", val.toFixed(2)] }), _jsx("td", { className: "px-4 py-3", children: isLow ? (_jsx("span", { className: "inline-block px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800 animate-pulse", children: "LOW STOCK" })) : (_jsx("span", { className: "inline-block px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800", children: "ADEQUATE" })) }), _jsxs("td", { className: "px-4 py-3 text-right space-x-2", children: [_jsx("button", { onClick: () => onOpenAdjustmentModal(item.productId), className: "text-xs text-amber-700 hover:text-amber-900 font-medium", children: "Adjust" }), _jsx("button", { onClick: () => onOpenTransferModal(item.productId), className: "text-xs text-indigo-700 hover:text-indigo-900 font-medium", children: "Transfer" })] })] }, item.id));
                            }) })] }) }))] }));
};
//# sourceMappingURL=StockSummary.js.map