import React, { useState, useEffect } from 'react';
import { feedApi } from '../../api/feedApi.js';
import { CenterProductInventory } from '@dfarm/shared-types';

interface StockSummaryProps {
  onOpenTransferModal: (productId?: string) => void;
  onOpenAdjustmentModal: (productId?: string) => void;
}

export const StockSummary: React.FC<StockSummaryProps> = ({
  onOpenTransferModal,
  onOpenAdjustmentModal,
}) => {
  const [inventory, setInventory] = useState<CenterProductInventory[]>([]);
  const [valuationData, setValuationData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filterLowStockOnly, setFilterLowStockOnly] = useState<boolean>(false);

  const loadStock = async () => {
    try {
      setLoading(true);
      setError(null);
      const [inv, val] = await Promise.all([
        feedApi.getInventory(),
        feedApi.getReports({ type: 'valuation' }),
      ]);
      setInventory(inv);
      setValuationData(val);
    } catch (err: any) {
      setError(err.message || 'Failed to load inventory stock');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStock();
  }, []);

  const filteredItems = inventory.filter((item: any) => {
    if (!filterLowStockOnly) return true;
    return Number(item.currentStock) <= Number(item.minimumStockLevel);
  });

  return (
    <div className="stock-summary clay-card rounded-3xl p-6 sm:p-8 bg-white shadow-clay-card border border-white/80 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Center-Wise Feed Inventory & Valuation</h2>
          <p className="text-sm text-slate-500 font-medium">
            Real-time stock ledger, minimum threshold reorder alerts, and Weighted Average Costing (WAC)
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => onOpenTransferModal()}
            className="clay-btn-brand bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-clay-button active:scale-95 transition-all"
          >
            ↔ Transfer Between Centers
          </button>
          <button
            onClick={() => onOpenAdjustmentModal()}
            className="clay-btn-secondary bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-clay-button active:scale-95 transition-all"
          >
            ± Adjust / Write-off Stock
          </button>
        </div>
      </div>

      {valuationData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="clay-card rounded-2xl p-5 bg-gradient-to-br from-emerald-50/80 to-teal-50/60 border border-emerald-100 shadow-sm relative overflow-hidden">
            <div className="text-[11px] font-extrabold text-emerald-800 uppercase tracking-wider">Total Stock Valuation (WAC)</div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-700 mt-1.5 tracking-tight">
              ₹{Number(valuationData.totalValuation).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-emerald-600/90 font-medium mt-1">Costing Method: Weighted Average Cost</div>
          </div>
          <div className="clay-card rounded-2xl p-5 bg-gradient-to-br from-sky-50/80 to-blue-50/60 border border-sky-100 shadow-sm relative overflow-hidden">
            <div className="text-[11px] font-extrabold text-sky-800 uppercase tracking-wider">Active Center Inventory Rows</div>
            <div className="text-2xl sm:text-3xl font-black text-sky-700 mt-1.5 tracking-tight">{inventory.length}</div>
            <div className="text-xs text-sky-600/90 font-medium mt-1">Across all registered dairy centers</div>
          </div>
          <div className="clay-card rounded-2xl p-5 bg-gradient-to-br from-rose-50/80 to-amber-50/60 border border-rose-100 shadow-sm relative overflow-hidden">
            <div className="text-[11px] font-extrabold text-rose-800 uppercase tracking-wider">Low Stock Alert Count</div>
            <div className="text-2xl sm:text-3xl font-black text-rose-700 mt-1.5 tracking-tight">
              {inventory.filter((i: any) => Number(i.currentStock) <= Number(i.minimumStockLevel)).length}
            </div>
            <div className="text-xs text-rose-600/90 font-medium mt-1">Stock at or below reorder threshold</div>
          </div>
        </div>
      )}

      <div className="clay-inset p-3 rounded-2xl bg-[#EEF2F6] border border-[#CBD5E1]/50 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filterLowStockOnly}
            onChange={(e) => setFilterLowStockOnly(e.target.checked)}
            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
          />
          <span>Show Low Stock Warnings Only</span>
        </label>
        <button
          onClick={loadStock}
          className="text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-sm active:scale-95 transition-all"
        >
          🔄 Refresh Stock
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold shadow-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm font-semibold space-y-2">
          <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <div>Loading stock balances...</div>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-16 clay-inset rounded-2xl bg-slate-50/80 text-slate-500 text-sm font-semibold">
          No inventory records found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm text-left">
            <thead className="bg-[#F8FAFC] text-slate-600 font-extrabold text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5">Center</th>
                <th className="px-4 py-3.5">Product</th>
                <th className="px-4 py-3.5">Current Stock</th>
                <th className="px-4 py-3.5">Min Threshold</th>
                <th className="px-4 py-3.5">Avg Unit Cost (WAC)</th>
                <th className="px-4 py-3.5">Selling Rate</th>
                <th className="px-4 py-3.5">Valuation</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {filteredItems.map((item: any) => {
                const isLow = Number(item.currentStock) <= Number(item.minimumStockLevel);
                const val = Number(item.currentStock) * Number(item.weightedAvgCost);
                return (
                  <tr key={item.id} className={`hover:bg-slate-50/80 transition-colors ${isLow ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-4 py-3.5 font-bold text-slate-800">{item.centerName}</td>
                    <td className="px-4 py-3.5">
                      <div className="font-extrabold text-slate-900">{item.productName}</div>
                      <div className="text-xs font-mono font-bold text-slate-400">{item.productCode}</div>
                    </td>
                    <td className="px-4 py-3.5 font-black text-slate-900">
                      {Number(item.currentStock).toFixed(3)} {item.baseUnit}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 font-medium">
                      {Number(item.minimumStockLevel).toFixed(3)} {item.baseUnit}
                    </td>
                    <td className="px-4 py-3.5 text-slate-700 font-bold">₹{Number(item.weightedAvgCost).toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-emerald-700 font-bold">₹{Number(item.sellingPrice).toFixed(2)}</td>
                    <td className="px-4 py-3.5 font-black text-slate-900">₹{val.toFixed(2)}</td>
                    <td className="px-4 py-3.5">
                      {isLow ? (
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 border border-rose-200 animate-pulse">
                          LOW STOCK
                        </span>
                      ) : (
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          ADEQUATE
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right space-x-2">
                      <button
                        onClick={() => onOpenAdjustmentModal(item.productId)}
                        className="text-xs text-amber-700 hover:text-amber-900 font-bold px-2 py-1 rounded-lg hover:bg-amber-50 active:scale-95 transition-all"
                      >
                        Adjust
                      </button>
                      <button
                        onClick={() => onOpenTransferModal(item.productId)}
                        className="text-xs text-indigo-700 hover:text-indigo-900 font-bold px-2 py-1 rounded-lg hover:bg-indigo-50 active:scale-95 transition-all"
                      >
                        Transfer
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

