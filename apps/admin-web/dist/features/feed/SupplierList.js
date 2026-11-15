import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { feedApi } from '../../api/feedApi.js';
export const SupplierList = () => {
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    // Form fields
    const [supplierCode, setSupplierCode] = useState('');
    const [name, setName] = useState('');
    const [contactPerson, setContactPerson] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [email, setEmail] = useState('');
    const [address, setAddress] = useState('');
    const [gstNumber, setGstNumber] = useState('');
    const [panNumber, setPanNumber] = useState('');
    const [saving, setSaving] = useState(false);
    const loadSuppliers = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await feedApi.getSuppliers();
            setSuppliers(data);
        }
        catch (err) {
            setError(err.message || 'Failed to load suppliers');
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        loadSuppliers();
    }, []);
    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            setError(null);
            await feedApi.createSupplier({
                supplierCode: supplierCode.trim().toUpperCase(),
                name: name.trim(),
                contactPerson: contactPerson.trim() || null,
                phoneNumber: phoneNumber.trim(),
                email: email.trim() || null,
                address: address.trim() || null,
                gstNumber: gstNumber.trim().toUpperCase() || null,
                panNumber: panNumber.trim().toUpperCase() || null,
            });
            setIsModalOpen(false);
            setSupplierCode('');
            setName('');
            setContactPerson('');
            setPhoneNumber('');
            setEmail('');
            setAddress('');
            setGstNumber('');
            setPanNumber('');
            loadSuppliers();
        }
        catch (err) {
            setError(err.message || 'Failed to register supplier');
        }
        finally {
            setSaving(false);
        }
    };
    return (_jsxs("div", { className: "supplier-list clay-card rounded-3xl p-6 sm:p-8 bg-white shadow-clay-card border border-white/80 space-y-6", children: [_jsxs("div", { className: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-black text-slate-800 tracking-tight", children: "Cattle Feed Suppliers" }), _jsx("p", { className: "text-sm text-slate-500 font-medium", children: "Manage procurement vendors, GSTIN credentials, and outstanding payable balances" })] }), _jsxs("button", { onClick: () => setIsModalOpen(true), className: "clay-btn-brand bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold px-5 py-2.5 rounded-xl shadow-clay-button text-xs tracking-wide active:scale-95 transition-all flex items-center gap-2", children: [_jsx("span", { children: "\u2795" }), " Register Supplier"] })] }), error && (_jsx("div", { className: "p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold shadow-sm", children: error })), loading ? (_jsxs("div", { className: "text-center py-16 text-slate-400 text-sm font-semibold space-y-2", children: [_jsx("div", { className: "w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" }), _jsx("div", { children: "Loading suppliers..." })] })) : suppliers.length === 0 ? (_jsx("div", { className: "text-center py-16 clay-inset rounded-2xl bg-slate-50/80 text-slate-500 text-sm font-semibold", children: "No registered feed suppliers found." })) : (_jsx("div", { className: "overflow-x-auto rounded-2xl border border-slate-200/80 shadow-sm", children: _jsxs("table", { className: "min-w-full divide-y divide-slate-200 text-sm text-left", children: [_jsx("thead", { className: "bg-[#F8FAFC] text-slate-600 font-extrabold text-xs uppercase tracking-wider", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3.5", children: "Code" }), _jsx("th", { className: "px-4 py-3.5", children: "Supplier Name" }), _jsx("th", { className: "px-4 py-3.5", children: "Contact Person" }), _jsx("th", { className: "px-4 py-3.5", children: "Phone & Email" }), _jsx("th", { className: "px-4 py-3.5", children: "GSTIN / PAN" }), _jsx("th", { className: "px-4 py-3.5", children: "Outstanding Balance" }), _jsx("th", { className: "px-4 py-3.5", children: "Status" })] }) }), _jsx("tbody", { className: "bg-white divide-y divide-slate-100", children: suppliers.map((s) => (_jsxs("tr", { className: "hover:bg-slate-50/80 transition-colors", children: [_jsx("td", { className: "px-4 py-3.5 font-mono font-bold text-slate-900 bg-slate-50/50", children: s.supplierCode }), _jsx("td", { className: "px-4 py-3.5 font-bold text-slate-900", children: s.name }), _jsx("td", { className: "px-4 py-3.5 text-slate-600 font-medium", children: s.contactPerson || '-' }), _jsxs("td", { className: "px-4 py-3.5 text-slate-600 font-medium", children: [_jsx("div", { className: "font-semibold text-slate-800", children: s.phoneNumber }), s.email && _jsx("div", { className: "text-xs text-slate-400", children: s.email })] }), _jsxs("td", { className: "px-4 py-3.5 font-mono text-xs text-slate-600 font-bold", children: [_jsx("div", { children: s.gstNumber || '-' }), s.panNumber && _jsx("div", { className: "text-slate-400", children: s.panNumber })] }), _jsxs("td", { className: "px-4 py-3.5 font-black text-rose-700", children: ["\u20B9", Number(s.outstandingBalance).toFixed(2)] }), _jsx("td", { className: "px-4 py-3.5", children: _jsx("span", { className: `inline-block px-2.5 py-0.5 rounded-full text-xs font-extrabold ${s.status === 'ACTIVE'
                                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                : 'bg-slate-100 text-slate-800 border border-slate-200'}`, children: s.status }) })] }, s.id))) })] }) })), isModalOpen && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200", children: _jsxs("div", { className: "clay-card bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-white", children: [_jsxs("div", { className: "px-6 py-4 bg-gradient-to-r from-emerald-800 to-teal-900 text-white flex justify-between items-center", children: [_jsx("h3", { className: "font-black text-lg", children: "Register Feed Supplier" }), _jsx("button", { onClick: () => setIsModalOpen(false), className: "w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold text-lg text-white transition-colors", children: "\u00D7" })] }), _jsxs("form", { onSubmit: handleCreate, className: "p-6 space-y-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Supplier Code *" }), _jsx("input", { type: "text", required: true, placeholder: "e.g. SUP-MAHA-01", value: supplierCode, onChange: (e) => setSupplierCode(e.target.value), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Supplier Name *" }), _jsx("input", { type: "text", required: true, placeholder: "e.g. Maharashtra Agro Feeds", value: name, onChange: (e) => setName(e.target.value), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Contact Person" }), _jsx("input", { type: "text", value: contactPerson, onChange: (e) => setContactPerson(e.target.value), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Phone Number *" }), _jsx("input", { type: "text", required: true, placeholder: "+91...", value: phoneNumber, onChange: (e) => setPhoneNumber(e.target.value), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "GSTIN" }), _jsx("input", { type: "text", placeholder: "27AAAAA0000A1Z5", value: gstNumber, onChange: (e) => setGstNumber(e.target.value), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Email" }), _jsx("input", { type: "email", value: email, onChange: (e) => setEmail(e.target.value), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Registered Address" }), _jsx("textarea", { rows: 2, value: address, onChange: (e) => setAddress(e.target.value), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { className: "flex justify-end gap-3 pt-3 border-t border-slate-100", children: [_jsx("button", { type: "button", onClick: () => setIsModalOpen(false), className: "px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 active:scale-95 transition-all", children: "Cancel" }), _jsx("button", { type: "submit", disabled: saving, className: "clay-btn-brand px-6 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl text-xs font-extrabold shadow-clay-button disabled:opacity-50 active:scale-95 transition-all", children: saving ? 'Registering...' : 'Register Supplier' })] })] })] }) }))] }));
};
//# sourceMappingURL=SupplierList.js.map