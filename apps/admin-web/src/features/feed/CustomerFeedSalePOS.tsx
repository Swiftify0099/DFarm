import React, { useState, useEffect } from 'react';
import { feedApi } from '../../api/feedApi.js';
import { FeedProduct, CenterProductInventory } from '@dfarm/shared-types';
import { CartItem } from './types.js';
import { InvoicePreviewModal } from './InvoicePreviewModal.js';

export const CustomerFeedSalePOS: React.FC = () => {
  const [customerQuery, setCustomerQuery] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [customerSearchLoading, setCustomerSearchLoading] = useState<boolean>(false);
  const [products, setProducts] = useState<FeedProduct[]>([]);
  const [inventory, setInventory] = useState<CenterProductInventory[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMode, setPaymentMode] = useState<'CREDIT' | 'CASH'>('CREDIT');
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountApprovedBy, setDiscountApprovedBy] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<any | null>(null);

  useEffect(() => {
    async function loadCatalog() {
      try {
        const [prods, inv] = await Promise.all([
          feedApi.getProducts({ status: 'ACTIVE' }),
          feedApi.getInventory(),
        ]);
        setProducts(prods);
        setInventory(inv);
      } catch (err: any) {
        setError(err.message || 'Failed to load feed inventory catalog');
      }
    }
    loadCatalog();
  }, []);

  const handleCustomerSearch = async () => {
    if (!customerQuery.trim()) return;
    try {
      setCustomerSearchLoading(true);
      setError(null);
      const token = localStorage.getItem('dfarm_auth_token') || '';
      const res = await fetch(`/api/v1/customers?search=${encodeURIComponent(customerQuery)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body: any = await res.json();
      const items = Array.isArray(body?.data)
        ? body.data
        : (body?.data?.items || body?.data?.customers || []);
      if (body.success && items.length > 0) {
        setSelectedCustomer(items[0]);
      } else {
        setError('No active customer found with given code/phone');
        setSelectedCustomer(null);
      }
    } catch (err: any) {
      setError(err.message || 'Customer lookup failed');
    } finally {
      setCustomerSearchLoading(false);
    }
  };

  const getAvailableStock = (productId: string, unit: string): number => {
    const inv = inventory.find((i: any) => i.productId === productId);
    if (!inv) return 0;
    const prod = products.find((p: FeedProduct) => p.id === productId);
    if (!prod) return 0;

    const baseStock = Number(inv.currentStock);
    if (unit === prod.baseUnit) {
      return baseStock;
    } else if (unit === prod.packUnit) {
      return Math.floor(baseStock / Number(prod.packSize));
    }
    return 0;
  };

  const handleAddToCart = (product: FeedProduct) => {
    const existing = cart.find((i: CartItem) => i.productId === product.id);
    const available = getAvailableStock(product.id, product.packUnit);

    if (existing) {
      if (existing.quantity + 1 > available) {
        setError(`Cannot exceed available stock of ${available} ${product.packUnit} for ${product.name}`);
        return;
      }
      setCart(
        cart.map((i: CartItem) =>
          i.productId === product.id
            ? {
                ...i,
                quantity: i.quantity + 1,
                itemTotal: Math.round((i.quantity + 1) * i.unitPrice * (1 + i.taxRatePercent / 100) * 100) / 100,
              }
            : i
        )
      );
    } else {
      if (available < 1) {
        setError(`Insufficient stock for ${product.name}. Available: 0`);
        return;
      }
      const itemTotal = Math.round(1 * Number(product.sellingPrice) * (1 + product.taxRatePercent / 100) * 100) / 100;
      setCart([
        ...cart,
        {
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          unit: product.packUnit,
          baseUnit: product.baseUnit,
          packSize: product.packSize,
          availableStock: available,
          quantity: 1,
          unitPrice: Number(product.sellingPrice),
          taxRatePercent: Number(product.taxRatePercent),
          discountAmount: 0,
          itemTotal,
        },
      ]);
    }
  };

  const handleUpdateQuantity = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart(cart.filter((i: CartItem) => i.productId !== productId));
      return;
    }
    const item = cart.find((i: CartItem) => i.productId === productId);
    if (!item) return;

    if (qty > item.availableStock) {
      setError(`Cannot exceed available stock of ${item.availableStock} ${item.unit} for ${item.productName}`);
      return;
    }

    setCart(
      cart.map((i: CartItem) =>
        i.productId === productId
          ? {
              ...i,
              quantity: qty,
              itemTotal: Math.round(qty * i.unitPrice * (1 + i.taxRatePercent / 100) * 100) / 100,
            }
          : i
      )
    );
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart(cart.filter((i: CartItem) => i.productId !== productId));
  };

  // Calculations
  const subtotal = cart.reduce((sum: number, item: CartItem) => sum + item.quantity * item.unitPrice, 0);
  const taxTotal = cart.reduce(
    (sum: number, item: CartItem) => sum + Math.round(item.quantity * item.unitPrice * (item.taxRatePercent / 100) * 100) / 100,
    0
  );
  const grandTotal = Math.max(0, Math.round((subtotal + taxTotal - Number(discountAmount || 0)) * 100) / 100);

  const handleCheckout = async () => {
    if (!selectedCustomer) {
      setError('Please search and select a customer first');
      return;
    }
    if (cart.length === 0) {
      setError('Cart is empty. Add at least one feed product');
      return;
    }
    if (discountAmount > 0 && !discountApprovedBy) {
      setError('Discount requires approval actor UUID');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const idempotencyKey = `sale_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const payload = {
        centerId: selectedCustomer.primaryCenterId,
        customerId: selectedCustomer.id,
        items: cart.map((i: CartItem) => ({
          productId: i.productId,
          quantity: i.quantity,
          unit: i.unit,
          discountAmount: i.discountAmount || 0,
        })),
        paymentMode,
        discountAmount: Number(discountAmount || 0),
        discountApprovedBy: discountApprovedBy || null,
        idempotencyKey,
      };


      const result = await feedApi.createSale(payload);
      setCompletedSale(result);

      // Reset cart and refresh stock
      setCart([]);
      setDiscountAmount(0);
      setDiscountApprovedBy('');
      const updatedInv = await feedApi.getInventory();
      setInventory(updatedInv);
    } catch (err: any) {
      setError(err.message || 'Sale checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="feed-sale-pos p-6 bg-white rounded-lg shadow">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Cattle Feed Counter POS & Customer Sales</h2>
        <p className="text-sm text-gray-500">
          Atomic inventory deduction, customer subledger credit debit, and instant receipt generation
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-md mb-6 text-sm border border-red-200">
          {error}
        </div>
      )}

      {/* Customer Lookup Header */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
        <div className="text-xs font-bold uppercase text-gray-600 mb-2">Customer Identification</div>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Enter Farmer Code (e.g. FAR-1001) or Mobile Number..."
            value={customerQuery}
            onChange={(e) => setCustomerQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCustomerSearch()}
            className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={handleCustomerSearch}
            disabled={customerSearchLoading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-5 py-2 rounded text-sm disabled:opacity-50"
          >
            {customerSearchLoading ? 'Searching...' : 'Search Farmer'}
          </button>
        </div>

        {selectedCustomer && (
          <div className="mt-4 p-3 bg-white border border-emerald-200 rounded flex justify-between items-center">
            <div>
              <div className="font-bold text-gray-900 text-base">{selectedCustomer.fullName}</div>
              <div className="text-xs text-gray-500">
                Farmer Code: <span className="font-mono font-bold text-gray-700">{selectedCustomer.farmerCode}</span> | Phone: {selectedCustomer.mobileNumber}
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">
                ACTIVE CUSTOMER
              </span>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="block text-xs text-red-600 hover:underline mt-1 ml-auto"
              >
                Change Farmer
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Product Catalog Grid */}
        <div className="lg:col-span-7">
          <div className="text-sm font-bold text-gray-700 uppercase mb-3">Select Products to Add</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[550px] overflow-y-auto pr-1">
            {products.map((p) => {
              const available = getAvailableStock(p.id, p.packUnit);
              const isOutOfStock = available <= 0;
              return (
                <div
                  key={p.id}
                  className={`border rounded-lg p-3 flex flex-col justify-between transition ${
                    isOutOfStock
                      ? 'bg-gray-50 opacity-60 border-gray-200'
                      : 'bg-white hover:border-emerald-500 hover:shadow-sm'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="font-mono text-xs font-semibold text-gray-500">{p.code}</span>
                      <span className={`text-xs font-bold ${isOutOfStock ? 'text-red-600' : 'text-emerald-700'}`}>
                        {available} {p.packUnit} left
                      </span>
                    </div>
                    <div className="font-bold text-gray-900 text-sm mt-1">{p.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      1 {p.packUnit} = {p.packSize} {p.baseUnit}
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-3 pt-2 border-t border-gray-100">
                    <span className="font-bold text-emerald-700 text-base">₹{Number(p.sellingPrice).toFixed(2)}</span>
                    <button
                      onClick={() => handleAddToCart(p)}
                      disabled={isOutOfStock}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded disabled:bg-gray-300"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Cart & Invoice Checkout Panel */}
        <div className="lg:col-span-5 bg-gray-50 border border-gray-200 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="text-sm font-bold text-gray-800 uppercase border-b pb-2 mb-3">
              Sale Invoice Items ({cart.length})
            </div>

            {cart.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-xs">No items in invoice cart yet.</div>
            ) : (
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 mb-4">
                {cart.map((item) => (
                  <div key={item.productId} className="bg-white border rounded p-2.5 text-xs flex justify-between items-center">
                    <div className="flex-1">
                      <div className="font-bold text-gray-900">{item.productName}</div>
                      <div className="text-gray-500">
                        ₹{item.unitPrice.toFixed(2)} / {item.unit}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleUpdateQuantity(item.productId, item.quantity - 1)}
                        className="w-6 h-6 bg-gray-100 hover:bg-gray-200 rounded font-bold text-center"
                      >
                        -
                      </button>
                      <span className="font-bold text-sm w-6 text-center">{item.quantity}</span>
                      <button
                        onClick={() => handleUpdateQuantity(item.productId, item.quantity + 1)}
                        className="w-6 h-6 bg-gray-100 hover:bg-gray-200 rounded font-bold text-center"
                      >
                        +
                      </button>
                      <div className="font-bold text-gray-900 w-16 text-right">₹{item.itemTotal.toFixed(2)}</div>
                      <button
                        onClick={() => handleRemoveFromCart(item.productId)}
                        className="text-red-500 hover:text-red-700 ml-1 font-bold"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pricing & Checkout summary */}
          <div className="border-t border-gray-200 pt-3 space-y-2 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal:</span>
              <span className="font-semibold">₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Applicable GST:</span>
              <span className="font-semibold">₹{taxTotal.toFixed(2)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase">Discount (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(Number(e.target.value))}
                  className="w-full border rounded px-2 py-1 text-xs"
                />
              </div>
              {discountAmount > 0 && (
                <div>
                  <label className="block text-[10px] font-semibold text-red-600 uppercase">Approval Actor UUID *</label>
                  <input
                    type="text"
                    required
                    placeholder="Manager UUID"
                    value={discountApprovedBy}
                    onChange={(e) => setDiscountApprovedBy(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-xs font-mono"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-between items-center text-sm font-bold text-gray-900 pt-2 border-t">
              <span>Total Invoice Payable:</span>
              <span className="text-lg text-emerald-700 font-extrabold">₹{grandTotal.toFixed(2)}</span>
            </div>

            <div className="pt-2">
              <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Payment Method</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMode('CREDIT')}
                  className={`py-1.5 rounded text-xs font-bold border transition ${
                    paymentMode === 'CREDIT'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  CREDIT (Ledger Debit)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('CASH')}
                  className={`py-1.5 rounded text-xs font-bold border transition ${
                    paymentMode === 'CASH'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  CASH RECEIPT
                </button>
              </div>
            </div>

            <button
              onClick={handleCheckout}
              disabled={submitting || cart.length === 0 || !selectedCustomer}
              className="w-full mt-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded shadow disabled:opacity-50"
            >
              {submitting ? 'Posting Sale & Debiting Ledger...' : 'Confirm Sale & Print Slip'}
            </button>
          </div>
        </div>
      </div>

      {completedSale && (
        <InvoicePreviewModal
          sale={completedSale}
          onClose={() => setCompletedSale(null)}
        />
      )}
    </div>
  );
};
