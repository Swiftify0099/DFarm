import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { feedApi } from '../../api/feedApi.js';
import { useAuth } from '../../context/AuthContext.js';
export const StockAdjustmentModal = ({ initialProductId, onClose, onSuccess, }) => {
    const { currentCenterId, selectedCenterId, centers } = useAuth();
    const [products, setProducts] = useState([]);
    const [selectedProductId, setSelectedProductId] = useState(initialProductId || '');
    const [centerId, setCenterId] = useState(selectedCenterId || currentCenterId || (centers.length > 0 ? centers[0].id : ''));
    const [adjustmentType, setAdjustmentType] = useState('DAMAGED_WRITE_OFF');
    const [direction, setDirection] = useState('OUT');
    const [quantity, setQuantity] = useState(1);
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        async function load() {
            try {
                const prods = await feedApi.getProducts({ status: 'ACTIVE' });
                setProducts(prods);
                if (!selectedProductId && prods.length > 0 && prods[0]) {
                    setSelectedProductId(prods[0].id);
                }
                const initialCenter = selectedCenterId || currentCenterId || (centers.length > 0 ? centers[0].id : '');
                if (initialCenter && !centerId) {
                    setCenterId(initialCenter);
                }
            }
            catch (err) {
                setError(err.message || 'Failed to load products');
            }
        }
        load();
    }, [initialProductId, centers, currentCenterId, selectedCenterId]);
    const handleSubmit = async (e) => {
        e.preventDefault();
        const targetCenterId = centerId || selectedCenterId || currentCenterId || (centers.length > 0 ? centers[0].id : '');
        if (!selectedProductId || !targetCenterId) {
            setError('Product and center are required');
            return;
        }
        try {
            setSubmitting(true);
            setError(null);
            const idempotencyKey = `adj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            await feedApi.adjustStock({
                centerId: targetCenterId,
                productId: selectedProductId,
                adjustmentType,
                quantity: Number(quantity),
                direction,
                reason: reason.trim(),
                idempotencyKey,
            });
            onSuccess();
        }
        catch (err) {
            setError(err.message || 'Stock adjustment failed');
        }
        finally {
            setSubmitting(false);
        }
    };
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4", children: _jsxs("div", { className: "bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden", children: [_jsxs("div", { className: "px-6 py-4 bg-gray-50 border-b flex justify-between items-center", children: [_jsx("h3", { className: "font-bold text-gray-800 text-lg", children: "Stock Adjustment & Write-Off" }), _jsx("button", { onClick: onClose, className: "text-gray-400 hover:text-gray-600 font-bold text-xl", children: "\u00D7" })] }), _jsxs("form", { onSubmit: handleSubmit, className: "p-6 space-y-4", children: [error && (_jsx("div", { className: "bg-red-50 text-red-700 p-3 rounded text-xs border border-red-200", children: error })), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Target Intake Center *" }), _jsx("select", { value: centerId || selectedCenterId || currentCenterId || '', onChange: (e) => setCenterId(e.target.value), className: "w-full border rounded px-3 py-2 text-sm bg-white", children: centers.map((c) => (_jsxs("option", { value: c.id, children: [c.name, " (", c.code, ")"] }, c.id))) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Select Feed Product *" }), _jsx("select", { value: selectedProductId, onChange: (e) => setSelectedProductId(e.target.value), className: "w-full border rounded px-3 py-2 text-sm", children: products.map((p) => (_jsxs("option", { value: p.id, children: [p.name, " (", p.code, ") - Base: ", p.baseUnit] }, p.id))) })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Adjustment Type *" }), _jsxs("select", { value: adjustmentType, onChange: (e) => {
                                                const val = e.target.value;
                                                setAdjustmentType(val);
                                                if (val === 'DAMAGED_WRITE_OFF' || val === 'PHYSICAL_AUDIT_DEFICIT') {
                                                    setDirection('OUT');
                                                }
                                                else if (val === 'PHYSICAL_AUDIT_SURPLUS') {
                                                    setDirection('IN');
                                                }
                                            }, className: "w-full border rounded px-3 py-2 text-sm", children: [_jsx("option", { value: "DAMAGED_WRITE_OFF", children: "Damaged Write-Off" }), _jsx("option", { value: "STOCK_CORRECTION", children: "Stock Correction" }), _jsx("option", { value: "PHYSICAL_AUDIT_DEFICIT", children: "Audit Deficit (Discrepancy)" }), _jsx("option", { value: "PHYSICAL_AUDIT_SURPLUS", children: "Audit Surplus (Discrepancy)" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Direction *" }), _jsxs("select", { value: direction, onChange: (e) => setDirection(e.target.value), className: "w-full border rounded px-3 py-2 text-sm font-bold", children: [_jsx("option", { value: "OUT", children: "OUT (Decrease Stock)" }), _jsx("option", { value: "IN", children: "IN (Increase Stock)" })] })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Quantity (Base Units) *" }), _jsx("input", { type: "number", min: "0.001", step: "any", required: true, value: quantity, onChange: (e) => setQuantity(Number(e.target.value)), className: "w-full border rounded px-3 py-2 text-sm font-bold" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Audited Reason *" }), _jsx("textarea", { rows: 2, required: true, placeholder: "e.g. Moisture damage in warehouse bay 3 / Annual stock count variance...", value: reason, onChange: (e) => setReason(e.target.value), className: "w-full border rounded px-3 py-2 text-sm" })] }), _jsxs("div", { className: "flex justify-end gap-3 pt-3 border-t", children: [_jsx("button", { type: "button", onClick: onClose, className: "px-4 py-2 border rounded text-sm text-gray-700 hover:bg-gray-100", children: "Cancel" }), _jsx("button", { type: "submit", disabled: submitting, className: "px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded text-sm font-bold shadow disabled:opacity-50", children: submitting ? 'Applying Adjustment...' : 'Approve & Post Movement' })] })] })] }) }));
};
//# sourceMappingURL=StockAdjustmentModal.js.map