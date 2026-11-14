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
    <div className="stock-summary p-6 bg-white rounded-lg shadow">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Center-Wise Feed Inventory & Valuation</h2>
          <p className="text-sm text-gray-500">
            Real-time stock ledger, minimum threshold reorder alerts, and Weighted Average Costing (WAC)
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onOpenTransferModal()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded text-sm font-medium shadow"
          >
            ↔ Transfer Between Centers
          </button>
          <button
            onClick={() => onOpenAdjustmentModal()}
            className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded text-sm font-medium shadow"
          >
            ± Adjust / Write-off Stock
          </button>
        </div>
      </div>

      {valuationData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <div className="text-xs font-semibold text-emerald-800 uppercase">Total Stock Valuation (WAC)</div>
            <div className="text-2xl font-bold text-emerald-700 mt-1">
              ₹{Number(valuationData.totalValuation).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-emerald-600 mt-1">Costing Method: Weighted Average Cost</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-xs font-semibold text-blue-800 uppercase">Active Center Inventory Rows</div>
            <div className="text-2xl font-bold text-blue-700 mt-1">{inventory.length}</div>
            <div className="text-xs text-blue-600 mt-1">Across all registered dairy centers</div>
          </div>
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
            <div className="text-xs font-semibold text-rose-800 uppercase">Low Stock Alert Count</div>
            <div className="text-2xl font-bold text-rose-700 mt-1">
              {inventory.filter((i: any) => Number(i.currentStock) <= Number(i.minimumStockLevel)).length}
            </div>
            <div className="text-xs text-rose-600 mt-1">Stock at or below reorder threshold</div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 mb-4">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={filterLowStockOnly}
            onChange={(e) => setFilterLowStockOnly(e.target.checked)}
            className="rounded text-emerald-600 focus:ring-emerald-500"
          />
          Show Low Stock Warnings Only
        </label>
        <button
          onClick={loadStock}
          className="ml-auto text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded border"
        >
          Refresh Stock
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-md mb-4 text-sm border border-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500 text-sm">Loading stock balances...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded text-gray-500 text-sm">
          No inventory records found.
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-semibold text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Center</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Current Stock</th>
                <th className="px-4 py-3">Min Threshold</th>
                <th className="px-4 py-3">Avg Unit Cost (WAC)</th>
                <th className="px-4 py-3">Selling Rate</th>
                <th className="px-4 py-3">Valuation</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredItems.map((item: any) => {
                const isLow = Number(item.currentStock) <= Number(item.minimumStockLevel);
                const val = Number(item.currentStock) * Number(item.weightedAvgCost);
                return (
                  <tr key={item.id} className={`hover:bg-gray-50 ${isLow ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-800">{item.centerName}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{item.productName}</div>
                      <div className="text-xs font-mono text-gray-500">{item.productCode}</div>
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-900">
                      {Number(item.currentStock).toFixed(3)} {item.baseUnit}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {Number(item.minimumStockLevel).toFixed(3)} {item.baseUnit}
                    </td>
                    <td className="px-4 py-3 text-gray-700">₹{Number(item.weightedAvgCost).toFixed(2)}</td>
                    <td className="px-4 py-3 text-emerald-700 font-medium">₹{Number(item.sellingPrice).toFixed(2)}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">₹{val.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      {isLow ? (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800 animate-pulse">
                          LOW STOCK
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                          ADEQUATE
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => onOpenAdjustmentModal(item.productId)}
                        className="text-xs text-amber-700 hover:text-amber-900 font-medium"
                      >
                        Adjust
                      </button>
                      <button
                        onClick={() => onOpenTransferModal(item.productId)}
                        className="text-xs text-indigo-700 hover:text-indigo-900 font-medium"
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

