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
    <div className="feed-product-list p-6 bg-white rounded-lg shadow">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Cattle Feed Product Catalog</h2>
          <p className="text-sm text-gray-500">Configure feed products, pack sizes, base units, and pricing</p>
        </div>
        <button
          onClick={handleCreateNew}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 rounded-md shadow flex items-center gap-2"
        >
          + Add New Product
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">Search Products</label>
          <input
            type="text"
            placeholder="Search by code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">Category Filter</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded border border-gray-300"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-md mb-4 text-sm border border-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500 text-sm">Loading feed catalog...</div>
      ) : products.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg text-gray-500 text-sm">
          No feed products found matching criteria.
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 font-semibold text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Product Name</th>
                <th className="px-4 py-3">Base Unit</th>
                <th className="px-4 py-3">Pack Config</th>
                <th className="px-4 py-3">Selling Price</th>
                <th className="px-4 py-3">Purchase Price</th>
                <th className="px-4 py-3">GST / HSN</th>
                <th className="px-4 py-3">Min Stock</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-medium text-gray-900">{p.code}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{p.name}</td>
                  <td className="px-4 py-3">{p.baseUnit}</td>
                  <td className="px-4 py-3 text-gray-600">
                    1 {p.packUnit} = {p.packSize} {p.baseUnit}
                  </td>
                  <td className="px-4 py-3 font-bold text-emerald-700">₹{Number(p.sellingPrice).toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-600">₹{Number(p.defaultPurchasePrice).toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {p.taxRatePercent}% {p.hsnCode ? `(${p.hsnCode})` : ''}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{p.minimumStockLevel} {p.baseUnit}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                        p.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleEdit(p)}
                      className="text-indigo-600 hover:text-indigo-900 font-medium text-xs px-2 py-1 rounded hover:bg-indigo-50"
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

