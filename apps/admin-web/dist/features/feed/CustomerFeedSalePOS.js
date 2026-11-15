import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { feedApi } from '../../api/feedApi.js';
import { customerApi } from '../../api/customerApi.js';
import { useAuth } from '../../context/AuthContext.js';
import { InvoicePreviewModal } from './InvoicePreviewModal.js';
export const CustomerFeedSalePOS = () => {
    const { currentCenterId, selectedCenterId, centers } = useAuth();
    const [customerQuery, setCustomerQuery] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
    const [products, setProducts] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [cart, setCart] = useState([]);
    const [paymentMode, setPaymentMode] = useState('CREDIT');
    const [discountAmount, setDiscountAmount] = useState(0);
    const [discountApprovedBy, setDiscountApprovedBy] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [completedSale, setCompletedSale] = useState(null);
    useEffect(() => {
        async function loadCatalog() {
            try {
                const [prods, inv] = await Promise.all([
                    feedApi.getProducts({ status: 'ACTIVE' }),
                    feedApi.getInventory(),
                ]);
                setProducts(prods);
                setInventory(inv);
            }
            catch (err) {
                setError(err.message || 'Failed to load feed inventory catalog');
            }
        }
        loadCatalog();
    }, []);
    const handleCustomerSearch = async () => {
        if (!customerQuery.trim())
            return;
        try {
            setCustomerSearchLoading(true);
            setError(null);
            const res = await customerApi.list({ search: customerQuery.trim() });
            const items = res.items || res.customers || [];
            if (items.length > 0) {
                setSelectedCustomer(items[0]);
            }
            else {
                setError('No active customer found with given code/phone');
                setSelectedCustomer(null);
            }
        }
        catch (err) {
            setError(err.message || 'Customer lookup failed');
        }
        finally {
            setCustomerSearchLoading(false);
        }
    };
    const getAvailableStock = (productId, unit) => {
        const inv = inventory.find((i) => i.productId === productId);
        if (!inv)
            return 0;
        const prod = products.find((p) => p.id === productId);
        if (!prod)
            return 0;
        const baseStock = Number(inv.currentStock);
        if (unit === prod.baseUnit) {
            return baseStock;
        }
        else if (unit === prod.packUnit) {
            return Math.floor(baseStock / Number(prod.packSize));
        }
        return 0;
    };
    const handleAddToCart = (product) => {
        const existing = cart.find((i) => i.productId === product.id);
        const available = getAvailableStock(product.id, product.packUnit);
        if (existing) {
            if (existing.quantity + 1 > available) {
                setError(`Cannot exceed available stock of ${available} ${product.packUnit} for ${product.name}`);
                return;
            }
            setCart(cart.map((i) => i.productId === product.id
                ? {
                    ...i,
                    quantity: i.quantity + 1,
                    itemTotal: Math.round((i.quantity + 1) * i.unitPrice * (1 + i.taxRatePercent / 100) * 100) / 100,
                }
                : i));
        }
        else {
            if (available < 1) {
                setError(`Insufficient stock for ${product.name}. Available: 0`);
                return;
            }
            const itemTotal = Math.round(1 * Number(product.sellingPrice) * (1 + product.taxRatePercent / 100) * 100) / 100;
            setCart([
                ...cart,
                {
                    productId: product.id,
                    productCode: product.code,
                    productName: product.name,
                    unit: product.packUnit,
                    baseUnit: product.baseUnit,
                    packSize: product.packSize,
                    availableStock: available,
                    quantity: 1,
                    unitPrice: Number(product.sellingPrice),
                    taxRatePercent: Number(product.taxRatePercent),
                    discountAmount: 0,
                    itemTotal,
                },
            ]);
        }
    };
    const handleUpdateQuantity = (productId, qty) => {
        if (qty <= 0) {
            setCart(cart.filter((i) => i.productId !== productId));
            return;
        }
        const item = cart.find((i) => i.productId === productId);
        if (!item)
            return;
        if (qty > item.availableStock) {
            setError(`Cannot exceed available stock of ${item.availableStock} ${item.unit} for ${item.productName}`);
            return;
        }
        setCart(cart.map((i) => i.productId === productId
            ? {
                ...i,
                quantity: qty,
                itemTotal: Math.round(qty * i.unitPrice * (1 + i.taxRatePercent / 100) * 100) / 100,
            }
            : i));
    };
    const handleRemoveFromCart = (productId) => {
        setCart(cart.filter((i) => i.productId !== productId));
    };
    // Calculations
    const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const taxTotal = cart.reduce((sum, item) => sum + Math.round(item.quantity * item.unitPrice * (item.taxRatePercent / 100) * 100) / 100, 0);
    const grandTotal = Math.max(0, Math.round((subtotal + taxTotal - Number(discountAmount || 0)) * 100) / 100);
    const handleCheckout = async () => {
        if (!selectedCustomer) {
            setError('Please search and select a customer first');
            return;
        }
        if (cart.length === 0) {
            setError('Cart is empty. Add at least one feed product');
            return;
        }
        if (discountAmount > 0 && !discountApprovedBy) {
            setError('Discount requires approval actor UUID');
            return;
        }
        const targetCenterId = selectedCustomer.primaryCenterId || selectedCustomer.primary_center_id || currentCenterId || selectedCenterId || (centers.length > 0 ? centers[0]?.id : '');
        if (!targetCenterId) {
            setError('Target center ID could not be identified for this sale');
            return;
        }
        try {
            setSubmitting(true);
            setError(null);
            const idempotencyKey = `sale_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            const payload = {
                centerId: targetCenterId,
                customerId: selectedCustomer.id,
                items: cart.map((i) => ({
                    productId: i.productId,
                    quantity: i.quantity,
                    unit: i.unit,
                    discountAmount: i.discountAmount || 0,
                })),
                paymentMode,
                discountAmount: Number(discountAmount || 0),
                discountApprovedBy: discountApprovedBy || null,
                idempotencyKey,
            };
            const result = await feedApi.createSale(payload);
            setCompletedSale(result);
            // Reset cart and refresh stock
            setCart([]);
            setDiscountAmount(0);
            setDiscountApprovedBy('');
            const updatedInv = await feedApi.getInventory();
            setInventory(updatedInv);
        }
        catch (err) {
            setError(err.message || 'Sale checkout failed');
        }
        finally {
            setSubmitting(false);
        }
    };
    return (_jsxs("div", { className: "feed-sale-pos clay-card rounded-3xl p-6 sm:p-8 bg-white shadow-clay-card border border-white/80 space-y-6", children: [_jsxs("div", { className: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-black text-slate-800 tracking-tight", children: "Cattle Feed Counter POS & Customer Sales" }), _jsx("p", { className: "text-sm text-slate-500 font-medium", children: "Atomic inventory deduction, customer subledger credit debit, and instant receipt generation" })] }), _jsxs("div", { className: "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200/60 shadow-sm", children: [_jsx("span", { children: "\u26A1" }), " Real-time Subledger Sync"] })] }), error && (_jsxs("div", { className: "p-4 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-700 text-sm font-semibold flex items-center gap-2 shadow-sm", children: [_jsx("span", { children: "\u26A0\uFE0F" }), _jsx("span", { children: error })] })), _jsxs("div", { className: "clay-inset p-5 rounded-2xl bg-[#EEF2F6] border border-[#CBD5E1]/50 space-y-3", children: [_jsxs("div", { className: "text-xs font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1.5", children: [_jsx("span", { children: "\uD83D\uDD0D" }), " Customer Identification"] }), _jsxs("div", { className: "flex flex-col sm:flex-row gap-3", children: [_jsx("input", { type: "text", placeholder: "Enter Farmer Code (e.g. FAR-1001) or Mobile Number...", value: customerQuery, onChange: (e) => setCustomerQuery(e.target.value), onKeyDown: (e) => e.key === 'Enter' && handleCustomerSearch(), className: "flex-1 clay-inset bg-white border border-[#CBD5E1] rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" }), _jsx("button", { onClick: handleCustomerSearch, disabled: customerSearchLoading, className: "clay-btn-brand bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold px-6 py-2.5 rounded-xl text-sm shadow-clay-button active:scale-95 disabled:opacity-50 transition-all", children: customerSearchLoading ? 'Searching...' : 'Search Farmer' })] }), selectedCustomer && (_jsxs("div", { className: "clay-card p-4 rounded-xl bg-white border border-emerald-200/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-sm", children: [_jsxs("div", { children: [_jsx("div", { className: "font-extrabold text-slate-900 text-base", children: selectedCustomer.fullName }), _jsxs("div", { className: "text-xs text-slate-500 font-medium", children: ["Farmer Code: ", _jsx("span", { className: "font-mono font-bold text-emerald-700", children: selectedCustomer.farmerCode }), " | Phone: ", selectedCustomer.mobileNumber] })] }), _jsxs("div", { className: "flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-2", children: [_jsx("span", { className: "inline-block px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200", children: "ACTIVE CUSTOMER" }), _jsx("button", { onClick: () => setSelectedCustomer(null), className: "text-xs text-rose-600 hover:text-rose-800 font-bold hover:underline", children: "Change Farmer" })] })] }))] }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-12 gap-6", children: [_jsxs("div", { className: "lg:col-span-7 space-y-3", children: [_jsxs("div", { className: "text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center justify-between", children: [_jsx("span", { children: "Select Products to Add" }), _jsxs("span", { className: "text-slate-400 font-semibold", children: [products.length, " Products"] })] }), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[550px] overflow-y-auto pr-1 scrollbar-thin", children: products.map((p) => {
                                    const available = getAvailableStock(p.id, p.packUnit);
                                    const isOutOfStock = available <= 0;
                                    return (_jsxs("div", { className: `clay-card rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 border ${isOutOfStock
                                            ? 'bg-slate-50/70 opacity-60 border-slate-200'
                                            : 'bg-white border-white/80 hover:border-emerald-300 hover:shadow-clay-card hover:scale-[1.01]'}`, children: [_jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex justify-between items-start", children: [_jsx("span", { className: "font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md", children: p.code }), _jsxs("span", { className: `text-xs font-extrabold px-2 py-0.5 rounded-full ${isOutOfStock ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'}`, children: [available, " ", p.packUnit, " left"] })] }), _jsx("div", { className: "font-extrabold text-slate-900 text-sm leading-snug", children: p.name }), _jsxs("div", { className: "text-xs text-slate-500 font-medium", children: ["1 ", p.packUnit, " = ", p.packSize, " ", p.baseUnit] })] }), _jsxs("div", { className: "flex justify-between items-center mt-4 pt-3 border-t border-slate-100", children: [_jsxs("span", { className: "font-black text-emerald-700 text-lg", children: ["\u20B9", Number(p.sellingPrice).toFixed(2)] }), _jsx("button", { onClick: () => handleAddToCart(p), disabled: isOutOfStock, className: "clay-btn-brand bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-sm active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none transition-all", children: "+ Add" })] })] }, p.id));
                                }) })] }), _jsxs("div", { className: "lg:col-span-5 clay-card rounded-2xl bg-gradient-to-b from-[#F8FAFC] to-[#EEF2F6] border border-white/80 p-5 flex flex-col justify-between shadow-clay-card", children: [_jsxs("div", { children: [_jsxs("div", { className: "text-xs font-extrabold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-2.5 mb-3 flex justify-between items-center", children: [_jsxs("span", { children: ["Sale Invoice Items (", cart.length, ")"] }), cart.length > 0 && (_jsx("button", { onClick: () => setCart([]), className: "text-[11px] font-bold text-rose-600 hover:underline", children: "Clear Cart" }))] }), cart.length === 0 ? (_jsxs("div", { className: "text-center py-12 text-slate-400 text-xs font-medium space-y-2", children: [_jsx("span", { className: "text-3xl block", children: "\uD83D\uDED2" }), _jsx("span", { children: "No items in invoice cart yet." })] })) : (_jsx("div", { className: "space-y-2.5 max-h-[280px] overflow-y-auto pr-1 mb-4 scrollbar-thin", children: cart.map((item) => (_jsxs("div", { className: "clay-card bg-white rounded-xl p-3 border border-slate-100 text-xs flex justify-between items-center shadow-sm", children: [_jsxs("div", { className: "flex-1 pr-2", children: [_jsx("div", { className: "font-bold text-slate-900 leading-snug", children: item.productName }), _jsxs("div", { className: "text-slate-500 font-medium", children: ["\u20B9", item.unitPrice.toFixed(2), " / ", item.unit] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: () => handleUpdateQuantity(item.productId, item.quantity - 1), className: "w-7 h-7 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700 text-center active:scale-90 transition-transform", children: "-" }), _jsx("span", { className: "font-black text-sm w-6 text-center text-slate-800", children: item.quantity }), _jsx("button", { onClick: () => handleUpdateQuantity(item.productId, item.quantity + 1), className: "w-7 h-7 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700 text-center active:scale-90 transition-transform", children: "+" }), _jsxs("div", { className: "font-extrabold text-slate-900 w-16 text-right", children: ["\u20B9", item.itemTotal.toFixed(2)] }), _jsx("button", { onClick: () => handleRemoveFromCart(item.productId), className: "text-rose-500 hover:text-rose-700 ml-1 font-bold text-base px-1 leading-none", children: "\u00D7" })] })] }, item.productId))) }))] }), _jsxs("div", { className: "border-t border-slate-200/80 pt-3.5 space-y-2.5 text-xs", children: [_jsxs("div", { className: "flex justify-between text-slate-600 font-medium", children: [_jsx("span", { children: "Subtotal:" }), _jsxs("span", { className: "font-bold text-slate-800", children: ["\u20B9", subtotal.toFixed(2)] })] }), _jsxs("div", { className: "flex justify-between text-slate-600 font-medium", children: [_jsx("span", { children: "Applicable GST:" }), _jsxs("span", { className: "font-bold text-slate-800", children: ["\u20B9", taxTotal.toFixed(2)] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-2 pt-1", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-extrabold text-slate-600 uppercase", children: "Discount (\u20B9)" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: discountAmount, onChange: (e) => setDiscountAmount(Number(e.target.value)), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500" })] }), discountAmount > 0 && (_jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-extrabold text-rose-600 uppercase", children: "Approval Actor UUID *" }), _jsx("input", { type: "text", required: true, placeholder: "Manager UUID", value: discountApprovedBy, onChange: (e) => setDiscountApprovedBy(e.target.value), className: "w-full clay-inset bg-white border border-rose-300 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500" })] }))] }), _jsxs("div", { className: "flex justify-between items-center text-sm font-black text-slate-900 pt-2 border-t border-slate-200", children: [_jsx("span", { children: "Total Invoice Payable:" }), _jsxs("span", { className: "text-xl text-emerald-700 font-black", children: ["\u20B9", grandTotal.toFixed(2)] })] }), _jsxs("div", { className: "pt-2", children: [_jsx("label", { className: "block text-[10px] font-extrabold text-slate-600 uppercase mb-1.5", children: "Payment Method" }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx("button", { type: "button", onClick: () => setPaymentMode('CREDIT'), className: `py-2 px-3 rounded-xl text-xs font-extrabold transition-all duration-200 ${paymentMode === 'CREDIT'
                                                            ? 'bg-indigo-600 text-white shadow-clay-button scale-[1.02]'
                                                            : 'clay-card bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'}`, children: "CREDIT (Ledger Debit)" }), _jsx("button", { type: "button", onClick: () => setPaymentMode('CASH'), className: `py-2 px-3 rounded-xl text-xs font-extrabold transition-all duration-200 ${paymentMode === 'CASH'
                                                            ? 'bg-emerald-600 text-white shadow-clay-button scale-[1.02]'
                                                            : 'clay-card bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'}`, children: "CASH RECEIPT" })] })] }), _jsx("button", { onClick: handleCheckout, disabled: submitting || cart.length === 0 || !selectedCustomer, className: "w-full mt-3 py-3 clay-btn-brand bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-extrabold text-sm rounded-xl shadow-clay-button disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95", children: submitting ? 'Posting Sale & Debiting Ledger...' : 'Confirm Sale & Print Slip' })] })] })] }), completedSale && (_jsx(InvoicePreviewModal, { sale: completedSale, onClose: () => setCompletedSale(null) }))] }));
};
//# sourceMappingURL=CustomerFeedSalePOS.js.map