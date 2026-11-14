import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { feedApi } from '../../api/feedApi.js';
import { useAuth } from '../../context/AuthContext.js';
export const CustomerReturnModal = ({ onClose, onSuccess }) => {
    const { user } = useAuth();
    const [saleId, setSaleId] = useState('');
    const [saleItem, setSaleItem] = useState(null);
    const [searching, setSearching] = useState(false);
    const [returnQuantity, setReturnQuantity] = useState(1);
    const [stockCondition, setStockCondition] = useState('SALEABLE');
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const handleLookupSale = async () => {
        if (!saleId.trim())
            return;
        try {
            setSearching(true);
            setError(null);
            const sale = await feedApi.getSaleById(saleId.trim());
            if (sale && sale.items && sale.items.length > 0) {
                setSaleItem(sale.items[0]);
            }
            else {
                setError('No items found on this sale invoice');
            }
        }
        catch (err) {
            setError(err.message || 'Sale lookup failed');
        }
        finally {
            setSearching(false);
        }
    };
    const handleSubmitReturn = async (e) => {
        e.preventDefault();
        if (!saleItem) {
            setError('Lookup a valid sale invoice first');
            return;
        }
        try {
            setSubmitting(true);
            setError(null);
            const idempotencyKey = `ret_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            const res = await feedApi.processReturn(saleId.trim(), {
                saleItemId: saleItem.id,
                returnQuantity: Number(returnQuantity),
                stockCondition,
                reason: reason.trim(),
                approvedBy: user?.id,
                idempotencyKey,
            });
            setResult(res);
            onSuccess();
        }
        catch (err) {
            setError(err.message || 'Return processing failed');
        }
        finally {
            setSubmitting(false);
        }
    };
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4", children: _jsxs("div", { className: "bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col", children: [_jsxs("div", { className: "px-6 py-4 bg-gray-50 border-b flex justify-between items-center", children: [_jsx("h3", { className: "font-bold text-gray-800 text-lg", children: "Process Authorized Customer Return" }), _jsx("button", { onClick: onClose, className: "text-gray-400 hover:text-gray-600 font-bold text-xl", children: "\u00D7" })] }), result ? (_jsxs("div", { className: "p-6 space-y-4 text-center", children: [_jsx("div", { className: "w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold", children: "\u2713" }), _jsx("h4", { className: "font-bold text-lg text-gray-800", children: "Return Processed Successfully" }), _jsxs("div", { className: "bg-gray-50 p-4 rounded text-xs text-left space-y-2 border", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Refunded / Credited Amount:" }), _jsxs("span", { className: "font-bold text-emerald-700", children: ["\u20B9", Number(result.creditAmount).toFixed(2)] })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Stock Condition:" }), _jsx("span", { className: "font-bold", children: result.stockCondition })] }), result.stockCondition === 'DAMAGED' && (_jsx("div", { className: "text-rose-600 text-[11px] font-semibold", children: "* Product marked damaged and quarantined. Not added to active sellable stock." })), result.customerBalanceAfter !== undefined && (_jsxs("div", { className: "flex justify-between font-bold text-indigo-900 border-t pt-1", children: [_jsx("span", { children: "Farmer Subledger Balance After:" }), _jsxs("span", { children: ["\u20B9", Number(result.customerBalanceAfter).toFixed(2)] })] }))] }), _jsx("button", { onClick: onClose, className: "px-6 py-2 bg-emerald-600 text-white rounded font-bold text-sm shadow hover:bg-emerald-700", children: "Done" })] })) : (_jsxs("form", { onSubmit: handleSubmitReturn, className: "p-6 space-y-4", children: [error && (_jsx("div", { className: "bg-red-50 text-red-700 p-3 rounded text-xs border border-red-200", children: error })), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Original Sale UUID *" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "text", required: true, placeholder: "Paste Sale UUID...", value: saleId, onChange: (e) => setSaleId(e.target.value), className: "flex-1 border rounded px-3 py-2 text-xs font-mono" }), _jsx("button", { type: "button", onClick: handleLookupSale, disabled: searching, className: "bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded text-xs font-semibold border", children: searching ? 'Loading...' : 'Lookup' })] })] }), saleItem && (_jsxs("div", { className: "p-3 bg-emerald-50/50 border border-emerald-200 rounded text-xs space-y-1", children: [_jsx("div", { className: "font-bold text-gray-900", children: saleItem.productName }), _jsxs("div", { className: "text-gray-600", children: ["Sold Quantity: ", saleItem.quantity, " ", saleItem.unit, " | Unit Rate: \u20B9", Number(saleItem.unitPrice).toFixed(2)] })] })), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Return Quantity *" }), _jsx("input", { type: "number", min: "0.001", step: "any", required: true, value: returnQuantity, onChange: (e) => setReturnQuantity(Number(e.target.value)), className: "w-full border rounded px-3 py-2 text-xs font-bold" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Stock Condition *" }), _jsxs("select", { value: stockCondition, onChange: (e) => setStockCondition(e.target.value), className: "w-full border rounded px-3 py-2 text-xs font-semibold", children: [_jsx("option", { value: "SALEABLE", children: "SALEABLE (Add back to stock)" }), _jsx("option", { value: "DAMAGED", children: "DAMAGED (Write-off quarantine)" })] })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Reason for Return *" }), _jsx("textarea", { rows: 2, required: true, placeholder: "e.g. Bag torn during unloading / Customer requested exchange...", value: reason, onChange: (e) => setReason(e.target.value), className: "w-full border rounded px-3 py-2 text-xs" })] }), _jsxs("div", { className: "flex justify-end gap-3 pt-3 border-t", children: [_jsx("button", { type: "button", onClick: onClose, className: "px-4 py-2 border rounded text-xs text-gray-700 hover:bg-gray-100", children: "Cancel" }), _jsx("button", { type: "submit", disabled: submitting || !saleItem, className: "px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold shadow disabled:opacity-50", children: submitting ? 'Processing Return...' : 'Authorize Return & Post Credit' })] })] }))] }) }));
};
//# sourceMappingURL=CustomerReturnModal.js.map