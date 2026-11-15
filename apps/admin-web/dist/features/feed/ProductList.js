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
    return (_jsxs("div", { className: "feed-product-list clay-card rounded-3xl p-6 sm:p-8 bg-white shadow-clay-card border border-white/80 space-y-6", children: [_jsxs("div", { className: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-black text-slate-800 tracking-tight", children: "Cattle Feed Product Catalog" }), _jsx("p", { className: "text-sm text-slate-500 font-medium", children: "Configure feed products, pack sizes, base units, and pricing" })] }), _jsxs("button", { onClick: handleCreateNew, className: "clay-btn-brand bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold px-5 py-2.5 rounded-xl shadow-clay-button flex items-center gap-2 text-xs tracking-wide active:scale-95 transition-all", children: [_jsx("span", { children: "\u2795" }), " Add New Product"] })] }), _jsxs("div", { className: "clay-inset p-4 rounded-2xl bg-[#EEF2F6] border border-[#CBD5E1]/50 grid grid-cols-1 md:grid-cols-3 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1.5", children: "Search Products" }), _jsx("input", { type: "text", placeholder: "Search by code or name...", value: search, onChange: (e) => setSearch(e.target.value), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1.5", children: "Category Filter" }), _jsxs("select", { value: selectedCategory, onChange: (e) => setSelectedCategory(e.target.value), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm", children: [_jsx("option", { value: "", children: "All Categories" }), categories.map((c) => (_jsx("option", { value: c.id, children: c.name }, c.id)))] })] }), _jsx("div", { className: "flex items-end", children: _jsx("button", { onClick: loadData, className: "w-full md:w-auto bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold px-5 py-2 rounded-xl border border-slate-300 shadow-sm active:scale-95 transition-all", children: "\uD83D\uDD04 Refresh" }) })] }), error && (_jsx("div", { className: "p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold shadow-sm", children: error })), loading ? (_jsxs("div", { className: "text-center py-16 text-slate-400 text-sm font-semibold space-y-2", children: [_jsx("div", { className: "w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" }), _jsx("div", { children: "Loading feed catalog..." })] })) : products.length === 0 ? (_jsx("div", { className: "text-center py-16 clay-inset rounded-2xl bg-slate-50/80 text-slate-500 text-sm font-semibold", children: "No feed products found matching criteria." })) : (_jsx("div", { className: "overflow-x-auto rounded-2xl border border-slate-200/80 shadow-sm", children: _jsxs("table", { className: "min-w-full divide-y divide-slate-200 text-sm text-left", children: [_jsx("thead", { className: "bg-[#F8FAFC] text-slate-600 font-extrabold text-xs uppercase tracking-wider", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3.5", children: "Code" }), _jsx("th", { className: "px-4 py-3.5", children: "Product Name" }), _jsx("th", { className: "px-4 py-3.5", children: "Base Unit" }), _jsx("th", { className: "px-4 py-3.5", children: "Pack Config" }), _jsx("th", { className: "px-4 py-3.5", children: "Selling Price" }), _jsx("th", { className: "px-4 py-3.5", children: "Purchase Price" }), _jsx("th", { className: "px-4 py-3.5", children: "GST / HSN" }), _jsx("th", { className: "px-4 py-3.5", children: "Min Stock" }), _jsx("th", { className: "px-4 py-3.5", children: "Status" }), _jsx("th", { className: "px-4 py-3.5 text-right", children: "Actions" })] }) }), _jsx("tbody", { className: "bg-white divide-y divide-slate-100", children: products.map((p) => (_jsxs("tr", { className: "hover:bg-slate-50/80 transition-colors", children: [_jsx("td", { className: "px-4 py-3.5 font-mono font-bold text-slate-900 bg-slate-50/50", children: p.code }), _jsx("td", { className: "px-4 py-3.5 font-bold text-slate-900", children: p.name }), _jsx("td", { className: "px-4 py-3.5 text-slate-600 font-medium", children: p.baseUnit }), _jsxs("td", { className: "px-4 py-3.5 text-slate-600 font-medium", children: ["1 ", p.packUnit, " = ", p.packSize, " ", p.baseUnit] }), _jsxs("td", { className: "px-4 py-3.5 font-black text-emerald-700", children: ["\u20B9", Number(p.sellingPrice).toFixed(2)] }), _jsxs("td", { className: "px-4 py-3.5 text-slate-600 font-medium", children: ["\u20B9", Number(p.defaultPurchasePrice).toFixed(2)] }), _jsxs("td", { className: "px-4 py-3.5 text-slate-500 text-xs font-mono", children: [p.taxRatePercent, "% ", p.hsnCode ? `(${p.hsnCode})` : ''] }), _jsxs("td", { className: "px-4 py-3.5 text-slate-700 font-bold", children: [p.minimumStockLevel, " ", p.baseUnit] }), _jsx("td", { className: "px-4 py-3.5", children: _jsx("span", { className: `inline-block px-2.5 py-0.5 rounded-full text-xs font-extrabold ${p.status === 'ACTIVE'
                                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                : 'bg-slate-100 text-slate-800 border border-slate-200'}`, children: p.status }) }), _jsx("td", { className: "px-4 py-3.5 text-right", children: _jsx("button", { onClick: () => handleEdit(p), className: "text-indigo-600 hover:text-indigo-900 font-bold text-xs px-2.5 py-1 rounded-lg hover:bg-indigo-50 active:scale-95 transition-all", children: "Edit" }) })] }, p.id))) })] }) })), isModalOpen && (_jsx(ProductFormModal, { product: editingProduct, categories: categories, onClose: () => setIsModalOpen(false), onSuccess: () => {
                    setIsModalOpen(false);
                    loadData();
                } }))] }));
};
//# sourceMappingURL=ProductList.js.map