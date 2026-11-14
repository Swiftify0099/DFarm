import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { ProductList } from './ProductList.js';
import { StockSummary } from './StockSummary.js';
import { CustomerFeedSalePOS } from './CustomerFeedSalePOS.js';
import { PurchaseReceiving } from './PurchaseReceiving.js';
import { SupplierList } from './SupplierList.js';
import { CustomerReturnModal } from './CustomerReturnModal.js';
import { StockAdjustmentModal } from './StockAdjustmentModal.js';
import { InventoryHistory } from './InventoryHistory.js';
export const FeedManagementModule = () => {
    const [activeTab, setActiveTab] = useState('pos');
    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
    const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
    const [selectedProductId, setSelectedProductId] = useState(undefined);
    return (_jsxs("div", { className: "feed-management-module max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6", children: [_jsxs("div", { className: "flex border-b border-gray-200 overflow-x-auto space-x-2 pb-1 text-sm font-semibold", children: [_jsx("button", { onClick: () => setActiveTab('pos'), className: `px-4 py-2 rounded-t-lg transition whitespace-nowrap ${activeTab === 'pos'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: "\uD83D\uDED2 Feed POS Counter" }), _jsx("button", { onClick: () => setActiveTab('stock'), className: `px-4 py-2 rounded-t-lg transition whitespace-nowrap ${activeTab === 'stock'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: "\uD83D\uDCE6 Stock & Valuation" }), _jsx("button", { onClick: () => setActiveTab('products'), className: `px-4 py-2 rounded-t-lg transition whitespace-nowrap ${activeTab === 'products'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: "\uD83C\uDFF7\uFE0F Product Catalog" }), _jsx("button", { onClick: () => setActiveTab('purchases'), className: `px-4 py-2 rounded-t-lg transition whitespace-nowrap ${activeTab === 'purchases'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: "\uD83D\uDCE5 Procurement & Receiving" }), _jsx("button", { onClick: () => setActiveTab('suppliers'), className: `px-4 py-2 rounded-t-lg transition whitespace-nowrap ${activeTab === 'suppliers'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: "\uD83C\uDFED Suppliers" }), _jsx("button", { onClick: () => setActiveTab('history'), className: `px-4 py-2 rounded-t-lg transition whitespace-nowrap ${activeTab === 'history'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: "\uD83D\uDCDC Movement Ledger" }), _jsx("button", { onClick: () => setIsReturnModalOpen(true), className: "px-4 py-2 text-rose-700 hover:bg-rose-50 rounded-t-lg transition whitespace-nowrap", children: "\u21A9 Process Return" })] }), _jsxs("div", { children: [activeTab === 'pos' && _jsx(CustomerFeedSalePOS, {}), activeTab === 'stock' && (_jsx(StockSummary, { onOpenTransferModal: () => setActiveTab('history'), onOpenAdjustmentModal: (prodId) => {
                            setSelectedProductId(prodId);
                            setIsAdjustmentModalOpen(true);
                        } })), activeTab === 'products' && _jsx(ProductList, {}), activeTab === 'purchases' && _jsx(PurchaseReceiving, {}), activeTab === 'suppliers' && _jsx(SupplierList, {}), activeTab === 'history' && _jsx(InventoryHistory, {})] }), isReturnModalOpen && (_jsx(CustomerReturnModal, { onClose: () => setIsReturnModalOpen(false), onSuccess: () => {
                    setIsReturnModalOpen(false);
                } })), isAdjustmentModalOpen && (_jsx(StockAdjustmentModal, { initialProductId: selectedProductId, onClose: () => {
                    setIsAdjustmentModalOpen(false);
                    setSelectedProductId(undefined);
                }, onSuccess: () => {
                    setIsAdjustmentModalOpen(false);
                    setSelectedProductId(undefined);
                } }))] }));
};
//# sourceMappingURL=FeedManagementModule.js.map