import React, { useState, useEffect } from 'react';
import { feedApi } from '../../api/feedApi.js';
import { FeedProduct } from '@dfarm/shared-types';

interface StockAdjustmentModalProps {
  initialProductId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  initialProductId,
  onClose,
  onSuccess,
}) => {
  const [products, setProducts] = useState<FeedProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>(initialProductId || '');
  const [centerId, setCenterId] = useState<string>('');
  const [adjustmentType, setAdjustmentType] = useState<string>('DAMAGED_WRITE_OFF');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('OUT');
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const prods = await feedApi.getProducts({ status: 'ACTIVE' });
        setProducts(prods);
        if (!selectedProductId && prods.length > 0 && prods[0]) {
          setSelectedProductId(prods[0].id);
        }

        const token = localStorage.getItem('dfarm_auth_token') || '';
        const meRes = await fetch('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } });
        const meBody = await meRes.json();
        if (meBody?.data?.assignedCenters?.length > 0 && meBody.data.assignedCenters[0]) {
          setCenterId(meBody.data.assignedCenters[0].id);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load products');
      }
    }
    load();
  }, [initialProductId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !centerId) {
      setError('Product and center are required');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const idempotencyKey = `adj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      await feedApi.adjustStock({
        centerId,
        productId: selectedProductId,
        adjustmentType,
        quantity: Number(quantity),
        direction,
        reason: reason.trim(),
        idempotencyKey,
      });

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Stock adjustment failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b flex justify-between items-center">
          <h3 className="font-bold text-gray-800 text-lg">Stock Adjustment & Write-Off</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold text-xl">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded text-xs border border-red-200">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Select Feed Product *</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code}) - Base: {p.baseUnit}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Adjustment Type *</label>
              <select
                value={adjustmentType}
                onChange={(e) => {
                  const val = e.target.value;
                  setAdjustmentType(val);
                  if (val === 'DAMAGED_WRITE_OFF' || val === 'PHYSICAL_AUDIT_DEFICIT') {
                    setDirection('OUT');
                  } else if (val === 'PHYSICAL_AUDIT_SURPLUS') {
                    setDirection('IN');
                  }
                }}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="DAMAGED_WRITE_OFF">Damaged Write-Off</option>
                <option value="STOCK_CORRECTION">Stock Correction</option>
                <option value="PHYSICAL_AUDIT_DEFICIT">Audit Deficit (Discrepancy)</option>
                <option value="PHYSICAL_AUDIT_SURPLUS">Audit Surplus (Discrepancy)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Direction *</label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as 'IN' | 'OUT')}
                className="w-full border rounded px-3 py-2 text-sm font-bold"
              >
                <option value="OUT">OUT (Decrease Stock)</option>
                <option value="IN">IN (Increase Stock)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Quantity (Base Units) *</label>
            <input
              type="number"
              min="0.001"
              step="any"
              required
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-full border rounded px-3 py-2 text-sm font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Audited Reason *</label>
            <textarea
              rows={2}
              required
              placeholder="e.g. Moisture damage in warehouse bay 3 / Annual stock count variance..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded text-sm text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded text-sm font-bold shadow disabled:opacity-50"
            >
              {submitting ? 'Applying Adjustment...' : 'Approve & Post Movement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
