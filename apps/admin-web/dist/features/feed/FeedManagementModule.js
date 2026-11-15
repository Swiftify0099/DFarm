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
    const tabs = [
        { id: 'pos', label: 'Feed POS Counter', icon: '🛒' },
        { id: 'stock', label: 'Stock & Valuation', icon: '📦' },
        { id: 'products', label: 'Product Catalog', icon: '🏷️' },
        { id: 'purchases', label: 'Procurement & Receiving', icon: '📥' },
        { id: 'suppliers', label: 'Suppliers', icon: '🏭' },
        { id: 'history', label: 'Movement Ledger', icon: '📜' },
    ];
    return (_jsxs("div", { className: "feed-management-module max-w-7xl mx-auto space-y-6", children: [_jsxs("div", { className: "clay-card rounded-3xl p-6 bg-gradient-to-r from-emerald-900 via-teal-900 to-[#0A1824] text-white shadow-clay-card relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6", children: [_jsxs("div", { className: "relative z-10 max-w-2xl space-y-2", children: [_jsxs("div", { className: "inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold tracking-wider uppercase backdrop-blur-sm border border-emerald-400/30", children: [_jsx("span", { children: "\uD83C\uDF3E" }), " Cattle Feed & Inventory POS"] }), _jsx("h1", { className: "text-2xl sm:text-3xl font-extrabold tracking-tight text-white drop-shadow-sm", children: "Feed Store & Stock Operations" }), _jsx("p", { className: "text-sm text-emerald-100/90 leading-relaxed", children: "Multi-center cattle feed inventory, FIFO/WAC valuation, instant counter checkout with farmer ledger debit, and automated procurement receiving." })] }), _jsx("div", { className: "relative z-10 flex flex-wrap gap-2.5", children: _jsx("button", { onClick: () => setIsReturnModalOpen(true), className: "px-4 py-2.5 rounded-xl font-bold text-xs tracking-wide bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/30 backdrop-blur-sm transition-all duration-150 active:scale-95 shadow-sm", children: "\u21A9 Process Return" }) }), _jsx("div", { className: "absolute right-0 top-0 bottom-0 w-80 opacity-20 pointer-events-none bg-gradient-to-l from-emerald-400/30 to-transparent" })] }), _jsx("div", { className: "clay-inset p-1.5 rounded-2xl bg-[#EEF2F6] flex overflow-x-auto space-x-1.5 text-xs sm:text-sm font-bold scrollbar-thin", children: tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (_jsxs("button", { onClick: () => setActiveTab(tab.id), className: `flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-200 whitespace-nowrap ${isActive
                            ? 'bg-white text-emerald-700 shadow-clay-card border border-white font-extrabold scale-[1.02]'
                            : 'text-slate-600 hover:text-emerald-700 hover:bg-white/60'}`, children: [_jsx("span", { children: tab.icon }), _jsx("span", { children: tab.label })] }, tab.id));
                }) }), _jsxs("div", { children: [activeTab === 'pos' && _jsx(CustomerFeedSalePOS, {}), activeTab === 'stock' && (_jsx(StockSummary, { onOpenTransferModal: () => setActiveTab('history'), onOpenAdjustmentModal: (prodId) => {
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