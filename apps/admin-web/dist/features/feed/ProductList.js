import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { feedApi } from '../../api/feedApi.js';
import { ProductFormModal } from './ProductFormModal.js';
export const ProductList = () => {
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [editingProduct, setEditingProduct] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
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
        }
        catch (err) {
            setError(err.message || 'Failed to load feed products');
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        loadData();
    }, [search, selectedCategory]);
    const handleEdit = (prod) => {
        setEditingProduct(prod);
        setIsModalOpen(true);
    };
    const handleCreateNew = () => {
        setEditingProduct(null);
        setIsModalOpen(true);
    };
    return (_jsxs("div", { className: "feed-product-list p-6 bg-white rounded-lg shadow", children: [_jsxs("div", { className: "flex justify-between items-center mb-6", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-bold text-gray-800", children: "Cattle Feed Product Catalog" }), _jsx("p", { className: "text-sm text-gray-500", children: "Configure feed products, pack sizes, base units, and pricing" })] }), _jsx("button", { onClick: handleCreateNew, className: "bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 rounded-md shadow flex items-center gap-2", children: "+ Add New Product" })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4 mb-6", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold uppercase text-gray-500 mb-1", children: "Search Products" }), _jsx("input", { type: "text", placeholder: "Search by code or name...", value: search, onChange: (e) => setSearch(e.target.value), className: "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold uppercase text-gray-500 mb-1", children: "Category Filter" }), _jsxs("select", { value: selectedCategory, onChange: (e) => setSelectedCategory(e.target.value), className: "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500", children: [_jsx("option", { value: "", children: "All Categories" }), categories.map((c) => (_jsx("option", { value: c.id, children: c.name }, c.id)))] })] }), _jsx("div", { className: "flex items-end", children: _jsx("button", { onClick: loadData, className: "bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded border border-gray-300", children: "Refresh" }) })] }), error && (_jsx("div", { className: "bg-red-50 text-red-700 p-4 rounded-md mb-4 text-sm border border-red-200", children: error })), loading ? (_jsx("div", { className: "text-center py-12 text-gray-500 text-sm", children: "Loading feed catalog..." })) : products.length === 0 ? (_jsx("div", { className: "text-center py-12 bg-gray-50 rounded-lg text-gray-500 text-sm", children: "No feed products found matching criteria." })) : (_jsx("div", { className: "overflow-x-auto border border-gray-200 rounded-lg", children: _jsxs("table", { className: "min-w-full divide-y divide-gray-200 text-sm text-left", children: [_jsx("thead", { className: "bg-gray-50 text-gray-600 font-semibold text-xs uppercase tracking-wider", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3", children: "Code" }), _jsx("th", { className: "px-4 py-3", children: "Product Name" }), _jsx("th", { className: "px-4 py-3", children: "Base Unit" }), _jsx("th", { className: "px-4 py-3", children: "Pack Config" }), _jsx("th", { className: "px-4 py-3", children: "Selling Price" }), _jsx("th", { className: "px-4 py-3", children: "Purchase Price" }), _jsx("th", { className: "px-4 py-3", children: "GST / HSN" }), _jsx("th", { className: "px-4 py-3", children: "Min Stock" }), _jsx("th", { className: "px-4 py-3", children: "Status" }), _jsx("th", { className: "px-4 py-3 text-right", children: "Actions" })] }) }), _jsx("tbody", { className: "bg-white divide-y divide-gray-200", children: products.map((p) => (_jsxs("tr", { className: "hover:bg-gray-50", children: [_jsx("td", { className: "px-4 py-3 font-mono font-medium text-gray-900", children: p.code }), _jsx("td", { className: "px-4 py-3 font-semibold text-gray-800", children: p.name }), _jsx("td", { className: "px-4 py-3", children: p.baseUnit }), _jsxs("td", { className: "px-4 py-3 text-gray-600", children: ["1 ", p.packUnit, " = ", p.packSize, " ", p.baseUnit] }), _jsxs("td", { className: "px-4 py-3 font-bold text-emerald-700", children: ["\u20B9", Number(p.sellingPrice).toFixed(2)] }), _jsxs("td", { className: "px-4 py-3 text-gray-600", children: ["\u20B9", Number(p.defaultPurchasePrice).toFixed(2)] }), _jsxs("td", { className: "px-4 py-3 text-gray-500", children: [p.taxRatePercent, "% ", p.hsnCode ? `(${p.hsnCode})` : ''] }), _jsxs("td", { className: "px-4 py-3 text-gray-700", children: [p.minimumStockLevel, " ", p.baseUnit] }), _jsx("td", { className: "px-4 py-3", children: _jsx("span", { className: `inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${p.status === 'ACTIVE'
                                                ? 'bg-emerald-100 text-emerald-800'
                                                : 'bg-gray-100 text-gray-800'}`, children: p.status }) }), _jsx("td", { className: "px-4 py-3 text-right", children: _jsx("button", { onClick: () => handleEdit(p), className: "text-indigo-600 hover:text-indigo-900 font-medium text-xs px-2 py-1 rounded hover:bg-indigo-50", children: "Edit" }) })] }, p.id))) })] }) })), isModalOpen && (_jsx(ProductFormModal, { product: editingProduct, categories: categories, onClose: () => setIsModalOpen(false), onSuccess: () => {
                    setIsModalOpen(false);
                    loadData();
                } }))] }));
};
//# sourceMappingURL=ProductList.js.map