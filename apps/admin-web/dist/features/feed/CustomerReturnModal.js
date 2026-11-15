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
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200", children: _jsxs("div", { className: "clay-card bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-white flex flex-col", children: [_jsxs("div", { className: "px-6 py-4 bg-gradient-to-r from-rose-800 to-rose-900 text-white flex justify-between items-center", children: [_jsx("h3", { className: "font-black text-lg", children: "Process Authorized Customer Return" }), _jsx("button", { onClick: onClose, className: "w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold text-lg text-white transition-colors", children: "\u00D7" })] }), result ? (_jsxs("div", { className: "p-6 sm:p-8 space-y-4 text-center", children: [_jsx("div", { className: "w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-2xl font-black shadow-inner", children: "\u2713" }), _jsx("h4", { className: "font-black text-xl text-slate-800", children: "Return Processed Successfully" }), _jsxs("div", { className: "clay-inset bg-[#EEF2F6] p-4 rounded-2xl text-xs text-left space-y-2.5 border border-slate-200/80", children: [_jsxs("div", { className: "flex justify-between font-medium text-slate-600", children: [_jsx("span", { children: "Refunded / Credited Amount:" }), _jsxs("span", { className: "font-black text-emerald-700 text-sm", children: ["\u20B9", Number(result.creditAmount).toFixed(2)] })] }), _jsxs("div", { className: "flex justify-between font-medium text-slate-600", children: [_jsx("span", { children: "Stock Condition:" }), _jsx("span", { className: "font-bold text-slate-800", children: result.stockCondition })] }), result.stockCondition === 'DAMAGED' && (_jsx("div", { className: "text-rose-600 text-[11px] font-bold", children: "* Product marked damaged and quarantined. Not added to active sellable stock." })), result.customerBalanceAfter !== undefined && (_jsxs("div", { className: "flex justify-between font-black text-indigo-900 border-t border-slate-200 pt-2 text-sm", children: [_jsx("span", { children: "Farmer Subledger Balance After:" }), _jsxs("span", { children: ["\u20B9", Number(result.customerBalanceAfter).toFixed(2)] })] }))] }), _jsx("button", { onClick: onClose, className: "clay-btn-brand px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-xl font-extrabold text-sm shadow-clay-button hover:from-emerald-500 hover:to-teal-600 active:scale-95 transition-all", children: "Done" })] })) : (_jsxs("form", { onSubmit: handleSubmitReturn, className: "p-6 space-y-4", children: [error && (_jsx("div", { className: "p-3 bg-rose-50 text-rose-700 rounded-xl text-xs font-bold border border-rose-200", children: error })), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Original Sale UUID *" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "text", required: true, placeholder: "Paste Sale UUID...", value: saleId, onChange: (e) => setSaleId(e.target.value), className: "flex-1 clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-sm" }), _jsx("button", { type: "button", onClick: handleLookupSale, disabled: searching, className: "bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 shadow-sm active:scale-95 transition-all", children: searching ? 'Loading...' : 'Lookup' })] })] }), saleItem && (_jsxs("div", { className: "p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs space-y-1 shadow-sm", children: [_jsx("div", { className: "font-extrabold text-slate-900", children: saleItem.productName }), _jsxs("div", { className: "text-slate-600 font-medium", children: ["Sold Quantity: ", _jsxs("span", { className: "font-bold text-slate-800", children: [saleItem.quantity, " ", saleItem.unit] }), " | Unit Rate: ", _jsxs("span", { className: "font-bold text-emerald-700", children: ["\u20B9", Number(saleItem.unitPrice).toFixed(2)] })] })] })), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Return Quantity *" }), _jsx("input", { type: "number", min: "0.001", step: "any", required: true, value: returnQuantity, onChange: (e) => setReturnQuantity(Number(e.target.value)), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Stock Condition *" }), _jsxs("select", { value: stockCondition, onChange: (e) => setStockCondition(e.target.value), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-sm", children: [_jsx("option", { value: "SALEABLE", children: "SALEABLE (Add back to stock)" }), _jsx("option", { value: "DAMAGED", children: "DAMAGED (Write-off quarantine)" })] })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Reason for Return *" }), _jsx("textarea", { rows: 2, required: true, placeholder: "e.g. Bag torn during unloading / Customer requested exchange...", value: reason, onChange: (e) => setReason(e.target.value), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-sm" })] }), _jsxs("div", { className: "flex justify-end gap-3 pt-3 border-t border-slate-100", children: [_jsx("button", { type: "button", onClick: onClose, className: "px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 active:scale-95 transition-all", children: "Cancel" }), _jsx("button", { type: "submit", disabled: submitting || !saleItem, className: "clay-btn-brand px-5 py-2.5 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white rounded-xl text-xs font-extrabold shadow-clay-button disabled:opacity-40 active:scale-95 transition-all", children: submitting ? 'Processing Return...' : 'Authorize Return & Post Credit' })] })] }))] }) }));
};
//# sourceMappingURL=CustomerReturnModal.js.map