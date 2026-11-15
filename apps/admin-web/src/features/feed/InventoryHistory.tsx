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
    <div className="inventory-history clay-card rounded-3xl p-6 sm:p-8 bg-white shadow-clay-card border border-white/80 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Append-Only Stock Movement Ledger</h2>
          <p className="text-sm text-slate-500 font-medium">
            Immutable audit trail of receipts, counter sales, returns, transfers, and write-offs
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={movementType}
            onChange={(e) => setMovementType(e.target.value)}
            className="clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
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
            className="bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-xs border border-slate-300 font-bold shadow-sm active:scale-95 transition-all"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold shadow-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm font-semibold space-y-2">
          <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <div>Loading movement ledger...</div>
        </div>
      ) : movements.length === 0 ? (
        <div className="text-center py-16 clay-inset rounded-2xl bg-slate-50/80 text-slate-500 text-sm font-semibold">
          No stock movements recorded yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-xs text-left">
            <thead className="bg-[#F8FAFC] text-slate-600 font-extrabold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5">Timestamp</th>
                <th className="px-4 py-3.5">Center</th>
                <th className="px-4 py-3.5">Product</th>
                <th className="px-4 py-3.5">Movement Type</th>
                <th className="px-4 py-3.5">Delta</th>
                <th className="px-4 py-3.5">Balance After</th>
                <th className="px-4 py-3.5">Actor</th>
                <th className="px-4 py-3.5">Reference / Notes</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {movements.map((m: any) => {
                const isPositive = m.direction === 'IN';
                return (
                  <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3.5 text-slate-500 font-medium whitespace-nowrap">
                      {new Date(m.movementTimestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5 font-bold text-slate-800">{m.centerName}</td>
                    <td className="px-4 py-3.5">
                      <div className="font-extrabold text-slate-900">{m.productName}</div>
                      <div className="font-mono text-[10px] text-slate-400 font-bold">{m.productCode}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-mono font-bold text-[11px] bg-slate-100 px-2 py-0.5 rounded-md text-slate-700">
                        {m.movementType}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-mono font-extrabold text-xs">
                      <span className={isPositive ? 'text-emerald-700' : 'text-rose-700'}>
                        {isPositive ? '+' : '-'}{Number(m.quantity).toFixed(3)} {m.baseUnit}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-mono font-black text-slate-900">
                      {Number(m.balanceAfter).toFixed(3)} {m.baseUnit}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 font-medium">{m.actorName || m.actorId.slice(0, 8)}</td>
                    <td className="px-4 py-3.5 text-slate-500 text-[11px]">
                      <div>{m.referenceTransactionType}: <span className="font-mono font-bold">{m.referenceId?.slice(0, 8)}...</span></div>
                      {m.notes && <div className="italic text-slate-400">{m.notes}</div>}
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

