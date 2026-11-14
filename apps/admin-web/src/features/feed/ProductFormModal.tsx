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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <h3 className="text-lg font-bold text-gray-800">
            {isEditing ? `Edit Product: ${product?.name}` : 'Register New Cattle Feed Product'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold text-xl">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded text-sm border border-red-200">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Product Code *</label>
              <input
                type="text"
                disabled={isEditing}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. FEED-PELLET-50KG"
                className="w-full border rounded px-3 py-2 text-sm uppercase font-mono disabled:bg-gray-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Category *</label>
              <select
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Product Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cattle Feed Pellet Super 20%"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Base Unit *</label>
              <select
                value={baseUnit}
                onChange={(e) => setBaseUnit(e.target.value as FeedProductUnit)}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="KG">KG (Kilograms)</option>
                <option value="BAG">BAG</option>
                <option value="PIECE">PIECE</option>
                <option value="LITRE">LITRE (Liquid)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Pack Unit Name</label>
              <input
                type="text"
                value={packUnit}
                onChange={(e) => setPackUnit(e.target.value)}
                placeholder="BAG / SACK / BOTTLE"
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Pack Size (in Base Units)</label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                required
                value={packSize}
                onChange={(e) => setPackSize(Number(e.target.value))}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Selling Price (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={sellingPrice}
                onChange={(e) => setSellingPrice(Number(e.target.value))}
                className="w-full border rounded px-3 py-2 text-sm font-semibold text-emerald-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Default Purchase Cost (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={defaultPurchasePrice}
                onChange={(e) => setDefaultPurchasePrice(Number(e.target.value))}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">GST Rate (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={taxRatePercent}
                onChange={(e) => setTaxRatePercent(Number(e.target.value))}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">HSN / SAC Code</label>
              <input
                type="text"
                value={hsnCode}
                onChange={(e) => setHsnCode(e.target.value)}
                placeholder="e.g. 2309"
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Min Stock Alert Level</label>
              <input
                type="number"
                min="0"
                value={minimumStockLevel}
                onChange={(e) => setMinimumStockLevel(Number(e.target.value))}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="DISCONTINUED">DISCONTINUED</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Nutritional composition, protein %, minerals..."
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded text-sm text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-semibold disabled:opacity-50"
            >
              {saving ? 'Saving...' : isEditing ? 'Update Product' : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

