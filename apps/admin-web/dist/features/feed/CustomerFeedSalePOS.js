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
    return (_jsxs("div", { className: "feed-sale-pos p-6 bg-white rounded-lg shadow", children: [_jsxs("div", { className: "mb-6", children: [_jsx("h2", { className: "text-2xl font-bold text-gray-800", children: "Cattle Feed Counter POS & Customer Sales" }), _jsx("p", { className: "text-sm text-gray-500", children: "Atomic inventory deduction, customer subledger credit debit, and instant receipt generation" })] }), error && (_jsx("div", { className: "bg-red-50 text-red-700 p-4 rounded-md mb-6 text-sm border border-red-200", children: error })), _jsxs("div", { className: "bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6", children: [_jsx("div", { className: "text-xs font-bold uppercase text-gray-600 mb-2", children: "Customer Identification" }), _jsxs("div", { className: "flex gap-3", children: [_jsx("input", { type: "text", placeholder: "Enter Farmer Code (e.g. FAR-1001) or Mobile Number...", value: customerQuery, onChange: (e) => setCustomerQuery(e.target.value), onKeyDown: (e) => e.key === 'Enter' && handleCustomerSearch(), className: "flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" }), _jsx("button", { onClick: handleCustomerSearch, disabled: customerSearchLoading, className: "bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-5 py-2 rounded text-sm disabled:opacity-50", children: customerSearchLoading ? 'Searching...' : 'Search Farmer' })] }), selectedCustomer && (_jsxs("div", { className: "mt-4 p-3 bg-white border border-emerald-200 rounded flex justify-between items-center", children: [_jsxs("div", { children: [_jsx("div", { className: "font-bold text-gray-900 text-base", children: selectedCustomer.fullName }), _jsxs("div", { className: "text-xs text-gray-500", children: ["Farmer Code: ", _jsx("span", { className: "font-mono font-bold text-gray-700", children: selectedCustomer.farmerCode }), " | Phone: ", selectedCustomer.mobileNumber] })] }), _jsxs("div", { className: "text-right", children: [_jsx("span", { className: "inline-block px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800", children: "ACTIVE CUSTOMER" }), _jsx("button", { onClick: () => setSelectedCustomer(null), className: "block text-xs text-red-600 hover:underline mt-1 ml-auto", children: "Change Farmer" })] })] }))] }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-12 gap-6", children: [_jsxs("div", { className: "lg:col-span-7", children: [_jsx("div", { className: "text-sm font-bold text-gray-700 uppercase mb-3", children: "Select Products to Add" }), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[550px] overflow-y-auto pr-1", children: products.map((p) => {
                                    const available = getAvailableStock(p.id, p.packUnit);
                                    const isOutOfStock = available <= 0;
                                    return (_jsxs("div", { className: `border rounded-lg p-3 flex flex-col justify-between transition ${isOutOfStock
                                            ? 'bg-gray-50 opacity-60 border-gray-200'
                                            : 'bg-white hover:border-emerald-500 hover:shadow-sm'}`, children: [_jsxs("div", { children: [_jsxs("div", { className: "flex justify-between items-start", children: [_jsx("span", { className: "font-mono text-xs font-semibold text-gray-500", children: p.code }), _jsxs("span", { className: `text-xs font-bold ${isOutOfStock ? 'text-red-600' : 'text-emerald-700'}`, children: [available, " ", p.packUnit, " left"] })] }), _jsx("div", { className: "font-bold text-gray-900 text-sm mt-1", children: p.name }), _jsxs("div", { className: "text-xs text-gray-500 mt-0.5", children: ["1 ", p.packUnit, " = ", p.packSize, " ", p.baseUnit] })] }), _jsxs("div", { className: "flex justify-between items-center mt-3 pt-2 border-t border-gray-100", children: [_jsxs("span", { className: "font-bold text-emerald-700 text-base", children: ["\u20B9", Number(p.sellingPrice).toFixed(2)] }), _jsx("button", { onClick: () => handleAddToCart(p), disabled: isOutOfStock, className: "bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded disabled:bg-gray-300", children: "+ Add" })] })] }, p.id));
                                }) })] }), _jsxs("div", { className: "lg:col-span-5 bg-gray-50 border border-gray-200 rounded-lg p-4 flex flex-col justify-between", children: [_jsxs("div", { children: [_jsxs("div", { className: "text-sm font-bold text-gray-800 uppercase border-b pb-2 mb-3", children: ["Sale Invoice Items (", cart.length, ")"] }), cart.length === 0 ? (_jsx("div", { className: "text-center py-12 text-gray-400 text-xs", children: "No items in invoice cart yet." })) : (_jsx("div", { className: "space-y-2 max-h-[280px] overflow-y-auto pr-1 mb-4", children: cart.map((item) => (_jsxs("div", { className: "bg-white border rounded p-2.5 text-xs flex justify-between items-center", children: [_jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "font-bold text-gray-900", children: item.productName }), _jsxs("div", { className: "text-gray-500", children: ["\u20B9", item.unitPrice.toFixed(2), " / ", item.unit] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: () => handleUpdateQuantity(item.productId, item.quantity - 1), className: "w-6 h-6 bg-gray-100 hover:bg-gray-200 rounded font-bold text-center", children: "-" }), _jsx("span", { className: "font-bold text-sm w-6 text-center", children: item.quantity }), _jsx("button", { onClick: () => handleUpdateQuantity(item.productId, item.quantity + 1), className: "w-6 h-6 bg-gray-100 hover:bg-gray-200 rounded font-bold text-center", children: "+" }), _jsxs("div", { className: "font-bold text-gray-900 w-16 text-right", children: ["\u20B9", item.itemTotal.toFixed(2)] }), _jsx("button", { onClick: () => handleRemoveFromCart(item.productId), className: "text-red-500 hover:text-red-700 ml-1 font-bold", children: "\u00D7" })] })] }, item.productId))) }))] }), _jsxs("div", { className: "border-t border-gray-200 pt-3 space-y-2 text-xs", children: [_jsxs("div", { className: "flex justify-between text-gray-600", children: [_jsx("span", { children: "Subtotal:" }), _jsxs("span", { className: "font-semibold", children: ["\u20B9", subtotal.toFixed(2)] })] }), _jsxs("div", { className: "flex justify-between text-gray-600", children: [_jsx("span", { children: "Applicable GST:" }), _jsxs("span", { className: "font-semibold", children: ["\u20B9", taxTotal.toFixed(2)] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-2 pt-1", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-semibold text-gray-500 uppercase", children: "Discount (\u20B9)" }), _jsx("input", { type: "number", min: "0", step: "0.01", value: discountAmount, onChange: (e) => setDiscountAmount(Number(e.target.value)), className: "w-full border rounded px-2 py-1 text-xs" })] }), discountAmount > 0 && (_jsxs("div", { children: [_jsx("label", { className: "block text-[10px] font-semibold text-red-600 uppercase", children: "Approval Actor UUID *" }), _jsx("input", { type: "text", required: true, placeholder: "Manager UUID", value: discountApprovedBy, onChange: (e) => setDiscountApprovedBy(e.target.value), className: "w-full border rounded px-2 py-1 text-xs font-mono" })] }))] }), _jsxs("div", { className: "flex justify-between items-center text-sm font-bold text-gray-900 pt-2 border-t", children: [_jsx("span", { children: "Total Invoice Payable:" }), _jsxs("span", { className: "text-lg text-emerald-700 font-extrabold", children: ["\u20B9", grandTotal.toFixed(2)] })] }), _jsxs("div", { className: "pt-2", children: [_jsx("label", { className: "block text-[10px] font-semibold text-gray-500 uppercase mb-1", children: "Payment Method" }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx("button", { type: "button", onClick: () => setPaymentMode('CREDIT'), className: `py-1.5 rounded text-xs font-bold border transition ${paymentMode === 'CREDIT'
                                                            ? 'bg-indigo-600 text-white border-indigo-600'
                                                            : 'bg-white text-gray-700 border-gray-300'}`, children: "CREDIT (Ledger Debit)" }), _jsx("button", { type: "button", onClick: () => setPaymentMode('CASH'), className: `py-1.5 rounded text-xs font-bold border transition ${paymentMode === 'CASH'
                                                            ? 'bg-emerald-600 text-white border-emerald-600'
                                                            : 'bg-white text-gray-700 border-gray-300'}`, children: "CASH RECEIPT" })] })] }), _jsx("button", { onClick: handleCheckout, disabled: submitting || cart.length === 0 || !selectedCustomer, className: "w-full mt-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded shadow disabled:opacity-50", children: submitting ? 'Posting Sale & Debiting Ledger...' : 'Confirm Sale & Print Slip' })] })] })] }), completedSale && (_jsx(InvoicePreviewModal, { sale: completedSale, onClose: () => setCompletedSale(null) }))] }));
};
//# sourceMappingURL=CustomerFeedSalePOS.js.map