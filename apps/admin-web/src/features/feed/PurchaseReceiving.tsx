import React, { useState, useEffect } from 'react';
import { feedApi } from '../../api/feedApi.js';
import { useAuth } from '../../context/AuthContext.js';
import { FeedSupplier, FeedProduct } from '@dfarm/shared-types';

export const PurchaseReceiving: React.FC = () => {
  const { currentCenterId, selectedCenterId, centers } = useAuth();
  const [suppliers, setSuppliers] = useState<FeedSupplier[]>([]);
  const [products, setProducts] = useState<FeedProduct[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>(new Date().toISOString().split('T')[0] ?? '');
  const [centerId, setCenterId] = useState<string>(selectedCenterId || currentCenterId || (centers.length > 0 ? centers[0]!.id : ''));
  const [items, setItems] = useState<Array<{
    productId: string;
    quantity: number;
    unit: string;
    unitCost: number;
    taxRatePercent: number;
    batchNumber?: string;
  }>>([]);

  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        const [sups, prods] = await Promise.all([
          feedApi.getSuppliers(),
          feedApi.getProducts({ status: 'ACTIVE' }),
        ]);
        setSuppliers(sups);
        setProducts(prods);
        if (sups.length > 0 && sups[0]) setSelectedSupplierId(sups[0].id);

        const initialCenter = selectedCenterId || currentCenterId || (centers.length > 0 ? centers[0]!.id : '');
        if (initialCenter && !centerId) {
          setCenterId(initialCenter);
        }
      } catch (err: any) {
        setError(err.message || 'Initialization failed');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [centers, currentCenterId, selectedCenterId]);

  const handleAddItem = () => {
    if (products.length === 0 || !products[0]) return;
    const defaultProd = products[0];
    setItems([
      ...items,
      {
        productId: defaultProd.id,
        quantity: 10,
        unit: defaultProd.packUnit,
        unitCost: Number(defaultProd.defaultPurchasePrice || defaultProd.sellingPrice * 0.8),
        taxRatePercent: Number(defaultProd.taxRatePercent || 0),
        batchNumber: `BATCH-${Date.now().toString().slice(-6)}`,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index: number, field: string, val: any) => {
    setItems(
      items.map((item, idx) => {
        if (idx !== index) return item;
        const updated = { ...item, [field]: val };
        if (field === 'productId') {
          const p = products.find((x) => x.id === val);
          if (p) {
            updated.unit = p.packUnit;
            updated.unitCost = Number(p.defaultPurchasePrice || 0);
            updated.taxRatePercent = Number(p.taxRatePercent || 0);
          }
        }
        return updated;
      })
    );
  };

  const handleSaveAndReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId) {
      setError('Please select a supplier');
      return;
    }
    if (items.length === 0) {
      setError('Please add at least one line item to the purchase invoice');
      return;
    }
    const targetCenterId = centerId || selectedCenterId || currentCenterId || (centers.length > 0 ? centers[0]!.id : '');
    if (!targetCenterId) {
      setError('Please select a target center');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);

      const idempotencyKey = `po_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // 1. Create Purchase
      const purchase = await feedApi.createPurchase({
        centerId: targetCenterId,
        supplierId: selectedSupplierId,
        supplierInvoiceNumber: invoiceNumber.trim(),
        purchaseDate,
        items,
        idempotencyKey,
      });

      // 2. Authorize Stock Receiving immediately
      await feedApi.receivePurchase(purchase.id, {
        idempotencyKey: `${idempotencyKey}_rcv`,
        notes: `Authorized goods receipt against supplier invoice ${invoiceNumber}`,
      });

      setSuccessMsg(
        `Purchase ${purchase.supplierInvoiceNumber} successfully received! Stock balances updated and WAC recalculated.`
      );
      setInvoiceNumber('');
      setItems([]);
    } catch (err: any) {
      setError(err.message || 'Purchase receiving failed');
    } finally {
      setSaving(false);
    }
  };

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);
  const taxTotal = items.reduce((sum, i) => sum + i.quantity * i.unitCost * (i.taxRatePercent / 100), 0);
  const total = subtotal + taxTotal;

  if (loading) {
    return (
      <div className="clay-card rounded-3xl p-12 bg-white shadow-clay-card text-center text-slate-400 text-sm font-semibold space-y-2">
        <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <div>Loading procurement & supplier records...</div>
      </div>
    );
  }

  return (
    <div className="purchase-receiving clay-card rounded-3xl p-6 sm:p-8 bg-white shadow-clay-card border border-white/80 space-y-6">
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">Feed Procurement & Stock Receiving</h2>
        <p className="text-sm text-slate-500 font-medium">
          Record supplier invoices, verify batch numbers, and authorize immediate stock increment into warehouse ledger
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold shadow-sm">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-sm font-extrabold shadow-sm flex items-center gap-2">
          <span>✓</span>
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSaveAndReceive} className="space-y-6">
        <div className="clay-inset p-5 rounded-2xl bg-[#EEF2F6] border border-[#CBD5E1]/50 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1.5">Target Center *</label>
            <select
              required
              value={centerId || selectedCenterId || currentCenterId || ''}
              onChange={(e) => setCenterId(e.target.value)}
              className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
            >
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1.5">Select Supplier *</label>
            <select
              required
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.supplierCode})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1.5">Supplier Invoice Number *</label>
            <input
              type="text"
              required
              placeholder="e.g. INV-AGRO-2026-901"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1.5">Purchase Date *</label>
            <input
              type="date"
              required
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Invoice Line Items</h3>
            <button
              type="button"
              onClick={handleAddItem}
              className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold px-3.5 py-1.5 rounded-xl border border-indigo-200 active:scale-95 transition-all shadow-sm"
            >
              ➕ Add Item Line
            </button>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-10 clay-inset rounded-2xl bg-slate-50/80 border border-dashed border-slate-300 text-slate-500 text-xs font-semibold">
              No product items added yet. Click "+ Add Item Line" above.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80 shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-xs text-left">
                <thead className="bg-[#F8FAFC] font-extrabold text-slate-600 uppercase tracking-wider">
                  <tr>
                    <th className="px-3.5 py-3">Feed Product</th>
                    <th className="px-3.5 py-3">Quantity</th>
                    <th className="px-3.5 py-3">Unit</th>
                    <th className="px-3.5 py-3">Unit Cost (₹)</th>
                    <th className="px-3.5 py-3">GST Rate (%)</th>
                    <th className="px-3.5 py-3">Batch Reference</th>
                    <th className="px-3.5 py-3">Line Total</th>
                    <th className="px-3.5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {items.map((item, idx) => {
                    const lineTotal = item.quantity * item.unitCost * (1 + item.taxRatePercent / 100);
                    return (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-3.5 py-2.5">
                          <select
                            value={item.productId}
                            onChange={(e) => handleItemChange(idx, 'productId', e.target.value)}
                            className="border border-slate-300 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800 w-full max-w-[200px]"
                          >
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3.5 py-2.5">
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(idx, 'quantity', Number(e.target.value))}
                            className="w-20 border border-slate-300 rounded-lg px-2 py-1 text-xs font-black text-slate-900"
                          />
                        </td>
                        <td className="px-3.5 py-2.5">
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                            className="w-16 border border-slate-300 rounded-lg px-2 py-1 text-xs uppercase font-bold text-slate-700"
                          />
                        </td>
                        <td className="px-3.5 py-2.5">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitCost}
                            onChange={(e) => handleItemChange(idx, 'unitCost', Number(e.target.value))}
                            className="w-24 border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-900"
                          />
                        </td>
                        <td className="px-3.5 py-2.5">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={item.taxRatePercent}
                            onChange={(e) => handleItemChange(idx, 'taxRatePercent', Number(e.target.value))}
                            className="w-16 border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-700"
                          />
                        </td>
                        <td className="px-3.5 py-2.5">
                          <input
                            type="text"
                            value={item.batchNumber || ''}
                            onChange={(e) => handleItemChange(idx, 'batchNumber', e.target.value)}
                            className="w-28 border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-800"
                          />
                        </td>
                        <td className="px-3.5 py-2.5 font-black text-slate-900">
                          ₹{lineTotal.toFixed(2)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-rose-600 hover:text-rose-800 font-bold text-base px-1"
                          >
                            &times;
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

        {items.length > 0 && (
          <div className="flex justify-end">
            <div className="clay-card rounded-2xl p-5 bg-[#F8FAFC] border border-slate-200/80 w-80 space-y-2 text-xs shadow-sm">
              <div className="flex justify-between text-slate-600 font-medium">
                <span>Subtotal:</span>
                <span className="font-bold text-slate-800">₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600 font-medium">
                <span>Total GST / Tax:</span>
                <span className="font-bold text-slate-800">₹{taxTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-black text-slate-900 pt-2 border-t border-slate-200">
                <span>Gross Purchase Total:</span>
                <span className="text-emerald-700 text-lg font-black">₹{total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-4 border-t border-slate-100">
          <button
            type="submit"
            disabled={saving || items.length === 0}
            className="clay-btn-brand bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-extrabold px-6 py-3 rounded-xl shadow-clay-button text-sm disabled:opacity-40 active:scale-95 transition-all"
          >
            {saving ? 'Processing Goods Receipt...' : 'Authorize Purchase & Receive Stock'}
          </button>
        </div>
      </form>
    </div>
  );
};
