import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { feedApi } from '../../api/feedApi.js';
import { useAuth } from '../../context/AuthContext.js';
export const PurchaseReceiving = () => {
    const { currentCenterId, selectedCenterId, centers } = useAuth();
    const [suppliers, setSuppliers] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);
    // Form state
    const [selectedSupplierId, setSelectedSupplierId] = useState('');
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0] ?? '');
    const [centerId, setCenterId] = useState(selectedCenterId || currentCenterId || (centers.length > 0 ? centers[0].id : ''));
    const [items, setItems] = useState([]);
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        async function init() {
            try {
                setLoading(true);
                const [sups, prods] = await Promise.all([
                    feedApi.getSuppliers(),
                    feedApi.getProducts({ status: 'ACTIVE' }),
                ]);
                setSuppliers(sups);
                setProducts(prods);
                if (sups.length > 0 && sups[0])
                    setSelectedSupplierId(sups[0].id);
                const initialCenter = selectedCenterId || currentCenterId || (centers.length > 0 ? centers[0].id : '');
                if (initialCenter && !centerId) {
                    setCenterId(initialCenter);
                }
            }
            catch (err) {
                setError(err.message || 'Initialization failed');
            }
            finally {
                setLoading(false);
            }
        }
        init();
    }, [centers, currentCenterId, selectedCenterId]);
    const handleAddItem = () => {
        if (products.length === 0 || !products[0])
            return;
        const defaultProd = products[0];
        setItems([
            ...items,
            {
                productId: defaultProd.id,
                quantity: 10,
                unit: defaultProd.packUnit,
                unitCost: Number(defaultProd.defaultPurchasePrice || defaultProd.sellingPrice * 0.8),
                taxRatePercent: Number(defaultProd.taxRatePercent || 0),
                batchNumber: `BATCH-${Date.now().toString().slice(-6)}`,
            },
        ]);
    };
    const handleRemoveItem = (index) => {
        setItems(items.filter((_, idx) => idx !== index));
    };
    const handleItemChange = (index, field, val) => {
        setItems(items.map((item, idx) => {
            if (idx !== index)
                return item;
            const updated = { ...item, [field]: val };
            if (field === 'productId') {
                const p = products.find((x) => x.id === val);
                if (p) {
                    updated.unit = p.packUnit;
                    updated.unitCost = Number(p.defaultPurchasePrice || 0);
                    updated.taxRatePercent = Number(p.taxRatePercent || 0);
                }
            }
            return updated;
        }));
    };
    const handleSaveAndReceive = async (e) => {
        e.preventDefault();
        if (!selectedSupplierId) {
            setError('Please select a supplier');
            return;
        }
        if (items.length === 0) {
            setError('Please add at least one line item to the purchase invoice');
            return;
        }
        const targetCenterId = centerId || selectedCenterId || currentCenterId || (centers.length > 0 ? centers[0].id : '');
        if (!targetCenterId) {
            setError('Please select a target center');
            return;
        }
        try {
            setSaving(true);
            setError(null);
            setSuccessMsg(null);
            const idempotencyKey = `po_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            // 1. Create Purchase
            const purchase = await feedApi.createPurchase({
                centerId: targetCenterId,
                supplierId: selectedSupplierId,
                supplierInvoiceNumber: invoiceNumber.trim(),
                purchaseDate,
                items,
                idempotencyKey,
            });
            // 2. Authorize Stock Receiving immediately
            await feedApi.receivePurchase(purchase.id, {
                idempotencyKey: `${idempotencyKey}_rcv`,
                notes: `Authorized goods receipt against supplier invoice ${invoiceNumber}`,
            });
            setSuccessMsg(`Purchase ${purchase.supplierInvoiceNumber} successfully received! Stock balances updated and WAC recalculated.`);
            setInvoiceNumber('');
            setItems([]);
        }
        catch (err) {
            setError(err.message || 'Purchase receiving failed');
        }
        finally {
            setSaving(false);
        }
    };
    const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);
    const taxTotal = items.reduce((sum, i) => sum + i.quantity * i.unitCost * (i.taxRatePercent / 100), 0);
    const total = subtotal + taxTotal;
    if (loading) {
        return (_jsxs("div", { className: "clay-card rounded-3xl p-12 bg-white shadow-clay-card text-center text-slate-400 text-sm font-semibold space-y-2", children: [_jsx("div", { className: "w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" }), _jsx("div", { children: "Loading procurement & supplier records..." })] }));
    }
    return (_jsxs("div", { className: "purchase-receiving clay-card rounded-3xl p-6 sm:p-8 bg-white shadow-clay-card border border-white/80 space-y-6", children: [_jsxs("div", { className: "border-b border-slate-100 pb-4", children: [_jsx("h2", { className: "text-2xl font-black text-slate-800 tracking-tight", children: "Feed Procurement & Stock Receiving" }), _jsx("p", { className: "text-sm text-slate-500 font-medium", children: "Record supplier invoices, verify batch numbers, and authorize immediate stock increment into warehouse ledger" })] }), error && (_jsx("div", { className: "p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold shadow-sm", children: error })), successMsg && (_jsxs("div", { className: "p-4 rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-sm font-extrabold shadow-sm flex items-center gap-2", children: [_jsx("span", { children: "\u2713" }), _jsx("span", { children: successMsg })] })), _jsxs("form", { onSubmit: handleSaveAndReceive, className: "space-y-6", children: [_jsxs("div", { className: "clay-inset p-5 rounded-2xl bg-[#EEF2F6] border border-[#CBD5E1]/50 grid grid-cols-1 md:grid-cols-4 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1.5", children: "Target Center *" }), _jsx("select", { required: true, value: centerId || selectedCenterId || currentCenterId || '', onChange: (e) => setCenterId(e.target.value), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm", children: centers.map((c) => (_jsxs("option", { value: c.id, children: [c.name, " (", c.code, ")"] }, c.id))) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1.5", children: "Select Supplier *" }), _jsx("select", { required: true, value: selectedSupplierId, onChange: (e) => setSelectedSupplierId(e.target.value), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm", children: suppliers.map((s) => (_jsxs("option", { value: s.id, children: [s.name, " (", s.supplierCode, ")"] }, s.id))) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1.5", children: "Supplier Invoice Number *" }), _jsx("input", { type: "text", required: true, placeholder: "e.g. INV-AGRO-2026-901", value: invoiceNumber, onChange: (e) => setInvoiceNumber(e.target.value), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1.5", children: "Purchase Date *" }), _jsx("input", { type: "date", required: true, value: purchaseDate, onChange: (e) => setPurchaseDate(e.target.value), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] })] }), _jsxs("div", { children: [_jsxs("div", { className: "flex justify-between items-center mb-3", children: [_jsx("h3", { className: "font-extrabold text-slate-800 text-xs uppercase tracking-wider", children: "Invoice Line Items" }), _jsx("button", { type: "button", onClick: handleAddItem, className: "text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold px-3.5 py-1.5 rounded-xl border border-indigo-200 active:scale-95 transition-all shadow-sm", children: "\u2795 Add Item Line" })] }), items.length === 0 ? (_jsx("div", { className: "text-center py-10 clay-inset rounded-2xl bg-slate-50/80 border border-dashed border-slate-300 text-slate-500 text-xs font-semibold", children: "No product items added yet. Click \"+ Add Item Line\" above." })) : (_jsx("div", { className: "overflow-x-auto rounded-2xl border border-slate-200/80 shadow-sm", children: _jsxs("table", { className: "min-w-full divide-y divide-slate-200 text-xs text-left", children: [_jsx("thead", { className: "bg-[#F8FAFC] font-extrabold text-slate-600 uppercase tracking-wider", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3.5 py-3", children: "Feed Product" }), _jsx("th", { className: "px-3.5 py-3", children: "Quantity" }), _jsx("th", { className: "px-3.5 py-3", children: "Unit" }), _jsx("th", { className: "px-3.5 py-3", children: "Unit Cost (\u20B9)" }), _jsx("th", { className: "px-3.5 py-3", children: "GST Rate (%)" }), _jsx("th", { className: "px-3.5 py-3", children: "Batch Reference" }), _jsx("th", { className: "px-3.5 py-3", children: "Line Total" }), _jsx("th", { className: "px-3.5 py-3 text-right", children: "Action" })] }) }), _jsx("tbody", { className: "divide-y divide-slate-100 bg-white", children: items.map((item, idx) => {
                                                const lineTotal = item.quantity * item.unitCost * (1 + item.taxRatePercent / 100);
                                                return (_jsxs("tr", { className: "hover:bg-slate-50/80 transition-colors", children: [_jsx("td", { className: "px-3.5 py-2.5", children: _jsx("select", { value: item.productId, onChange: (e) => handleItemChange(idx, 'productId', e.target.value), className: "border border-slate-300 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800 w-full max-w-[200px]", children: products.map((p) => (_jsx("option", { value: p.id, children: p.name }, p.id))) }) }), _jsx("td", { className: "px-3.5 py-2.5", children: _jsx("input", { type: "number", min: "0.001", step: "any", value: item.quantity, onChange: (e) => handleItemChange(idx, 'quantity', Number(e.target.value)), className: "w-20 border border-slate-300 rounded-lg px-2 py-1 text-xs font-black text-slate-900" }) }), _jsx("td", { className: "px-3.5 py-2.5", children: _jsx("input", { type: "text", value: item.unit, onChange: (e) => handleItemChange(idx, 'unit', e.target.value), className: "w-16 border border-slate-300 rounded-lg px-2 py-1 text-xs uppercase font-bold text-slate-700" }) }), _jsx("td", { className: "px-3.5 py-2.5", children: _jsx("input", { type: "number", min: "0", step: "0.01", value: item.unitCost, onChange: (e) => handleItemChange(idx, 'unitCost', Number(e.target.value)), className: "w-24 border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-900" }) }), _jsx("td", { className: "px-3.5 py-2.5", children: _jsx("input", { type: "number", min: "0", max: "100", step: "0.01", value: item.taxRatePercent, onChange: (e) => handleItemChange(idx, 'taxRatePercent', Number(e.target.value)), className: "w-16 border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-700" }) }), _jsx("td", { className: "px-3.5 py-2.5", children: _jsx("input", { type: "text", value: item.batchNumber || '', onChange: (e) => handleItemChange(idx, 'batchNumber', e.target.value), className: "w-28 border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-800" }) }), _jsxs("td", { className: "px-3.5 py-2.5 font-black text-slate-900", children: ["\u20B9", lineTotal.toFixed(2)] }), _jsx("td", { className: "px-3.5 py-2.5 text-right", children: _jsx("button", { type: "button", onClick: () => handleRemoveItem(idx), className: "text-rose-600 hover:text-rose-800 font-bold text-base px-1", children: "\u00D7" }) })] }, idx));
                                            }) })] }) }))] }), items.length > 0 && (_jsx("div", { className: "flex justify-end", children: _jsxs("div", { className: "clay-card rounded-2xl p-5 bg-[#F8FAFC] border border-slate-200/80 w-80 space-y-2 text-xs shadow-sm", children: [_jsxs("div", { className: "flex justify-between text-slate-600 font-medium", children: [_jsx("span", { children: "Subtotal:" }), _jsxs("span", { className: "font-bold text-slate-800", children: ["\u20B9", subtotal.toFixed(2)] })] }), _jsxs("div", { className: "flex justify-between text-slate-600 font-medium", children: [_jsx("span", { children: "Total GST / Tax:" }), _jsxs("span", { className: "font-bold text-slate-800", children: ["\u20B9", taxTotal.toFixed(2)] })] }), _jsxs("div", { className: "flex justify-between text-sm font-black text-slate-900 pt-2 border-t border-slate-200", children: [_jsx("span", { children: "Gross Purchase Total:" }), _jsxs("span", { className: "text-emerald-700 text-lg font-black", children: ["\u20B9", total.toFixed(2)] })] })] }) })), _jsx("div", { className: "flex justify-end pt-4 border-t border-slate-100", children: _jsx("button", { type: "submit", disabled: saving || items.length === 0, className: "clay-btn-brand bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-extrabold px-6 py-3 rounded-xl shadow-clay-button text-sm disabled:opacity-40 active:scale-95 transition-all", children: saving ? 'Processing Goods Receipt...' : 'Authorize Purchase & Receive Stock' }) })] })] }));
};
//# sourceMappingURL=PurchaseReceiving.js.map