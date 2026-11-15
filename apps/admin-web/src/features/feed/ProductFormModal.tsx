import React, { useState } from 'react';
import { feedApi } from '../../api/feedApi.js';
import { FeedProduct, FeedCategory, FeedProductUnit } from '@dfarm/shared-types';

interface ProductFormModalProps {
  product: FeedProduct | null;
  categories: FeedCategory[];
  onClose: () => void;
  onSuccess: () => void;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  product,
  categories,
  onClose,
  onSuccess,
}) => {
  const isEditing = Boolean(product);
  const [categoryId, setCategoryId] = useState<string>(product?.categoryId || categories[0]?.id || '');
  const [code, setCode] = useState<string>(product?.code || '');
  const [name, setName] = useState<string>(product?.name || '');
  const [description, setDescription] = useState<string>(product?.description || '');
  const [baseUnit, setBaseUnit] = useState<FeedProductUnit>(product?.baseUnit || FeedProductUnit.KG);
  const [packSize, setPackSize] = useState<number>(product?.packSize || 50);
  const [packUnit, setPackUnit] = useState<string>(product?.packUnit || 'BAG');
  const [defaultPurchasePrice, setDefaultPurchasePrice] = useState<number>(product?.defaultPurchasePrice || 0);
  const [sellingPrice, setSellingPrice] = useState<number>(product?.sellingPrice || 0);
  const [taxRatePercent, setTaxRatePercent] = useState<number>(product?.taxRatePercent || 0);
  const [hsnCode, setHsnCode] = useState<string>(product?.hsnCode || '');
  const [minimumStockLevel, setMinimumStockLevel] = useState<number>(product?.minimumStockLevel || 10);
  const [status, setStatus] = useState<string>(product?.status || 'ACTIVE');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);

      const payload = {
        categoryId,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || null,
        baseUnit,
        packSize: Number(packSize),
        packUnit: packUnit.trim(),
        defaultPurchasePrice: Number(defaultPurchasePrice),
        sellingPrice: Number(sellingPrice),
        taxRatePercent: Number(taxRatePercent),
        hsnCode: hsnCode.trim() || null,
        status,
        minimumStockLevel: Number(minimumStockLevel),
      };

      if (isEditing && product) {
        await feedApi.updateProduct(product.id, payload);
      } else {
        await feedApi.createProduct(payload);
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="clay-card bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col border border-white">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-emerald-800 to-teal-900 text-white">
          <h3 className="text-lg font-black tracking-tight">
            {isEditing ? `Edit Product: ${product?.name}` : 'Register New Cattle Feed Product'}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold text-lg text-white transition-colors"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs font-bold border border-rose-200">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Product Code *</label>
              <input
                type="text"
                disabled={isEditing}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. FEED-PELLET-50KG"
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs uppercase font-mono font-bold text-slate-800 disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Category *</label>
              <select
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Product Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cattle Feed Pellet Super 20%"
              className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Base Unit *</label>
              <select
                value={baseUnit}
                onChange={(e) => setBaseUnit(e.target.value as FeedProductUnit)}
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              >
                <option value="KG">KG (Kilograms)</option>
                <option value="BAG">BAG</option>
                <option value="PIECE">PIECE</option>
                <option value="LITRE">LITRE (Liquid)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Pack Unit Name</label>
              <input
                type="text"
                value={packUnit}
                onChange={(e) => setPackUnit(e.target.value)}
                placeholder="BAG / SACK / BOTTLE"
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Pack Size (in Base Units)</label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                required
                value={packSize}
                onChange={(e) => setPackSize(Number(e.target.value))}
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Selling Price (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={sellingPrice}
                onChange={(e) => setSellingPrice(Number(e.target.value))}
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Default Purchase Cost (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={defaultPurchasePrice}
                onChange={(e) => setDefaultPurchasePrice(Number(e.target.value))}
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">GST Rate (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={taxRatePercent}
                onChange={(e) => setTaxRatePercent(Number(e.target.value))}
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">HSN / SAC Code</label>
              <input
                type="text"
                value={hsnCode}
                onChange={(e) => setHsnCode(e.target.value)}
                placeholder="e.g. 2309"
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Min Stock Alert Level</label>
              <input
                type="number"
                min="0"
                value={minimumStockLevel}
                onChange={(e) => setMinimumStockLevel(Number(e.target.value))}
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="DISCONTINUED">DISCONTINUED</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Nutritional composition, protein %, minerals..."
              className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 active:scale-95 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="clay-btn-brand px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl text-xs font-extrabold shadow-clay-button disabled:opacity-50 active:scale-95 transition-all"
            >
              {saving ? 'Saving...' : isEditing ? 'Update Product' : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

