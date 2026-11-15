import React, { useState, useEffect } from 'react';
import { feedApi } from '../../api/feedApi.js';
import { FeedProduct, FeedCategory } from '@dfarm/shared-types';
import { ProductFormModal } from './ProductFormModal.js';

export const ProductList: React.FC = () => {
  const [products, setProducts] = useState<FeedProduct[]>([]);
  const [categories, setCategories] = useState<FeedCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [editingProduct, setEditingProduct] = useState<FeedProduct | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [prods, cats] = await Promise.all([
        feedApi.getProducts({ search, categoryId: selectedCategory || undefined }),
        feedApi.getCategories(),
      ]);
      setProducts(prods);
      setCategories(cats);
    } catch (err: any) {
      setError(err.message || 'Failed to load feed products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, selectedCategory]);

  const handleEdit = (prod: FeedProduct) => {
    setEditingProduct(prod);
    setIsModalOpen(true);
  };

  const handleCreateNew = () => {
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  return (
    <div className="feed-product-list clay-card rounded-3xl p-6 sm:p-8 bg-white shadow-clay-card border border-white/80 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Cattle Feed Product Catalog</h2>
          <p className="text-sm text-slate-500 font-medium">Configure feed products, pack sizes, base units, and pricing</p>
        </div>
        <button
          onClick={handleCreateNew}
          className="clay-btn-brand bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold px-5 py-2.5 rounded-xl shadow-clay-button flex items-center gap-2 text-xs tracking-wide active:scale-95 transition-all"
        >
          <span>➕</span> Add New Product
        </button>
      </div>

      <div className="clay-inset p-4 rounded-2xl bg-[#EEF2F6] border border-[#CBD5E1]/50 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1.5">Search Products</label>
          <input
            type="text"
            placeholder="Search by code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1.5">Category Filter</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={loadData}
            className="w-full md:w-auto bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold px-5 py-2 rounded-xl border border-slate-300 shadow-sm active:scale-95 transition-all"
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
          <div>Loading feed catalog...</div>
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-16 clay-inset rounded-2xl bg-slate-50/80 text-slate-500 text-sm font-semibold">
          No feed products found matching criteria.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm text-left">
            <thead className="bg-[#F8FAFC] text-slate-600 font-extrabold text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5">Code</th>
                <th className="px-4 py-3.5">Product Name</th>
                <th className="px-4 py-3.5">Base Unit</th>
                <th className="px-4 py-3.5">Pack Config</th>
                <th className="px-4 py-3.5">Selling Price</th>
                <th className="px-4 py-3.5">Purchase Price</th>
                <th className="px-4 py-3.5">GST / HSN</th>
                <th className="px-4 py-3.5">Min Stock</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3.5 font-mono font-bold text-slate-900 bg-slate-50/50">{p.code}</td>
                  <td className="px-4 py-3.5 font-bold text-slate-900">{p.name}</td>
                  <td className="px-4 py-3.5 text-slate-600 font-medium">{p.baseUnit}</td>
                  <td className="px-4 py-3.5 text-slate-600 font-medium">
                    1 {p.packUnit} = {p.packSize} {p.baseUnit}
                  </td>
                  <td className="px-4 py-3.5 font-black text-emerald-700">₹{Number(p.sellingPrice).toFixed(2)}</td>
                  <td className="px-4 py-3.5 text-slate-600 font-medium">₹{Number(p.defaultPurchasePrice).toFixed(2)}</td>
                  <td className="px-4 py-3.5 text-slate-500 text-xs font-mono">
                    {p.taxRatePercent}% {p.hsnCode ? `(${p.hsnCode})` : ''}
                  </td>
                  <td className="px-4 py-3.5 text-slate-700 font-bold">{p.minimumStockLevel} {p.baseUnit}</td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                        p.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-800 border border-slate-200'
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <button
                      onClick={() => handleEdit(p)}
                      className="text-indigo-600 hover:text-indigo-900 font-bold text-xs px-2.5 py-1 rounded-lg hover:bg-indigo-50 active:scale-95 transition-all"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <ProductFormModal
          product={editingProduct}
          categories={categories}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false);
            loadData();
          }}
        />
      )}
    </div>
  );
};

