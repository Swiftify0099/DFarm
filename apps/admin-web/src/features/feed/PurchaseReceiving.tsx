import React, { useState, useEffect } from 'react';
import { feedApi } from '../../api/feedApi.js';
import { FeedSupplier, FeedProduct } from '@dfarm/shared-types';

export const PurchaseReceiving: React.FC = () => {
  const [suppliers, setSuppliers] = useState<FeedSupplier[]>([]);
  const [products, setProducts] = useState<FeedProduct[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>(new Date().toISOString().split('T')[0] ?? '');
  const [centerId, setCenterId] = useState<string>('');
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

        const token = localStorage.getItem('dfarm_auth_token') || '';
        const meRes = await fetch('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } });
        const meBody = await meRes.json();
        if (meBody?.data?.assignedCenters?.length > 0 && meBody.data.assignedCenters[0]) {
          setCenterId(meBody.data.assignedCenters[0].id);
        }
      } catch (err: any) {
        setError(err.message || 'Initialization failed');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

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
    if (!centerId) {
      setError('No target center ID identified');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);

      const idempotencyKey = `po_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // 1. Create Purchase
      const purchase = await feedApi.createPurchase({
        centerId,
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
    return <div className="p-6 text-gray-600">Loading procurement & supplier records...</div>;
  }

  return (
    <div className="purchase-receiving p-6 bg-white rounded-lg shadow">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Feed Procurement & Stock Receiving</h2>
        <p className="text-sm text-gray-500">
          Record supplier invoices, verify batch numbers, and authorize immediate stock increment into warehouse ledger
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-md mb-4 text-sm border border-red-200">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 text-emerald-800 p-4 rounded-md mb-4 text-sm border border-emerald-200 font-semibold">
          {successMsg}
        </div>
      )}

      <form onSubmit={handleSaveAndReceive} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Select Supplier *</label>
            <select
              required
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.supplierCode})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Supplier Invoice Number *</label>
            <input
              type="text"
              required
              placeholder="e.g. INV-AGRO-2026-901"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Purchase Date *</label>
            <input
              type="date"
              required
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-gray-800 text-sm uppercase">Invoice Line Items</h3>
            <button
              type="button"
              onClick={handleAddItem}
              className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-3 py-1.5 rounded border border-indigo-200"
            >
              + Add Item Line
            </button>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded border border-dashed border-gray-300 text-gray-500 text-xs">
              No product items added yet. Click "+ Add Item Line" above.
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <table className="min-w-full divide-y divide-gray-200 text-xs text-left">
                <thead className="bg-gray-50 font-bold text-gray-600 uppercase">
                  <tr>
                    <th className="px-3 py-2">Feed Product</th>
                    <th className="px-3 py-2">Quantity</th>
                    <th className="px-3 py-2">Unit</th>
                    <th className="px-3 py-2">Unit Cost (₹)</th>
                    <th className="px-3 py-2">GST Rate (%)</th>
                    <th className="px-3 py-2">Batch Reference</th>
                    <th className="px-3 py-2">Line Total</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {items.map((item, idx) => {
                    const lineTotal = item.quantity * item.unitCost * (1 + item.taxRatePercent / 100);
                    return (
                      <tr key={idx}>
                        <td className="px-3 py-2">
                          <select
                            value={item.productId}
                            onChange={(e) => handleItemChange(idx, 'productId', e.target.value)}
                            className="border rounded px-2 py-1 text-xs w-full max-w-[200px]"
                          >
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(idx, 'quantity', Number(e.target.value))}
                            className="w-20 border rounded px-2 py-1 text-xs font-bold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                            className="w-16 border rounded px-2 py-1 text-xs uppercase"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitCost}
                            onChange={(e) => handleItemChange(idx, 'unitCost', Number(e.target.value))}
                            className="w-24 border rounded px-2 py-1 text-xs font-semibold"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={item.taxRatePercent}
                            onChange={(e) => handleItemChange(idx, 'taxRatePercent', Number(e.target.value))}
                            className="w-16 border rounded px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.batchNumber || ''}
                            onChange={(e) => handleItemChange(idx, 'batchNumber', e.target.value)}
                            className="w-28 border rounded px-2 py-1 text-xs font-mono"
                          />
                        </td>
                        <td className="px-3 py-2 font-bold text-gray-900">
                          ₹{lineTotal.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-red-600 hover:text-red-800 font-bold"
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
            <div className="bg-gray-50 border rounded-lg p-4 w-72 space-y-1.5 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal:</span>
                <span className="font-semibold">₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Total GST / Tax:</span>
                <span className="font-semibold">₹{taxTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-gray-900 pt-2 border-t">
                <span>Gross Purchase Total:</span>
                <span className="text-emerald-700 font-extrabold">₹{total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-4 border-t">
          <button
            type="submit"
            disabled={saving || items.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded shadow text-sm disabled:opacity-50"
          >
            {saving ? 'Processing Goods Receipt...' : 'Authorize Purchase & Receive Stock'}
          </button>
        </div>
      </form>
    </div>
  );
};
