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
    return (_jsxs("div", { className: "supplier-list p-6 bg-white rounded-lg shadow", children: [_jsxs("div", { className: "flex justify-between items-center mb-6", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-bold text-gray-800", children: "Cattle Feed Suppliers" }), _jsx("p", { className: "text-sm text-gray-500", children: "Manage procurement vendors, GSTIN credentials, and outstanding payable balances" })] }), _jsx("button", { onClick: () => setIsModalOpen(true), className: "bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 rounded-md shadow text-sm", children: "+ Register Supplier" })] }), error && (_jsx("div", { className: "bg-red-50 text-red-700 p-4 rounded-md mb-4 text-sm border border-red-200", children: error })), loading ? (_jsx("div", { className: "text-center py-12 text-gray-500 text-sm", children: "Loading suppliers..." })) : suppliers.length === 0 ? (_jsx("div", { className: "text-center py-12 bg-gray-50 rounded text-gray-500 text-sm", children: "No registered feed suppliers found." })) : (_jsx("div", { className: "overflow-x-auto border border-gray-200 rounded-lg", children: _jsxs("table", { className: "min-w-full divide-y divide-gray-200 text-sm text-left", children: [_jsx("thead", { className: "bg-gray-50 text-gray-600 font-semibold text-xs uppercase tracking-wider", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3", children: "Code" }), _jsx("th", { className: "px-4 py-3", children: "Supplier Name" }), _jsx("th", { className: "px-4 py-3", children: "Contact Person" }), _jsx("th", { className: "px-4 py-3", children: "Phone & Email" }), _jsx("th", { className: "px-4 py-3", children: "GSTIN / PAN" }), _jsx("th", { className: "px-4 py-3", children: "Outstanding Balance" }), _jsx("th", { className: "px-4 py-3", children: "Status" })] }) }), _jsx("tbody", { className: "bg-white divide-y divide-gray-200", children: suppliers.map((s) => (_jsxs("tr", { className: "hover:bg-gray-50", children: [_jsx("td", { className: "px-4 py-3 font-mono font-bold text-gray-800", children: s.supplierCode }), _jsx("td", { className: "px-4 py-3 font-semibold text-gray-900", children: s.name }), _jsx("td", { className: "px-4 py-3 text-gray-600", children: s.contactPerson || '-' }), _jsxs("td", { className: "px-4 py-3 text-gray-600", children: [_jsx("div", { children: s.phoneNumber }), s.email && _jsx("div", { className: "text-xs text-gray-400", children: s.email })] }), _jsxs("td", { className: "px-4 py-3 font-mono text-xs text-gray-600", children: [_jsx("div", { children: s.gstNumber || '-' }), s.panNumber && _jsx("div", { className: "text-gray-400", children: s.panNumber })] }), _jsxs("td", { className: "px-4 py-3 font-bold text-rose-700", children: ["\u20B9", Number(s.outstandingBalance).toFixed(2)] }), _jsx("td", { className: "px-4 py-3", children: _jsx("span", { className: `inline-block px-2 py-0.5 rounded text-xs font-semibold ${s.status === 'ACTIVE'
                                                ? 'bg-emerald-100 text-emerald-800'
                                                : 'bg-gray-100 text-gray-800'}`, children: s.status }) })] }, s.id))) })] }) })), isModalOpen && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4", children: _jsxs("div", { className: "bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden", children: [_jsxs("div", { className: "px-6 py-4 bg-gray-50 border-b flex justify-between items-center", children: [_jsx("h3", { className: "font-bold text-gray-800", children: "Register Feed Supplier" }), _jsx("button", { onClick: () => setIsModalOpen(false), className: "text-gray-400 hover:text-gray-600 font-bold text-xl", children: "\u00D7" })] }), _jsxs("form", { onSubmit: handleCreate, className: "p-6 space-y-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Supplier Code *" }), _jsx("input", { type: "text", required: true, placeholder: "e.g. SUP-MAHA-01", value: supplierCode, onChange: (e) => setSupplierCode(e.target.value), className: "w-full border rounded px-3 py-2 text-sm font-mono uppercase" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Supplier Name *" }), _jsx("input", { type: "text", required: true, placeholder: "e.g. Maharashtra Agro Feeds", value: name, onChange: (e) => setName(e.target.value), className: "w-full border rounded px-3 py-2 text-sm" })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Contact Person" }), _jsx("input", { type: "text", value: contactPerson, onChange: (e) => setContactPerson(e.target.value), className: "w-full border rounded px-3 py-2 text-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Phone Number *" }), _jsx("input", { type: "text", required: true, placeholder: "+91...", value: phoneNumber, onChange: (e) => setPhoneNumber(e.target.value), className: "w-full border rounded px-3 py-2 text-sm" })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "GSTIN" }), _jsx("input", { type: "text", placeholder: "27AAAAA0000A1Z5", value: gstNumber, onChange: (e) => setGstNumber(e.target.value), className: "w-full border rounded px-3 py-2 text-sm font-mono uppercase" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Email" }), _jsx("input", { type: "email", value: email, onChange: (e) => setEmail(e.target.value), className: "w-full border rounded px-3 py-2 text-sm" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-700 mb-1", children: "Registered Address" }), _jsx("textarea", { rows: 2, value: address, onChange: (e) => setAddress(e.target.value), className: "w-full border rounded px-3 py-2 text-sm" })] }), _jsxs("div", { className: "flex justify-end gap-3 pt-3 border-t", children: [_jsx("button", { type: "button", onClick: () => setIsModalOpen(false), className: "px-4 py-2 border rounded text-sm text-gray-700", children: "Cancel" }), _jsx("button", { type: "submit", disabled: saving, className: "px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-bold disabled:opacity-50", children: saving ? 'Registering...' : 'Register Supplier' })] })] })] }) }))] }));
};
//# sourceMappingURL=SupplierList.js.map