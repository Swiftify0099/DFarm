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

  return (
    <div className="feed-management-module max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Module Navigation Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto space-x-2 pb-1 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('pos')}
          className={`px-4 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeTab === 'pos'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          🛒 Feed POS Counter
        </button>
        <button
          onClick={() => setActiveTab('stock')}
          className={`px-4 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeTab === 'stock'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          📦 Stock & Valuation
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeTab === 'products'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          🏷️ Product Catalog
        </button>
        <button
          onClick={() => setActiveTab('purchases')}
          className={`px-4 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeTab === 'purchases'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          📥 Procurement & Receiving
        </button>
        <button
          onClick={() => setActiveTab('suppliers')}
          className={`px-4 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeTab === 'suppliers'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          🏭 Suppliers
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeTab === 'history'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          📜 Movement Ledger
        </button>
        <button
          onClick={() => setIsReturnModalOpen(true)}
          className="px-4 py-2 text-rose-700 hover:bg-rose-50 rounded-t-lg transition whitespace-nowrap"
        >
          ↩ Process Return
        </button>
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

