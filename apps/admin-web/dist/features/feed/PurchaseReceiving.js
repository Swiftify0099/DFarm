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
        return _jsx("div", { className: "p-6 text-gray-600", children: "Loading procurement & supplier records..." });
    }
    return (_jsxs("div", { className: "purchase-receiving p-6 bg-white rounded-lg shadow", children: [_jsxs("div", { className: "mb-6", children: [_jsx("h2", { className: "text-2xl font-bold text-gray-800", children: "Feed Procurement & Stock Receiving" }), _jsx("p", { className: "text-sm text-gray-500", children: "Record supplier invoices, verify batch numbers, and authorize immediate stock increment into warehouse ledger" })] }), error && (_jsx("div", { className: "bg-red-50 text-red-700 p-4 rounded-md mb-4 text-sm border border-red-200", children: error })), successMsg && (_jsx("div", { className: "bg-emerald-50 text-emerald-800 p-4 rounded-md mb-4 text-sm border border-emerald-200 font-semibold", children: successMsg })), _jsxs("form", { onSubmit: handleSaveAndReceive, className: "space-y-6", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Target Center *" }), _jsx("select", { required: true, value: centerId || selectedCenterId || currentCenterId || '', onChange: (e) => setCenterId(e.target.value), className: "w-full border rounded px-3 py-2 text-sm bg-white", children: centers.map((c) => (_jsxs("option", { value: c.id, children: [c.name, " (", c.code, ")"] }, c.id))) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Select Supplier *" }), _jsx("select", { required: true, value: selectedSupplierId, onChange: (e) => setSelectedSupplierId(e.target.value), className: "w-full border rounded px-3 py-2 text-sm", children: suppliers.map((s) => (_jsxs("option", { value: s.id, children: [s.name, " (", s.supplierCode, ")"] }, s.id))) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Supplier Invoice Number *" }), _jsx("input", { type: "text", required: true, placeholder: "e.g. INV-AGRO-2026-901", value: invoiceNumber, onChange: (e) => setInvoiceNumber(e.target.value), className: "w-full border rounded px-3 py-2 text-sm font-mono" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Purchase Date *" }), _jsx("input", { type: "date", required: true, value: purchaseDate, onChange: (e) => setPurchaseDate(e.target.value), className: "w-full border rounded px-3 py-2 text-sm" })] })] }), _jsxs("div", { children: [_jsxs("div", { className: "flex justify-between items-center mb-3", children: [_jsx("h3", { className: "font-bold text-gray-800 text-sm uppercase", children: "Invoice Line Items" }), _jsx("button", { type: "button", onClick: handleAddItem, className: "text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-3 py-1.5 rounded border border-indigo-200", children: "+ Add Item Line" })] }), items.length === 0 ? (_jsx("div", { className: "text-center py-8 bg-gray-50 rounded border border-dashed border-gray-300 text-gray-500 text-xs", children: "No product items added yet. Click \"+ Add Item Line\" above." })) : (_jsx("div", { className: "overflow-x-auto border rounded-lg", children: _jsxs("table", { className: "min-w-full divide-y divide-gray-200 text-xs text-left", children: [_jsx("thead", { className: "bg-gray-50 font-bold text-gray-600 uppercase", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-2", children: "Feed Product" }), _jsx("th", { className: "px-3 py-2", children: "Quantity" }), _jsx("th", { className: "px-3 py-2", children: "Unit" }), _jsx("th", { className: "px-3 py-2", children: "Unit Cost (\u20B9)" }), _jsx("th", { className: "px-3 py-2", children: "GST Rate (%)" }), _jsx("th", { className: "px-3 py-2", children: "Batch Reference" }), _jsx("th", { className: "px-3 py-2", children: "Line Total" }), _jsx("th", { className: "px-3 py-2 text-right", children: "Action" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-200 bg-white", children: items.map((item, idx) => {
                                                const lineTotal = item.quantity * item.unitCost * (1 + item.taxRatePercent / 100);
                                                return (_jsxs("tr", { children: [_jsx("td", { className: "px-3 py-2", children: _jsx("select", { value: item.productId, onChange: (e) => handleItemChange(idx, 'productId', e.target.value), className: "border rounded px-2 py-1 text-xs w-full max-w-[200px]", children: products.map((p) => (_jsx("option", { value: p.id, children: p.name }, p.id))) }) }), _jsx("td", { className: "px-3 py-2", children: _jsx("input", { type: "number", min: "0.001", step: "any", value: item.quantity, onChange: (e) => handleItemChange(idx, 'quantity', Number(e.target.value)), className: "w-20 border rounded px-2 py-1 text-xs font-bold" }) }), _jsx("td", { className: "px-3 py-2", children: _jsx("input", { type: "text", value: item.unit, onChange: (e) => handleItemChange(idx, 'unit', e.target.value), className: "w-16 border rounded px-2 py-1 text-xs uppercase" }) }), _jsx("td", { className: "px-3 py-2", children: _jsx("input", { type: "number", min: "0", step: "0.01", value: item.unitCost, onChange: (e) => handleItemChange(idx, 'unitCost', Number(e.target.value)), className: "w-24 border rounded px-2 py-1 text-xs font-semibold" }) }), _jsx("td", { className: "px-3 py-2", children: _jsx("input", { type: "number", min: "0", max: "100", step: "0.01", value: item.taxRatePercent, onChange: (e) => handleItemChange(idx, 'taxRatePercent', Number(e.target.value)), className: "w-16 border rounded px-2 py-1 text-xs" }) }), _jsx("td", { className: "px-3 py-2", children: _jsx("input", { type: "text", value: item.batchNumber || '', onChange: (e) => handleItemChange(idx, 'batchNumber', e.target.value), className: "w-28 border rounded px-2 py-1 text-xs font-mono" }) }), _jsxs("td", { className: "px-3 py-2 font-bold text-gray-900", children: ["\u20B9", lineTotal.toFixed(2)] }), _jsx("td", { className: "px-3 py-2 text-right", children: _jsx("button", { type: "button", onClick: () => handleRemoveItem(idx), className: "text-red-600 hover:text-red-800 font-bold", children: "\u00D7" }) })] }, idx));
                                            }) })] }) }))] }), items.length > 0 && (_jsx("div", { className: "flex justify-end", children: _jsxs("div", { className: "bg-gray-50 border rounded-lg p-4 w-72 space-y-1.5 text-xs", children: [_jsxs("div", { className: "flex justify-between text-gray-600", children: [_jsx("span", { children: "Subtotal:" }), _jsxs("span", { className: "font-semibold", children: ["\u20B9", subtotal.toFixed(2)] })] }), _jsxs("div", { className: "flex justify-between text-gray-600", children: [_jsx("span", { children: "Total GST / Tax:" }), _jsxs("span", { className: "font-semibold", children: ["\u20B9", taxTotal.toFixed(2)] })] }), _jsxs("div", { className: "flex justify-between text-sm font-bold text-gray-900 pt-2 border-t", children: [_jsx("span", { children: "Gross Purchase Total:" }), _jsxs("span", { className: "text-emerald-700 font-extrabold", children: ["\u20B9", total.toFixed(2)] })] })] }) })), _jsx("div", { className: "flex justify-end pt-4 border-t", children: _jsx("button", { type: "submit", disabled: saving || items.length === 0, className: "bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded shadow text-sm disabled:opacity-50", children: saving ? 'Processing Goods Receipt...' : 'Authorize Purchase & Receive Stock' }) })] })] }));
};
//# sourceMappingURL=PurchaseReceiving.js.map