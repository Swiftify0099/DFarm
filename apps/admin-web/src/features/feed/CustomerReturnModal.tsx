import React, { useState } from 'react';
import { feedApi } from '../../api/feedApi.js';
import { useAuth } from '../../context/AuthContext.js';

interface CustomerReturnModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const CustomerReturnModal: React.FC<CustomerReturnModalProps> = ({ onClose, onSuccess }) => {
  const { user } = useAuth();
  const [saleId, setSaleId] = useState<string>('');
  const [saleItem, setSaleItem] = useState<any | null>(null);
  const [searching, setSearching] = useState<boolean>(false);
  const [returnQuantity, setReturnQuantity] = useState<number>(1);
  const [stockCondition, setStockCondition] = useState<'SALEABLE' | 'DAMAGED'>('SALEABLE');
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  const handleLookupSale = async () => {
    if (!saleId.trim()) return;
    try {
      setSearching(true);
      setError(null);
      const sale = await feedApi.getSaleById(saleId.trim());
      if (sale && sale.items && sale.items.length > 0) {
        setSaleItem(sale.items[0]);
      } else {
        setError('No items found on this sale invoice');
      }
    } catch (err: any) {
      setError(err.message || 'Sale lookup failed');
    } finally {
      setSearching(false);
    }
  };

  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleItem) {
      setError('Lookup a valid sale invoice first');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const idempotencyKey = `ret_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const res = await feedApi.processReturn(saleId.trim(), {
        saleItemId: saleItem.id,
        returnQuantity: Number(returnQuantity),
        stockCondition,
        reason: reason.trim(),
        approvedBy: user?.id,
        idempotencyKey,
      });

      setResult(res);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Return processing failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="clay-card bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-white flex flex-col">
        <div className="px-6 py-4 bg-gradient-to-r from-rose-800 to-rose-900 text-white flex justify-between items-center">
          <h3 className="font-black text-lg">Process Authorized Customer Return</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold text-lg text-white transition-colors"
          >
            &times;
          </button>
        </div>

        {result ? (
          <div className="p-6 sm:p-8 space-y-4 text-center">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-2xl font-black shadow-inner">
              ✓
            </div>
            <h4 className="font-black text-xl text-slate-800">Return Processed Successfully</h4>
            <div className="clay-inset bg-[#EEF2F6] p-4 rounded-2xl text-xs text-left space-y-2.5 border border-slate-200/80">
              <div className="flex justify-between font-medium text-slate-600">
                <span>Refunded / Credited Amount:</span>
                <span className="font-black text-emerald-700 text-sm">₹{Number(result.creditAmount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-medium text-slate-600">
                <span>Stock Condition:</span>
                <span className="font-bold text-slate-800">{result.stockCondition}</span>
              </div>
              {result.stockCondition === 'DAMAGED' && (
                <div className="text-rose-600 text-[11px] font-bold">
                  * Product marked damaged and quarantined. Not added to active sellable stock.
                </div>
              )}
              {result.customerBalanceAfter !== undefined && (
                <div className="flex justify-between font-black text-indigo-900 border-t border-slate-200 pt-2 text-sm">
                  <span>Farmer Subledger Balance After:</span>
                  <span>₹{Number(result.customerBalanceAfter).toFixed(2)}</span>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="clay-btn-brand px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-xl font-extrabold text-sm shadow-clay-button hover:from-emerald-500 hover:to-teal-600 active:scale-95 transition-all"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmitReturn} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs font-bold border border-rose-200">
                {error}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Original Sale UUID *</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  placeholder="Paste Sale UUID..."
                  value={saleId}
                  onChange={(e) => setSaleId(e.target.value)}
                  className="flex-1 clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-sm"
                />
                <button
                  type="button"
                  onClick={handleLookupSale}
                  disabled={searching}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 shadow-sm active:scale-95 transition-all"
                >
                  {searching ? 'Loading...' : 'Lookup'}
                </button>
              </div>
            </div>

            {saleItem && (
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs space-y-1 shadow-sm">
                <div className="font-extrabold text-slate-900">{saleItem.productName}</div>
                <div className="text-slate-600 font-medium">
                  Sold Quantity: <span className="font-bold text-slate-800">{saleItem.quantity} {saleItem.unit}</span> | Unit Rate: <span className="font-bold text-emerald-700">₹{Number(saleItem.unitPrice).toFixed(2)}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Return Quantity *</label>
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  required
                  value={returnQuantity}
                  onChange={(e) => setReturnQuantity(Number(e.target.value))}
                  className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Stock Condition *</label>
                <select
                  value={stockCondition}
                  onChange={(e) => setStockCondition(e.target.value as 'SALEABLE' | 'DAMAGED')}
                  className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-sm"
                >
                  <option value="SALEABLE">SALEABLE (Add back to stock)</option>
                  <option value="DAMAGED">DAMAGED (Write-off quarantine)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Reason for Return *</label>
              <textarea
                rows={2}
                required
                placeholder="e.g. Bag torn during unloading / Customer requested exchange..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-sm"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !saleItem}
                className="clay-btn-brand px-5 py-2.5 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white rounded-xl text-xs font-extrabold shadow-clay-button disabled:opacity-40 active:scale-95 transition-all"
              >
                {submitting ? 'Processing Return...' : 'Authorize Return & Post Credit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

