import React, { useState } from 'react';
import { feedApi } from '../../api/feedApi.js';

interface CustomerReturnModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const CustomerReturnModal: React.FC<CustomerReturnModalProps> = ({ onClose, onSuccess }) => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="px-6 py-4 bg-gray-50 border-b flex justify-between items-center">
          <h3 className="font-bold text-gray-800 text-lg">Process Authorized Customer Return</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold text-xl">&times;</button>
        </div>

        {result ? (
          <div className="p-6 space-y-4 text-center">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
              ✓
            </div>
            <h4 className="font-bold text-lg text-gray-800">Return Processed Successfully</h4>
            <div className="bg-gray-50 p-4 rounded text-xs text-left space-y-2 border">
              <div className="flex justify-between">
                <span>Refunded / Credited Amount:</span>
                <span className="font-bold text-emerald-700">₹{Number(result.creditAmount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Stock Condition:</span>
                <span className="font-bold">{result.stockCondition}</span>
              </div>
              {result.stockCondition === 'DAMAGED' && (
                <div className="text-rose-600 text-[11px] font-semibold">
                  * Product marked damaged and quarantined. Not added to active sellable stock.
                </div>
              )}
              {result.customerBalanceAfter !== undefined && (
                <div className="flex justify-between font-bold text-indigo-900 border-t pt-1">
                  <span>Farmer Subledger Balance After:</span>
                  <span>₹{Number(result.customerBalanceAfter).toFixed(2)}</span>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-emerald-600 text-white rounded font-bold text-sm shadow hover:bg-emerald-700"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmitReturn} className="p-6 space-y-4">
            {error && (
              <div className="bg-red-50 text-red-700 p-3 rounded text-xs border border-red-200">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Original Sale UUID *</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  placeholder="Paste Sale UUID..."
                  value={saleId}
                  onChange={(e) => setSaleId(e.target.value)}
                  className="flex-1 border rounded px-3 py-2 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={handleLookupSale}
                  disabled={searching}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded text-xs font-semibold border"
                >
                  {searching ? 'Loading...' : 'Lookup'}
                </button>
              </div>
            </div>

            {saleItem && (
              <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded text-xs space-y-1">
                <div className="font-bold text-gray-900">{saleItem.productName}</div>
                <div className="text-gray-600">
                  Sold Quantity: {saleItem.quantity} {saleItem.unit} | Unit Rate: ₹{Number(saleItem.unitPrice).toFixed(2)}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Return Quantity *</label>
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  required
                  value={returnQuantity}
                  onChange={(e) => setReturnQuantity(Number(e.target.value))}
                  className="w-full border rounded px-3 py-2 text-xs font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Stock Condition *</label>
                <select
                  value={stockCondition}
                  onChange={(e) => setStockCondition(e.target.value as 'SALEABLE' | 'DAMAGED')}
                  className="w-full border rounded px-3 py-2 text-xs font-semibold"
                >
                  <option value="SALEABLE">SALEABLE (Add back to stock)</option>
                  <option value="DAMAGED">DAMAGED (Write-off quarantine)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Reason for Return *</label>
              <textarea
                rows={2}
                required
                placeholder="e.g. Bag torn during unloading / Customer requested exchange..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full border rounded px-3 py-2 text-xs"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border rounded text-xs text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !saleItem}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold shadow disabled:opacity-50"
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

