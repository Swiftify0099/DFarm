import React, { useState, useEffect } from 'react';
import { feedApi } from '../../api/feedApi.js';
import { StockMovement } from '@dfarm/shared-types';

export const InventoryHistory: React.FC = () => {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [movementType, setMovementType] = useState<string>('');

  const loadMovements = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await feedApi.getMovements({
        movementType: movementType || undefined,
        limit: 100,
      });
      setMovements(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load stock movements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMovements();
  }, [movementType]);

  return (
    <div className="inventory-history p-6 bg-white rounded-lg shadow">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Append-Only Stock Movement Ledger</h2>
          <p className="text-sm text-gray-500">
            Immutable audit trail of receipts, counter sales, returns, transfers, and write-offs
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={movementType}
            onChange={(e) => setMovementType(e.target.value)}
            className="border rounded px-3 py-1.5 text-xs font-medium"
          >
            <option value="">All Movement Types</option>
            <option value="PURCHASE_RECEIPT">PURCHASE_RECEIPT</option>
            <option value="CUSTOMER_SALE">CUSTOMER_SALE</option>
            <option value="CUSTOMER_RETURN">CUSTOMER_RETURN</option>
            <option value="SUPPLIER_RETURN">SUPPLIER_RETURN</option>
            <option value="DAMAGED_WRITE_OFF">DAMAGED_WRITE_OFF</option>
            <option value="STOCK_CORRECTION">STOCK_CORRECTION</option>
            <option value="CENTER_TRANSFER">CENTER_TRANSFER</option>
          </select>
          <button
            onClick={loadMovements}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-xs border font-medium"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-md mb-4 text-sm border border-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500 text-sm">Loading movement ledger...</div>
      ) : movements.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded text-gray-500 text-sm">
          No stock movements recorded yet.
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 text-xs text-left">
            <thead className="bg-gray-50 text-gray-600 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Center</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Movement Type</th>
                <th className="px-4 py-3">Delta</th>
                <th className="px-4 py-3">Balance After</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Reference / Notes</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {movements.map((m: any) => {
                const isPositive = m.direction === 'IN';
                return (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(m.movementTimestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{m.centerName}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{m.productName}</div>
                      <div className="font-mono text-[10px] text-gray-400">{m.productCode}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-[11px] text-gray-700">
                        {m.movementType}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold">
                      <span className={isPositive ? 'text-emerald-700' : 'text-rose-700'}>
                        {isPositive ? '+' : '-'}{Number(m.quantity).toFixed(3)} {m.baseUnit}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-gray-900">
                      {Number(m.balanceAfter).toFixed(3)} {m.baseUnit}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{m.actorName || m.actorId.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-gray-500 text-[11px]">
                      <div>{m.referenceTransactionType}: <span className="font-mono">{m.referenceId?.slice(0, 8)}...</span></div>
                      {m.notes && <div className="italic text-gray-400">{m.notes}</div>}
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

