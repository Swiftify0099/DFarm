import React, { useState } from 'react';
import { FeedTab } from './types.js';
import { ProductList } from './ProductList.js';
import { StockSummary } from './StockSummary.js';
import { CustomerFeedSalePOS } from './CustomerFeedSalePOS.js';
import { PurchaseReceiving } from './PurchaseReceiving.js';
import { SupplierList } from './SupplierList.js';
import { CustomerReturnModal } from './CustomerReturnModal.js';
import { StockAdjustmentModal } from './StockAdjustmentModal.js';
import { InventoryHistory } from './InventoryHistory.js';

export const FeedManagementModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<FeedTab>('pos');
  const [isReturnModalOpen, setIsReturnModalOpen] = useState<boolean>(false);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState<boolean>(false);
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>(undefined);

  const tabs: Array<{ id: FeedTab; label: string; icon: string }> = [
    { id: 'pos', label: 'Feed POS Counter', icon: '🛒' },
    { id: 'stock', label: 'Stock & Valuation', icon: '📦' },
    { id: 'products', label: 'Product Catalog', icon: '🏷️' },
    { id: 'purchases', label: 'Procurement & Receiving', icon: '📥' },
    { id: 'suppliers', label: 'Suppliers', icon: '🏭' },
    { id: 'history', label: 'Movement Ledger', icon: '📜' },
  ];

  return (
    <div className="feed-management-module max-w-7xl mx-auto space-y-6">
      {/* 3D Clay Feature Hero Banner */}
      <div className="clay-card rounded-3xl p-6 bg-gradient-to-r from-emerald-900 via-teal-900 to-[#0A1824] text-white shadow-clay-card relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="relative z-10 max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold tracking-wider uppercase backdrop-blur-sm border border-emerald-400/30">
            <span>🌾</span> Cattle Feed & Inventory POS
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white drop-shadow-sm">
            Feed Store & Stock Operations
          </h1>
          <p className="text-sm text-emerald-100/90 leading-relaxed">
            Multi-center cattle feed inventory, FIFO/WAC valuation, instant counter checkout with farmer ledger debit, and automated procurement receiving.
          </p>
        </div>
        <div className="relative z-10 flex flex-wrap gap-2.5">
          <button
            onClick={() => setIsReturnModalOpen(true)}
            className="px-4 py-2.5 rounded-xl font-bold text-xs tracking-wide bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/30 backdrop-blur-sm transition-all duration-150 active:scale-95 shadow-sm"
          >
            ↩ Process Return
          </button>
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-80 opacity-20 pointer-events-none bg-gradient-to-l from-emerald-400/30 to-transparent"></div>
      </div>

      {/* Module Navigation Tabs */}
      <div className="clay-inset p-1.5 rounded-2xl bg-[#EEF2F6] flex overflow-x-auto space-x-1.5 text-xs sm:text-sm font-bold scrollbar-thin">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-200 whitespace-nowrap ${
                isActive
                  ? 'bg-white text-emerald-700 shadow-clay-card border border-white font-extrabold scale-[1.02]'
                  : 'text-slate-600 hover:text-emerald-700 hover:bg-white/60'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Tab View Rendering */}
      <div>
        {activeTab === 'pos' && <CustomerFeedSalePOS />}
        {activeTab === 'stock' && (
          <StockSummary
            onOpenTransferModal={() => setActiveTab('history')}
            onOpenAdjustmentModal={(prodId) => {
              setSelectedProductId(prodId);
              setIsAdjustmentModalOpen(true);
            }}
          />
        )}
        {activeTab === 'products' && <ProductList />}
        {activeTab === 'purchases' && <PurchaseReceiving />}
        {activeTab === 'suppliers' && <SupplierList />}
        {activeTab === 'history' && <InventoryHistory />}
      </div>

      {/* Reusable Modals */}
      {isReturnModalOpen && (
        <CustomerReturnModal
          onClose={() => setIsReturnModalOpen(false)}
          onSuccess={() => {
            setIsReturnModalOpen(false);
          }}
        />
      )}

      {isAdjustmentModalOpen && (
        <StockAdjustmentModal
          initialProductId={selectedProductId}
          onClose={() => {
            setIsAdjustmentModalOpen(false);
            setSelectedProductId(undefined);
          }}
          onSuccess={() => {
            setIsAdjustmentModalOpen(false);
            setSelectedProductId(undefined);
          }}
        />
      )}
    </div>
  );
};

