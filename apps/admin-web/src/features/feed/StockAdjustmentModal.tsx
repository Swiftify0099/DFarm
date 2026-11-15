import React, { useState, useEffect } from 'react';
import { feedApi } from '../../api/feedApi.js';
import { useAuth } from '../../context/AuthContext.js';
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
  const { currentCenterId, selectedCenterId, centers } = useAuth();
  const [products, setProducts] = useState<FeedProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>(initialProductId || '');
  const [centerId, setCenterId] = useState<string>(selectedCenterId || currentCenterId || (centers.length > 0 ? centers[0]!.id : ''));
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

        const initialCenter = selectedCenterId || currentCenterId || (centers.length > 0 ? centers[0]!.id : '');
        if (initialCenter && !centerId) {
          setCenterId(initialCenter);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load products');
      }
    }
    load();
  }, [initialProductId, centers, currentCenterId, selectedCenterId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetCenterId = centerId || selectedCenterId || currentCenterId || (centers.length > 0 ? centers[0]!.id : '');
    if (!selectedProductId || !targetCenterId) {
      setError('Product and center are required');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const idempotencyKey = `adj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      await feedApi.adjustStock({
        centerId: targetCenterId,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="clay-card bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-white flex flex-col">
        <div className="px-6 py-4 bg-gradient-to-r from-amber-700 to-amber-900 text-white flex justify-between items-center">
          <h3 className="font-black text-lg">Stock Adjustment & Write-Off</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold text-lg text-white transition-colors"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs font-bold border border-rose-200">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Target Intake Center *</label>
            <select
              value={centerId || selectedCenterId || currentCenterId || ''}
              onChange={(e) => setCenterId(e.target.value)}
              className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
            >
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Select Feed Product *</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
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
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Adjustment Type *</label>
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
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
              >
                <option value="DAMAGED_WRITE_OFF">Damaged Write-Off</option>
                <option value="STOCK_CORRECTION">Stock Correction</option>
                <option value="PHYSICAL_AUDIT_DEFICIT">Audit Deficit (Discrepancy)</option>
                <option value="PHYSICAL_AUDIT_SURPLUS">Audit Surplus (Discrepancy)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Direction *</label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as 'IN' | 'OUT')}
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
              >
                <option value="OUT">OUT (Decrease Stock)</option>
                <option value="IN">IN (Increase Stock)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Quantity (Base Units) *</label>
            <input
              type="number"
              min="0.001"
              step="any"
              required
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
            />
          </div>

          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Audited Reason *</label>
            <textarea
              rows={2}
              required
              placeholder="e.g. Moisture damage in warehouse bay 3 / Annual stock count variance..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
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
              disabled={submitting}
              className="clay-btn-secondary px-5 py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white rounded-xl text-xs font-extrabold shadow-clay-button disabled:opacity-50 active:scale-95 transition-all"
            >
              {submitting ? 'Applying Adjustment...' : 'Approve & Post Movement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
