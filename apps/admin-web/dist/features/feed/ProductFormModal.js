import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { feedApi } from '../../api/feedApi.js';
import { FeedProductUnit } from '@dfarm/shared-types';
export const ProductFormModal = ({ product, categories, onClose, onSuccess, }) => {
    const isEditing = Boolean(product);
    const [categoryId, setCategoryId] = useState(product?.categoryId || categories[0]?.id || '');
    const [code, setCode] = useState(product?.code || '');
    const [name, setName] = useState(product?.name || '');
    const [description, setDescription] = useState(product?.description || '');
    const [baseUnit, setBaseUnit] = useState(product?.baseUnit || FeedProductUnit.KG);
    const [packSize, setPackSize] = useState(product?.packSize || 50);
    const [packUnit, setPackUnit] = useState(product?.packUnit || 'BAG');
    const [defaultPurchasePrice, setDefaultPurchasePrice] = useState(product?.defaultPurchasePrice || 0);
    const [sellingPrice, setSellingPrice] = useState(product?.sellingPrice || 0);
    const [taxRatePercent, setTaxRatePercent] = useState(product?.taxRatePercent || 0);
    const [hsnCode, setHsnCode] = useState(product?.hsnCode || '');
    const [minimumStockLevel, setMinimumStockLevel] = useState(product?.minimumStockLevel || 10);
    const [status, setStatus] = useState(product?.status || 'ACTIVE');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            setError(null);
            const payload = {
                categoryId,
                code: code.trim().toUpperCase(),
                name: name.trim(),
                description: description.trim() || null,
                baseUnit,
                packSize: Number(packSize),
                packUnit: packUnit.trim(),
                defaultPurchasePrice: Number(defaultPurchasePrice),
                sellingPrice: Number(sellingPrice),
                taxRatePercent: Number(taxRatePercent),
                hsnCode: hsnCode.trim() || null,
                status,
                minimumStockLevel: Number(minimumStockLevel),
            };
            if (isEditing && product) {
                await feedApi.updateProduct(product.id, payload);
            }
            else {
                await feedApi.createProduct(payload);
            }
            onSuccess();
        }
        catch (err) {
            setError(err.message || 'Failed to save product');
        }
        finally {
            setSaving(false);
        }
    };
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4", children: _jsxs("div", { className: "bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col", children: [_jsxs("div", { className: "px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50", children: [_jsx("h3", { className: "text-lg font-bold text-gray-800", children: isEditing ? `Edit Product: ${product?.name}` : 'Register New Cattle Feed Product' }), _jsx("button", { onClick: onClose, className: "text-gray-400 hover:text-gray-600 font-bold text-xl", children: "\u00D7" })] }), _jsxs("form", { onSubmit: handleSubmit, className: "p-6 overflow-y-auto space-y-4", children: [error && (_jsx("div", { className: "bg-red-50 text-red-700 p-3 rounded text-sm border border-red-200", children: error })), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Product Code *" }), _jsx("input", { type: "text", disabled: isEditing, required: true, value: code, onChange: (e) => setCode(e.target.value), placeholder: "e.g. FEED-PELLET-50KG", className: "w-full border rounded px-3 py-2 text-sm uppercase font-mono disabled:bg-gray-100" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Category *" }), _jsx("select", { required: true, value: categoryId, onChange: (e) => setCategoryId(e.target.value), className: "w-full border rounded px-3 py-2 text-sm", children: categories.map((c) => (_jsx("option", { value: c.id, children: c.name }, c.id))) })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Product Name *" }), _jsx("input", { type: "text", required: true, value: name, onChange: (e) => setName(e.target.value), placeholder: "e.g. Cattle Feed Pellet Super 20%", className: "w-full border rounded px-3 py-2 text-sm" })] }), _jsxs("div", { className: "grid grid-cols-3 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Base Unit *" }), _jsxs("select", { value: baseUnit, onChange: (e) => setBaseUnit(e.target.value), className: "w-full border rounded px-3 py-2 text-sm", children: [_jsx("option", { value: "KG", children: "KG (Kilograms)" }), _jsx("option", { value: "BAG", children: "BAG" }), _jsx("option", { value: "PIECE", children: "PIECE" }), _jsx("option", { value: "LITRE", children: "LITRE (Liquid)" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Pack Unit Name" }), _jsx("input", { type: "text", value: packUnit, onChange: (e) => setPackUnit(e.target.value), placeholder: "BAG / SACK / BOTTLE", className: "w-full border rounded px-3 py-2 text-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Pack Size (in Base Units)" }), _jsx("input", { type: "number", step: "0.001", min: "0.001", required: true, value: packSize, onChange: (e) => setPackSize(Number(e.target.value)), className: "w-full border rounded px-3 py-2 text-sm" })] })] }), _jsxs("div", { className: "grid grid-cols-3 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Selling Price (\u20B9) *" }), _jsx("input", { type: "number", step: "0.01", min: "0", required: true, value: sellingPrice, onChange: (e) => setSellingPrice(Number(e.target.value)), className: "w-full border rounded px-3 py-2 text-sm font-semibold text-emerald-700" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Default Purchase Cost (\u20B9)" }), _jsx("input", { type: "number", step: "0.01", min: "0", value: defaultPurchasePrice, onChange: (e) => setDefaultPurchasePrice(Number(e.target.value)), className: "w-full border rounded px-3 py-2 text-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "GST Rate (%)" }), _jsx("input", { type: "number", step: "0.01", min: "0", max: "100", value: taxRatePercent, onChange: (e) => setTaxRatePercent(Number(e.target.value)), className: "w-full border rounded px-3 py-2 text-sm" })] })] }), _jsxs("div", { className: "grid grid-cols-3 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "HSN / SAC Code" }), _jsx("input", { type: "text", value: hsnCode, onChange: (e) => setHsnCode(e.target.value), placeholder: "e.g. 2309", className: "w-full border rounded px-3 py-2 text-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Min Stock Alert Level" }), _jsx("input", { type: "number", min: "0", value: minimumStockLevel, onChange: (e) => setMinimumStockLevel(Number(e.target.value)), className: "w-full border rounded px-3 py-2 text-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Status" }), _jsxs("select", { value: status, onChange: (e) => setStatus(e.target.value), className: "w-full border rounded px-3 py-2 text-sm", children: [_jsx("option", { value: "ACTIVE", children: "ACTIVE" }), _jsx("option", { value: "INACTIVE", children: "INACTIVE" }), _jsx("option", { value: "DISCONTINUED", children: "DISCONTINUED" })] })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Description" }), _jsx("textarea", { rows: 2, value: description, onChange: (e) => setDescription(e.target.value), placeholder: "Nutritional composition, protein %, minerals...", className: "w-full border rounded px-3 py-2 text-sm" })] }), _jsxs("div", { className: "flex justify-end gap-3 pt-4 border-t border-gray-200", children: [_jsx("button", { type: "button", onClick: onClose, className: "px-4 py-2 border rounded text-sm text-gray-700 hover:bg-gray-100", children: "Cancel" }), _jsx("button", { type: "submit", disabled: saving, className: "px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-semibold disabled:opacity-50", children: saving ? 'Saving...' : isEditing ? 'Update Product' : 'Create Product' })] })] })] }) }));
};
//# sourceMappingURL=ProductFormModal.js.map