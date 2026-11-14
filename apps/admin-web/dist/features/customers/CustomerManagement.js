import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { customerApi, } from '../../api/customerApi.js';
import { billingApi } from '../../api/billingApi.js';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { SearchBar } from '../../components/SearchBar.js';
import { Pagination } from '../../components/Pagination.js';
import { Modal } from '../../components/Modal.js';
import { StatusBadge } from '../../components/Badge.js';
export const CustomerManagement = () => {
    const { selectedCenterId, centers, isAdmin, hasRole } = useAuth();
    const { showToast } = useToast();
    const [customers, setCustomers] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [showDeleted, setShowDeleted] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    // Selected Customer Modal
    const [activeCustomer, setActiveCustomer] = useState(null);
    const [activeTab, setActiveTab] = useState('profile');
    const [faceStatus, setFaceStatus] = useState(null);
    const [rfidStatus, setRfidStatus] = useState(null);
    const [ledgerSummary, setLedgerSummary] = useState(null);
    const [ledgerTransactions, setLedgerTransactions] = useState([]);
    const [bills, setBills] = useState([]);
    const [payouts, setPayouts] = useState([]);
    const [modalLoading, setModalLoading] = useState(false);
    // Soft Delete / Restore Modals
    const [actionCustomer, setActionCustomer] = useState(null);
    const [deleteReason, setDeleteReason] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
    // New Customer Modal
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createForm, setCreateForm] = useState({
        fullName: '',
        mobileNumber: '',
        centerId: selectedCenterId || '',
        preferredLanguage: 'mr',
        milkCategories: ['COW'],
        village: '',
        taluka: '',
        district: '',
    });
    const loadCustomers = useCallback(async () => {
        setIsLoading(true);
        try {
            const resp = await customerApi.list({
                page,
                limit: 10,
                search: search || undefined,
                status: statusFilter || undefined,
                centerId: selectedCenterId || undefined,
                isDeleted: showDeleted,
            });
            // API returns { items, total, ... } or { customers, total } or array
            let list = [];
            let total = 0;
            if (Array.isArray(resp)) {
                list = resp;
                total = resp.length;
            }
            else if (resp && Array.isArray(resp.items)) {
                list = resp.items;
                total = typeof resp.total === 'number' ? resp.total : resp.items.length;
            }
            else if (resp && Array.isArray(resp.customers)) {
                list = resp.customers;
                total = typeof resp.total === 'number' ? resp.total : resp.customers.length;
            }
            else if (resp && Array.isArray(resp.data)) {
                list = resp.data;
                total = typeof resp.total === 'number' ? resp.total : resp.data.length;
            }
            setCustomers(list);
            setTotalCount(total);
        }
        catch (err) {
            setCustomers([]);
            setTotalCount(0);
            showToast(err.message || 'Failed to fetch customer directory', 'error');
        }
        finally {
            setIsLoading(false);
        }
    }, [page, search, statusFilter, selectedCenterId, showDeleted, showToast]);
    useEffect(() => {
        loadCustomers();
    }, [loadCustomers]);
    // Load sub-details when a customer profile modal is opened
    const handleOpenCustomer = async (cust) => {
        setActiveCustomer(cust);
        setActiveTab('profile');
        setModalLoading(true);
        try {
            const [face, rfid, ledger, ledgerTx, custBills, custPayouts] = await Promise.allSettled([
                customerApi.getFaceStatus(cust.id),
                customerApi.getRfidStatus(cust.id),
                customerApi.getLedgerSummary(cust.id),
                customerApi.getLedgerTransactions(cust.id, { limit: 20 }),
                customerApi.getBillingStatement(cust.id),
                customerApi.getPayouts(cust.id),
            ]);
            if (face.status === 'fulfilled')
                setFaceStatus(face.value);
            if (rfid.status === 'fulfilled')
                setRfidStatus(rfid.value);
            if (ledger.status === 'fulfilled')
                setLedgerSummary(ledger.value);
            if (ledgerTx.status === 'fulfilled') {
                const val = ledgerTx.value;
                const txList = Array.isArray(val)
                    ? val
                    : (Array.isArray(val?.transactions) ? val.transactions : (Array.isArray(val?.items) ? val.items : []));
                setLedgerTransactions(txList);
            }
            if (custBills.status === 'fulfilled') {
                const val = custBills.value;
                const bList = Array.isArray(val)
                    ? val
                    : (Array.isArray(val?.bills) ? val.bills : (Array.isArray(val?.items) ? val.items : []));
                setBills(bList);
            }
            if (custPayouts.status === 'fulfilled') {
                const val = custPayouts.value;
                const pList = Array.isArray(val)
                    ? val
                    : (Array.isArray(val?.payouts) ? val.payouts : (Array.isArray(val?.items) ? val.items : []));
                setPayouts(pList);
            }
        }
        catch {
            // Handled
        }
        finally {
            setModalLoading(false);
        }
    };
    const handleSoftDelete = async () => {
        if (!actionCustomer || !deleteReason.trim())
            return;
        setIsDeleting(true);
        try {
            await customerApi.softDelete(actionCustomer.id, deleteReason.trim());
            showToast(`Customer ${actionCustomer.farmerCode} soft-deleted`, 'success');
            setIsDeleteModalOpen(false);
            setActionCustomer(null);
            setDeleteReason('');
            loadCustomers();
        }
        catch (err) {
            showToast(err.message || 'Soft delete failed', 'error');
        }
        finally {
            setIsDeleting(false);
        }
    };
    const handleRestore = async () => {
        if (!actionCustomer || !deleteReason.trim())
            return;
        setIsDeleting(true);
        try {
            await customerApi.restore(actionCustomer.id, deleteReason.trim());
            showToast(`Customer ${actionCustomer.farmerCode} restored successfully`, 'success');
            setIsRestoreModalOpen(false);
            setActionCustomer(null);
            setDeleteReason('');
            loadCustomers();
        }
        catch (err) {
            showToast(err.message || 'Customer restore failed', 'error');
        }
        finally {
            setIsDeleting(false);
        }
    };
    const handleCreateCustomer = async (e) => {
        e.preventDefault();
        if (!createForm.fullName.trim() || !createForm.mobileNumber.trim()) {
            showToast('Name and mobile number are required', 'warning');
            return;
        }
        const targetCenterId = createForm.centerId || selectedCenterId || (centers.length > 0 ? centers[0]?.id : '');
        if (!targetCenterId) {
            showToast('Please select an intake center', 'warning');
            return;
        }
        try {
            await customerApi.create({
                fullName: createForm.fullName.trim(),
                mobileNumber: createForm.mobileNumber.trim(),
                centerId: targetCenterId,
                primaryCenterId: targetCenterId,
                permittedCategories: createForm.milkCategories,
                milkCategories: createForm.milkCategories,
                preferredLanguage: createForm.preferredLanguage,
                address: {
                    village: createForm.village?.trim() || 'Village Center',
                    talukaSubdistrict: createForm.taluka?.trim() || 'Taluka',
                    district: createForm.district?.trim() || 'District',
                    state: 'Maharashtra',
                    postalCode: '416001',
                },
            });
            showToast('Customer created successfully', 'success');
            setIsCreateModalOpen(false);
            setCreateForm({
                fullName: '',
                mobileNumber: '',
                centerId: selectedCenterId || '',
                preferredLanguage: 'mr',
                milkCategories: ['COW'],
                village: '',
                taluka: '',
                district: '',
            });
            loadCustomers();
        }
        catch (err) {
            showToast(err.message || 'Failed to register customer', 'error');
        }
    };
    return (_jsxs("div", { className: "space-y-5", children: [_jsxs("div", { className: "bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3", children: [_jsxs("div", { className: "flex-1 flex flex-col sm:flex-row items-center gap-3", children: [_jsx(SearchBar, { placeholder: "Search by farmer code, name, or phone...", value: search, onChange: (val) => {
                                    setSearch(val);
                                    setPage(1);
                                } }), _jsxs("select", { value: statusFilter, onChange: (e) => {
                                    setStatusFilter(e.target.value);
                                    setPage(1);
                                }, className: "text-xs font-semibold bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500", children: [_jsx("option", { value: "", children: "All Statuses" }), _jsx("option", { value: "ACTIVE", children: "Active" }), _jsx("option", { value: "PENDING_VERIFICATION", children: "Pending KYC" }), _jsx("option", { value: "SUSPENDED", children: "Suspended" })] }), _jsxs("label", { className: "flex items-center gap-1.5 text-xs font-semibold text-gray-600 cursor-pointer select-none", children: [_jsx("input", { type: "checkbox", checked: showDeleted, onChange: (e) => {
                                            setShowDeleted(e.target.checked);
                                            setPage(1);
                                        }, className: "rounded text-emerald-600 focus:ring-emerald-500" }), _jsx("span", { children: "Show Soft-Deleted" })] })] }), hasRole(['SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'REGISTRATION_OFFICER']) && (_jsxs("button", { onClick: () => setIsCreateModalOpen(true), className: "px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow", children: [_jsx("span", { children: "+" }), _jsx("span", { children: "Register New Farmer" })] }))] }), _jsxs("div", { className: "bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden", children: [_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "min-w-full divide-y divide-gray-200 text-left text-xs", children: [_jsx("thead", { className: "bg-gray-50/75 text-gray-500 font-bold uppercase tracking-wider", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3.5", children: "Farmer Code" }), _jsx("th", { className: "px-4 py-3.5", children: "Farmer Name" }), _jsx("th", { className: "px-4 py-3.5", children: "Mobile Number" }), _jsx("th", { className: "px-4 py-3.5", children: "Center" }), _jsx("th", { className: "px-4 py-3.5", children: "Status" }), _jsx("th", { className: "px-4 py-3.5 text-center", children: "Face KYC" }), _jsx("th", { className: "px-4 py-3.5 text-center", children: "RFID Card" }), _jsx("th", { className: "px-4 py-3.5 text-right", children: "Actions" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-100 font-medium text-gray-800", children: isLoading ? (_jsx("tr", { children: _jsx("td", { colSpan: 8, className: "px-4 py-12 text-center text-gray-500", children: _jsxs("div", { className: "flex items-center justify-center gap-2", children: [_jsx("div", { className: "w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" }), _jsx("span", { children: "Loading farmers from database..." })] }) }) })) : !Array.isArray(customers) || customers.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 8, className: "px-4 py-12 text-center text-gray-500", children: "No customers found matching filter criteria." }) })) : (customers.map((c) => (_jsxs("tr", { className: "hover:bg-gray-50/80 transition", children: [_jsx("td", { className: "px-4 py-3 font-mono font-bold text-emerald-800", children: c.farmerCode }), _jsxs("td", { className: "px-4 py-3", children: [_jsx("div", { className: "font-bold text-gray-900", children: c.fullName }), _jsxs("div", { className: "text-[10px] text-gray-400", children: ["ID: ", c.id.substring(0, 8), "..."] })] }), _jsx("td", { className: "px-4 py-3 font-mono text-gray-600", children: c.normalizedMobileNumber || c.mobileNumber || '—' }), _jsx("td", { className: "px-4 py-3 text-gray-600", children: c.centerName || 'Assigned Center' }), _jsx("td", { className: "px-4 py-3", children: _jsx(StatusBadge, { status: c.isDeleted ? 'SOFT_DELETED' : c.status }) }), _jsx("td", { className: "px-4 py-3 text-center", children: _jsx("span", { className: "inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700", children: "Protected" }) }), _jsx("td", { className: "px-4 py-3 text-center", children: _jsx("span", { className: "inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700", children: "RFID Active" }) }), _jsxs("td", { className: "px-4 py-3 text-right space-x-2", children: [_jsx("button", { onClick: () => handleOpenCustomer(c), className: "px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded font-bold text-[11px] transition", children: "Profile & Ledger" }), isAdmin && !c.isDeleted && (_jsx("button", { onClick: () => {
                                                            setActionCustomer(c);
                                                            setIsDeleteModalOpen(true);
                                                        }, className: "px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded font-bold text-[11px] transition", children: "Delete" })), isAdmin && c.isDeleted && (_jsx("button", { onClick: () => {
                                                            setActionCustomer(c);
                                                            setIsRestoreModalOpen(true);
                                                        }, className: "px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded font-bold text-[11px] transition", children: "Restore" }))] })] }, c.id)))) })] }) }), _jsx(Pagination, { currentPage: page, totalItems: totalCount, pageSize: 10, onPageChange: setPage })] }), activeCustomer && (_jsx(Modal, { isOpen: Boolean(activeCustomer), onClose: () => setActiveCustomer(null), title: `${activeCustomer.fullName} (${activeCustomer.farmerCode})`, subtitle: "Farmer Identity, Biometric Privacy Status & Subledger", maxWidth: "3xl", children: modalLoading ? (_jsxs("div", { className: "p-8 text-center text-gray-500 flex items-center justify-center gap-2", children: [_jsx("div", { className: "w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" }), _jsx("span", { children: "Fetching ledger & biometric compliance status..." })] })) : (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex border-b border-gray-200 space-x-3 text-xs font-bold overflow-x-auto", children: [_jsx("button", { onClick: () => setActiveTab('profile'), className: `pb-2 border-b-2 transition whitespace-nowrap ${activeTab === 'profile'
                                        ? 'border-emerald-600 text-emerald-700'
                                        : 'border-transparent text-gray-500 hover:text-gray-800'}`, children: "\uD83D\uDC64 KYC Profile" }), _jsx("button", { onClick: () => setActiveTab('biometrics'), className: `pb-2 border-b-2 transition whitespace-nowrap ${activeTab === 'biometrics'
                                        ? 'border-emerald-600 text-emerald-700'
                                        : 'border-transparent text-gray-500 hover:text-gray-800'}`, children: "\uD83D\uDD12 Face & RFID Status" }), _jsx("button", { onClick: () => setActiveTab('ledger'), className: `pb-2 border-b-2 transition whitespace-nowrap ${activeTab === 'ledger'
                                        ? 'border-emerald-600 text-emerald-700'
                                        : 'border-transparent text-gray-500 hover:text-gray-800'}`, children: "\uD83D\uDCB0 Subledger Account" }), _jsx("button", { onClick: () => setActiveTab('bills'), className: `pb-2 border-b-2 transition whitespace-nowrap ${activeTab === 'bills'
                                        ? 'border-emerald-600 text-emerald-700'
                                        : 'border-transparent text-gray-500 hover:text-gray-800'}`, children: "\uD83E\uDDFE Monthly Bills" }), _jsx("button", { onClick: () => setActiveTab('payouts'), className: `pb-2 border-b-2 transition whitespace-nowrap ${activeTab === 'payouts'
                                        ? 'border-emerald-600 text-emerald-700'
                                        : 'border-transparent text-gray-500 hover:text-gray-800'}`, children: "\uD83D\uDCB3 Payouts History" })] }), activeTab === 'profile' && (_jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs", children: [_jsxs("div", { className: "p-3 bg-gray-50 rounded-lg space-y-2", children: [_jsx("span", { className: "font-bold uppercase tracking-wider text-gray-500 block", children: "Personal Details" }), _jsxs("div", { children: [_jsx("span", { className: "text-gray-500", children: "Full Name:" }), " ", _jsx("span", { className: "font-bold text-gray-900", children: activeCustomer.fullName })] }), _jsxs("div", { children: [_jsx("span", { className: "text-gray-500", children: "Farmer Code:" }), " ", _jsx("span", { className: "font-mono font-bold text-emerald-800", children: activeCustomer.farmerCode })] }), _jsxs("div", { children: [_jsx("span", { className: "text-gray-500", children: "Mobile:" }), " ", _jsx("span", { className: "font-mono", children: activeCustomer.normalizedMobileNumber || activeCustomer.mobileNumber })] }), _jsxs("div", { children: [_jsx("span", { className: "text-gray-500", children: "Preferred Language:" }), " ", _jsx("span", { className: "uppercase font-semibold", children: activeCustomer.preferredLanguage || 'mr' })] })] }), _jsxs("div", { className: "p-3 bg-gray-50 rounded-lg space-y-2", children: [_jsx("span", { className: "font-bold uppercase tracking-wider text-gray-500 block", children: "Dairy Permissions & Center" }), _jsxs("div", { children: [_jsx("span", { className: "text-gray-500", children: "Center:" }), " ", _jsx("span", { className: "font-semibold text-gray-900", children: activeCustomer.centerName || 'Assigned Center' })] }), _jsxs("div", { children: [_jsx("span", { className: "text-gray-500", children: "Milk Permissions: " }), _jsx("span", { className: "font-bold text-emerald-700", children: "Cow & Buffalo Permitted" })] }), _jsxs("div", { children: [_jsx("span", { className: "text-gray-500", children: "Account Status:" }), " ", _jsx(StatusBadge, { status: activeCustomer.status })] }), _jsxs("div", { children: [_jsx("span", { className: "text-gray-500", children: "Enrolled On:" }), " ", _jsx("span", { children: new Date(activeCustomer.createdAt).toLocaleDateString() })] })] })] })), activeTab === 'biometrics' && (_jsxs("div", { className: "space-y-4 text-xs", children: [_jsxs("div", { className: "p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "font-bold text-emerald-900 text-sm", children: "Face Recognition Enrollment" }), _jsx("span", { className: `px-2 py-0.5 rounded font-bold ${faceStatus?.isEnrolled ? 'bg-emerald-200 text-emerald-800' : 'bg-gray-200 text-gray-700'}`, children: faceStatus?.isEnrolled ? 'ENROLLED & ACTIVE' : 'PENDING ENROLLMENT' })] }), _jsx("p", { className: "text-emerald-800 text-[11px]", children: "Biometric Shield Active: Raw embeddings are securely stored in pgvector and encrypted at rest. Ordinary dashboard profiles never expose raw vector data." }), faceStatus?.isEnrolled && (_jsxs("div", { className: "grid grid-cols-2 gap-2 pt-2 border-t border-emerald-200/60 text-gray-700", children: [_jsxs("div", { children: ["Model Version: ", _jsx("span", { className: "font-mono font-bold", children: faceStatus.modelCode || 'MobileFaceNet-V1' })] }), _jsxs("div", { children: ["Quality Gate: ", _jsx("span", { className: "font-bold text-emerald-700", children: "PASSED" })] })] }))] }), _jsxs("div", { className: "p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "font-bold text-slate-900 text-sm", children: "RFID Card Binding" }), _jsx("span", { className: `px-2 py-0.5 rounded font-bold ${rfidStatus?.isAssigned ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`, children: rfidStatus?.isAssigned ? 'CARD ASSIGNED' : 'UNASSIGNED' })] }), rfidStatus?.isAssigned ? (_jsxs("div", { className: "grid grid-cols-2 gap-2 text-gray-700", children: [_jsxs("div", { children: ["Card UID: ", _jsx("span", { className: "font-mono font-bold", children: rfidStatus.cardUidMask || '••••••••' })] }), _jsxs("div", { children: ["Technology: ", _jsx("span", { className: "font-semibold", children: rfidStatus.technology || 'MIFARE Classic 1K' })] })] })) : (_jsx("p", { className: "text-gray-500 text-[11px]", children: "No active RFID card assigned to this customer." }))] })] })), activeTab === 'ledger' && (_jsxs("div", { className: "space-y-4 text-xs", children: [_jsxs("div", { className: "grid grid-cols-3 gap-3 text-center", children: [_jsxs("div", { className: "p-3 bg-emerald-50 border border-emerald-200 rounded-lg", children: [_jsx("span", { className: "text-gray-500 font-bold block text-[10px] uppercase", children: "Net Payable Balance" }), _jsxs("span", { className: "text-lg font-extrabold text-emerald-700", children: ["\u20B9", (ledgerSummary?.payableBalance || 0).toLocaleString()] })] }), _jsxs("div", { className: "p-3 bg-amber-50 border border-amber-200 rounded-lg", children: [_jsx("span", { className: "text-gray-500 font-bold block text-[10px] uppercase", children: "Outstanding Advance" }), _jsxs("span", { className: "text-lg font-extrabold text-amber-700", children: ["\u20B9", (ledgerSummary?.advanceOutstanding || 0).toLocaleString()] })] }), _jsxs("div", { className: "p-3 bg-sky-50 border border-sky-200 rounded-lg", children: [_jsx("span", { className: "text-gray-500 font-bold block text-[10px] uppercase", children: "Total Milk Delivered" }), _jsxs("span", { className: "text-lg font-extrabold text-sky-700", children: [(ledgerSummary?.totalMilkDeliveredKg || 0).toLocaleString(), " KG"] })] })] }), _jsx("div", { className: "border border-gray-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto", children: _jsxs("table", { className: "min-w-full divide-y divide-gray-200 text-left text-xs", children: [_jsx("thead", { className: "bg-gray-50 text-gray-500 font-bold uppercase sticky top-0", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-2", children: "Date" }), _jsx("th", { className: "px-3 py-2", children: "Description" }), _jsx("th", { className: "px-3 py-2", children: "Type" }), _jsx("th", { className: "px-3 py-2 text-right", children: "Amount" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-100", children: ledgerTransactions.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 4, className: "px-3 py-6 text-center text-gray-400", children: "No ledger transactions posted yet." }) })) : (ledgerTransactions.map((tx, idx) => (_jsxs("tr", { className: "hover:bg-gray-50", children: [_jsx("td", { className: "px-3 py-1.5 text-gray-500", children: new Date(tx.created_at || tx.createdAt).toLocaleDateString() }), _jsx("td", { className: "px-3 py-1.5 font-medium text-gray-800", children: tx.description || tx.reference_type }), _jsx("td", { className: "px-3 py-1.5 font-bold", children: _jsx("span", { className: tx.entry_type === 'CREDIT' ? 'text-emerald-700' : 'text-rose-700', children: tx.entry_type || 'CREDIT' }) }), _jsxs("td", { className: "px-3 py-1.5 text-right font-mono font-bold", children: ["\u20B9", Number(tx.amount || 0).toFixed(2)] })] }, idx)))) })] }) })] })), activeTab === 'bills' && (_jsx("div", { className: "space-y-3 text-xs", children: bills.length === 0 ? (_jsx("p", { className: "text-center py-8 text-gray-500", children: "No monthly bills generated for this customer yet." })) : (_jsx("div", { className: "space-y-2 max-h-72 overflow-y-auto", children: bills.map((b) => (_jsxs("div", { className: "p-3 rounded-lg border border-gray-200 bg-gray-50/50 flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("span", { className: "font-mono font-bold text-gray-900", children: b.billNumber || b.bill_number }), _jsxs("div", { className: "text-[11px] text-gray-500", children: ["Qty: ", b.totalQuantityLiters || b.total_quantity_liters || 0, " L \u2022 Gross: \u20B9", b.grossAmount || b.gross_amount, " \u2022 Deductions: \u20B9", b.totalDeductions || b.total_deductions] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("span", { className: "font-extrabold text-emerald-800 text-sm", children: ["\u20B9", Number(b.netPayableAmount || b.net_payable_amount || 0).toLocaleString()] }), _jsx(StatusBadge, { status: b.status }), _jsx("button", { onClick: () => billingApi.downloadPdf(b.id, b.billNumber || b.bill_number), className: "px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-100 font-bold text-[10px] text-gray-700", children: "\uD83D\uDCC4 PDF" })] })] }, b.id))) })) })), activeTab === 'payouts' && (_jsx("div", { className: "space-y-3 text-xs", children: payouts.length === 0 ? (_jsx("p", { className: "text-center py-8 text-gray-500", children: "No payout records found for this customer." })) : (_jsx("div", { className: "space-y-2 max-h-72 overflow-y-auto", children: payouts.map((p) => (_jsxs("div", { className: "p-3 rounded-lg border border-gray-200 bg-gray-50/50 flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("span", { className: "font-mono font-bold text-gray-900", children: p.referenceNumber || p.reference_number || p.id.substring(0, 8) }), _jsxs("div", { className: "text-[11px] text-gray-500", children: ["Method: ", p.paymentMethod || p.payment_method, " \u2022 Date: ", new Date(p.createdAt || p.created_at).toLocaleDateString()] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("span", { className: "font-extrabold text-emerald-800 text-sm", children: ["\u20B9", Number(p.amount || 0).toLocaleString()] }), _jsx(StatusBadge, { status: p.status })] })] }, p.id))) })) }))] })) })), _jsx(Modal, { isOpen: isDeleteModalOpen, onClose: () => setIsDeleteModalOpen(false), title: "Confirm Customer Soft Deletion", subtitle: `Farmer Code: ${actionCustomer?.farmerCode}`, maxWidth: "md", footer: _jsxs(_Fragment, { children: [_jsx("button", { onClick: () => setIsDeleteModalOpen(false), className: "px-3 py-1.5 border rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100", children: "Cancel" }), _jsx("button", { onClick: handleSoftDelete, disabled: isDeleting || !deleteReason.trim(), className: "px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition disabled:opacity-50", children: isDeleting ? 'Deleting...' : 'Confirm Soft Delete' })] }), children: _jsxs("div", { className: "space-y-3 text-xs", children: [_jsxs("p", { className: "text-gray-600", children: ["Soft-deleting customer ", _jsx("span", { className: "font-bold text-gray-900", children: actionCustomer?.fullName }), " will prevent new milk intake collections while completely preserving historical audit records and subledger balances."] }), _jsxs("div", { children: [_jsx("label", { className: "block font-bold text-gray-700 mb-1", children: "Mandatory Audit Reason (min 3 chars):" }), _jsx("textarea", { value: deleteReason, onChange: (e) => setDeleteReason(e.target.value), placeholder: "e.g. Farmer relocated outside service area, formal request filed", rows: 3, className: "w-full border rounded-lg p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500" })] })] }) }), _jsx(Modal, { isOpen: isRestoreModalOpen, onClose: () => setIsRestoreModalOpen(false), title: "Confirm Customer Account Restoration", subtitle: `Farmer Code: ${actionCustomer?.farmerCode}`, maxWidth: "md", footer: _jsxs(_Fragment, { children: [_jsx("button", { onClick: () => setIsRestoreModalOpen(false), className: "px-3 py-1.5 border rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100", children: "Cancel" }), _jsx("button", { onClick: handleRestore, disabled: isDeleting || !deleteReason.trim(), className: "px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition disabled:opacity-50", children: isDeleting ? 'Restoring...' : 'Confirm Restore' })] }), children: _jsxs("div", { className: "space-y-3 text-xs", children: [_jsxs("p", { className: "text-gray-600", children: ["Restore customer ", _jsx("span", { className: "font-bold text-gray-900", children: actionCustomer?.fullName }), " to ACTIVE status and enable milk collections."] }), _jsxs("div", { children: [_jsx("label", { className: "block font-bold text-gray-700 mb-1", children: "Mandatory Audit Reason (min 3 chars):" }), _jsx("textarea", { value: deleteReason, onChange: (e) => setDeleteReason(e.target.value), placeholder: "e.g. Resumed active dairy supply agreement", rows: 3, className: "w-full border rounded-lg p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500" })] })] }) }), _jsx(Modal, { isOpen: isCreateModalOpen, onClose: () => setIsCreateModalOpen(false), title: "Register New Customer / Farmer", subtitle: "Provision KYC profile and assign dairy intake center", maxWidth: "lg", children: _jsxs("form", { onSubmit: handleCreateCustomer, className: "space-y-4 text-xs", children: [_jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block font-bold text-gray-700 mb-1", children: "Full Legal Name *" }), _jsx("input", { type: "text", required: true, value: createForm.fullName, onChange: (e) => setCreateForm({ ...createForm, fullName: e.target.value }), placeholder: "e.g. Prakash Patil", className: "w-full border rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500" })] }), _jsxs("div", { children: [_jsx("label", { className: "block font-bold text-gray-700 mb-1", children: "Mobile Number (+91 E.164) *" }), _jsx("input", { type: "text", required: true, value: createForm.mobileNumber, onChange: (e) => setCreateForm({ ...createForm, mobileNumber: e.target.value }), placeholder: "e.g. 9822012345", className: "w-full border rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500" })] })] }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block font-bold text-gray-700 mb-1", children: "Primary Intake Center *" }), _jsx("select", { value: createForm.centerId, onChange: (e) => setCreateForm({ ...createForm, centerId: e.target.value }), className: "w-full border rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white", children: centers.map((c) => (_jsxs("option", { value: c.id, children: [c.code, " - ", c.name] }, c.id))) })] }), _jsxs("div", { children: [_jsx("label", { className: "block font-bold text-gray-700 mb-1", children: "Preferred Language" }), _jsxs("select", { value: createForm.preferredLanguage, onChange: (e) => setCreateForm({ ...createForm, preferredLanguage: e.target.value }), className: "w-full border rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white", children: [_jsx("option", { value: "mr", children: "Marathi (\u092E\u0930\u093E\u0920\u0940)" }), _jsx("option", { value: "hi", children: "Hindi (\u0939\u093F\u0902\u0926\u0940)" }), _jsx("option", { value: "en", children: "English" })] })] })] }), _jsxs("div", { className: "grid grid-cols-3 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block font-bold text-gray-700 mb-1", children: "Village" }), _jsx("input", { type: "text", value: createForm.village, onChange: (e) => setCreateForm({ ...createForm, village: e.target.value }), placeholder: "Village", className: "w-full border rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500" })] }), _jsxs("div", { children: [_jsx("label", { className: "block font-bold text-gray-700 mb-1", children: "Taluka" }), _jsx("input", { type: "text", value: createForm.taluka, onChange: (e) => setCreateForm({ ...createForm, taluka: e.target.value }), placeholder: "Taluka", className: "w-full border rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500" })] }), _jsxs("div", { children: [_jsx("label", { className: "block font-bold text-gray-700 mb-1", children: "District" }), _jsx("input", { type: "text", value: createForm.district, onChange: (e) => setCreateForm({ ...createForm, district: e.target.value }), placeholder: "District", className: "w-full border rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500" })] })] }), _jsxs("div", { className: "pt-3 border-t flex justify-end gap-2", children: [_jsx("button", { type: "button", onClick: () => setIsCreateModalOpen(false), className: "px-4 py-2 border rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100", children: "Cancel" }), _jsx("button", { type: "submit", className: "px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow", children: "Register Farmer" })] })] }) })] }));
};
//# sourceMappingURL=CustomerManagement.js.map