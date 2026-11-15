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
import { ClayButton } from '../../components/ClayButton.js';
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
    return (_jsxs("div", { className: "space-y-6 select-none", children: [_jsxs("div", { className: "clay-surface p-4 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4", children: [_jsxs("div", { className: "flex-1 flex flex-col sm:flex-row items-center gap-3", children: [_jsx(SearchBar, { placeholder: "Search by farmer code, name, or phone...", value: search, onChange: (val) => {
                                    setSearch(val);
                                    setPage(1);
                                } }), _jsxs("select", { value: statusFilter, onChange: (e) => {
                                    setStatusFilter(e.target.value);
                                    setPage(1);
                                }, className: "text-xs font-bold bg-[#EDF2F7] border border-slate-200/90 rounded-xl px-3.5 py-2.5 text-slate-700 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05),inset_-1.5px_-1.5px_3px_rgba(255,255,255,0.85)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer", children: [_jsx("option", { value: "", children: "All Statuses" }), _jsx("option", { value: "ACTIVE", children: "Active" }), _jsx("option", { value: "PENDING_VERIFICATION", children: "Pending KYC" }), _jsx("option", { value: "SUSPENDED", children: "Suspended" })] }), _jsxs("label", { className: "flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none px-2 py-1.5 rounded-xl hover:bg-slate-100 transition", children: [_jsx("input", { type: "checkbox", checked: showDeleted, onChange: (e) => {
                                            setShowDeleted(e.target.checked);
                                            setPage(1);
                                        }, className: "w-4 h-4 rounded text-emerald-600 focus:ring-[#00506E] cursor-pointer" }), _jsx("span", { children: "Show Soft-Deleted" })] })] }), hasRole(['SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'REGISTRATION_OFFICER']) && (_jsx(ClayButton, { variant: "brand", size: "sm", onClick: () => setIsCreateModalOpen(true), icon: _jsx("span", { className: "text-base font-bold", children: "+" }), children: _jsx("span", { children: "Register New Farmer" }) }))] }), _jsxs("div", { className: "clay-surface overflow-hidden", children: [_jsxs("div", { className: "px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50/70 to-white", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-base", children: "\uD83E\uDDD1\u200D\uD83C\uDF3E" }), _jsx("h3", { className: "text-sm font-extrabold text-slate-800 tracking-tight", children: "Customer Master Directory" })] }), _jsxs("span", { className: "text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#E6F4FA] text-[#00506E] border border-sky-200", children: [totalCount, " Total Farmers"] })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "min-w-full divide-y divide-slate-100 text-left text-xs", children: [_jsx("thead", { className: "bg-[#F8FAFC] text-slate-500 font-extrabold uppercase tracking-wider", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3.5", children: "Farmer Code" }), _jsx("th", { className: "px-4 py-3.5", children: "Farmer Name" }), _jsx("th", { className: "px-4 py-3.5", children: "Mobile Number" }), _jsx("th", { className: "px-4 py-3.5", children: "Center" }), _jsx("th", { className: "px-4 py-3.5", children: "Status" }), _jsx("th", { className: "px-4 py-3.5 text-center", children: "Face KYC" }), _jsx("th", { className: "px-4 py-3.5 text-center", children: "RFID Card" }), _jsx("th", { className: "px-4 py-3.5 text-right", children: "Actions" })] }) }), _jsx("tbody", { className: "divide-y divide-slate-100 font-semibold text-slate-700", children: isLoading ? (_jsx("tr", { children: _jsx("td", { colSpan: 8, className: "px-4 py-12 text-center text-slate-500", children: _jsxs("div", { className: "flex items-center justify-center gap-3", children: [_jsx("div", { className: "w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" }), _jsx("span", { className: "font-bold", children: "Loading farmers from database..." })] }) }) })) : !Array.isArray(customers) || customers.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 8, className: "px-4 py-12 text-center text-slate-500", children: _jsxs("div", { className: "flex flex-col items-center justify-center space-y-2", children: [_jsx("span", { className: "text-3xl", children: "\uD83D\uDD0D" }), _jsx("p", { className: "font-bold", children: "No customers found matching filter criteria." }), _jsx("p", { className: "text-[11px] text-slate-400", children: "Try modifying your search query or status filter." })] }) }) })) : (customers.map((c) => (_jsxs("tr", { className: "hover:bg-slate-50/80 transition-colors", children: [_jsx("td", { className: "px-4 py-3 font-mono font-black text-[#00506E]", children: c.farmerCode }), _jsxs("td", { className: "px-4 py-3", children: [_jsx("div", { className: "font-bold text-slate-900", children: c.fullName }), _jsxs("div", { className: "text-[10px] text-slate-400 font-mono", children: ["ID: ", c.id.substring(0, 8), "..."] })] }), _jsx("td", { className: "px-4 py-3 font-mono text-slate-600", children: c.normalizedMobileNumber || c.mobileNumber || '—' }), _jsx("td", { className: "px-4 py-3 text-slate-600 font-medium", children: c.centerName || 'Assigned Center' }), _jsx("td", { className: "px-4 py-3", children: _jsx(StatusBadge, { status: c.isDeleted ? 'SOFT_DELETED' : c.status }) }), _jsx("td", { className: "px-4 py-3 text-center", children: _jsx("span", { className: "inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#E6F4EA] text-[#137333] border border-emerald-200 shadow-sm", children: "Protected" }) }), _jsx("td", { className: "px-4 py-3 text-center", children: _jsx("span", { className: "inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#E8F0FE] text-[#1A73E8] border border-sky-200 shadow-sm", children: "RFID Active" }) }), _jsxs("td", { className: "px-4 py-3 text-right space-x-2", children: [_jsx("button", { onClick: () => handleOpenCustomer(c), className: "px-3 py-1 bg-white hover:bg-emerald-50 text-[#00506E] border border-slate-200 rounded-xl font-bold text-[11px] shadow-[0_2px_4px_rgba(0,0,0,0.04),inset_0_1px_1px_rgba(255,255,255,0.9)] hover:border-emerald-300 transition active:translate-y-0.5", children: "Profile & Ledger" }), isAdmin && !c.isDeleted && (_jsx("button", { onClick: () => {
                                                            setActionCustomer(c);
                                                            setIsDeleteModalOpen(true);
                                                        }, className: "px-3 py-1 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-xl font-bold text-[11px] shadow-[0_2px_4px_rgba(225,29,72,0.06),inset_0_1px_1px_rgba(255,255,255,0.9)] transition active:translate-y-0.5", children: "Delete" })), isAdmin && c.isDeleted && (_jsx("button", { onClick: () => {
                                                            setActionCustomer(c);
                                                            setIsRestoreModalOpen(true);
                                                        }, className: "px-3 py-1 bg-white hover:bg-sky-50 text-[#00506E] border border-sky-200 rounded-xl font-bold text-[11px] shadow-[0_2px_4px_rgba(0,80,110,0.06),inset_0_1px_1px_rgba(255,255,255,0.9)] transition active:translate-y-0.5", children: "Restore" }))] })] }, c.id)))) })] }) }), _jsx(Pagination, { currentPage: page, totalItems: totalCount, pageSize: 10, onPageChange: setPage })] }), activeCustomer && (_jsx(Modal, { isOpen: Boolean(activeCustomer), onClose: () => setActiveCustomer(null), title: `${activeCustomer.fullName} (${activeCustomer.farmerCode})`, subtitle: "Farmer Identity, Biometric Privacy Status & Subledger", maxWidth: "3xl", children: modalLoading ? (_jsxs("div", { className: "p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3", children: [_jsx("div", { className: "w-8 h-8 border-3 border-[#00506E] border-t-transparent rounded-full animate-spin" }), _jsx("span", { className: "font-bold text-xs uppercase tracking-wider", children: "Fetching ledger & biometric compliance status..." })] })) : (_jsxs("div", { className: "space-y-5", children: [_jsxs("div", { className: "flex border-b border-slate-100 space-x-2 text-xs font-bold overflow-x-auto pb-1", children: [_jsxs("button", { onClick: () => setActiveTab('profile'), className: `px-3.5 py-2 rounded-xl transition whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'profile'
                                        ? 'bg-[#00506E] text-white shadow-md'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`, children: [_jsx("span", { children: "\uD83D\uDC64" }), _jsx("span", { children: "KYC Profile" })] }), _jsxs("button", { onClick: () => setActiveTab('biometrics'), className: `px-3.5 py-2 rounded-xl transition whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'biometrics'
                                        ? 'bg-[#00506E] text-white shadow-md'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`, children: [_jsx("span", { children: "\uD83D\uDD12" }), _jsx("span", { children: "Face & RFID Status" })] }), _jsxs("button", { onClick: () => setActiveTab('ledger'), className: `px-3.5 py-2 rounded-xl transition whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'ledger'
                                        ? 'bg-[#00506E] text-white shadow-md'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`, children: [_jsx("span", { children: "\uD83D\uDCB0" }), _jsx("span", { children: "Subledger Account" })] }), _jsxs("button", { onClick: () => setActiveTab('bills'), className: `px-3.5 py-2 rounded-xl transition whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'bills'
                                        ? 'bg-[#00506E] text-white shadow-md'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`, children: [_jsx("span", { children: "\uD83E\uDDFE" }), _jsx("span", { children: "Monthly Bills" })] }), _jsxs("button", { onClick: () => setActiveTab('payouts'), className: `px-3.5 py-2 rounded-xl transition whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'payouts'
                                        ? 'bg-[#00506E] text-white shadow-md'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`, children: [_jsx("span", { children: "\uD83D\uDCB3" }), _jsx("span", { children: "Payouts History" })] })] }), activeTab === 'profile' && (_jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs", children: [_jsxs("div", { className: "p-4 bg-[#F8FAFC] rounded-2xl border border-slate-200/80 shadow-[inset_1px_1px_2px_rgba(15,23,42,0.03)] space-y-2.5", children: [_jsx("span", { className: "font-extrabold uppercase tracking-wider text-slate-500 block text-[10px]", children: "Personal Details" }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-slate-500 font-medium", children: "Full Name:" }), " ", _jsx("span", { className: "font-black text-slate-900", children: activeCustomer.fullName })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-slate-500 font-medium", children: "Farmer Code:" }), " ", _jsx("span", { className: "font-mono font-black text-[#00506E]", children: activeCustomer.farmerCode })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-slate-500 font-medium", children: "Mobile:" }), " ", _jsx("span", { className: "font-mono font-bold text-slate-800", children: activeCustomer.normalizedMobileNumber || activeCustomer.mobileNumber })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-slate-500 font-medium", children: "Preferred Language:" }), " ", _jsx("span", { className: "uppercase font-bold text-slate-800", children: activeCustomer.preferredLanguage || 'mr' })] })] }), _jsxs("div", { className: "p-4 bg-[#F8FAFC] rounded-2xl border border-slate-200/80 shadow-[inset_1px_1px_2px_rgba(15,23,42,0.03)] space-y-2.5", children: [_jsx("span", { className: "font-extrabold uppercase tracking-wider text-slate-500 block text-[10px]", children: "Dairy Permissions & Center" }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-slate-500 font-medium", children: "Center:" }), " ", _jsx("span", { className: "font-bold text-slate-900", children: activeCustomer.centerName || 'Assigned Center' })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-slate-500 font-medium", children: "Milk Permissions: " }), _jsx("span", { className: "font-black text-[#137333]", children: "Cow & Buffalo Permitted" })] }), _jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "text-slate-500 font-medium", children: "Account Status:" }), " ", _jsx(StatusBadge, { status: activeCustomer.status })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-slate-500 font-medium", children: "Enrolled On:" }), " ", _jsx("span", { className: "font-bold text-slate-700", children: new Date(activeCustomer.createdAt).toLocaleDateString() })] })] })] })), activeTab === 'biometrics' && (_jsxs("div", { className: "space-y-4 text-xs", children: [_jsxs("div", { className: "p-5 bg-gradient-to-br from-[#F2FBF6] to-white border border-emerald-200/90 rounded-2xl space-y-2.5 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9)]", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-lg", children: "\uD83D\uDEE1\uFE0F" }), _jsx("span", { className: "font-black text-emerald-950 text-sm", children: "Face Recognition Enrollment" })] }), _jsx("span", { className: `px-2.5 py-0.5 rounded-full font-black text-[10px] ${faceStatus?.isEnrolled ? 'bg-[#E6F4EA] text-[#137333] border border-emerald-300' : 'bg-slate-200 text-slate-700'}`, children: faceStatus?.isEnrolled ? 'ENROLLED & ACTIVE' : 'PENDING ENROLLMENT' })] }), _jsx("p", { className: "text-emerald-800 text-[11px] leading-relaxed", children: "Biometric Shield Active: Raw embeddings are securely stored in pgvector and encrypted at rest. Ordinary dashboard profiles never expose raw vector data." }), faceStatus?.isEnrolled && (_jsxs("div", { className: "grid grid-cols-2 gap-3 pt-3 border-t border-emerald-200/60 text-slate-700 font-bold", children: [_jsxs("div", { children: ["Model Version: ", _jsx("span", { className: "font-mono font-black text-slate-900", children: faceStatus.modelCode || 'MobileFaceNet-V1' })] }), _jsxs("div", { children: ["Quality Gate: ", _jsx("span", { className: "font-black text-[#137333]", children: "PASSED" })] })] }))] }), _jsxs("div", { className: "p-5 bg-gradient-to-br from-[#F5FAFF] to-white border border-sky-200/90 rounded-2xl space-y-2.5 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9)]", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-lg", children: "\uD83D\uDCB3" }), _jsx("span", { className: "font-black text-slate-900 text-sm", children: "RFID Card Binding" })] }), _jsx("span", { className: `px-2.5 py-0.5 rounded-full font-black text-[10px] ${rfidStatus?.isAssigned ? 'bg-[#E6F4EA] text-[#137333] border border-emerald-300' : 'bg-amber-100 text-amber-800'}`, children: rfidStatus?.isAssigned ? 'CARD ASSIGNED' : 'UNASSIGNED' })] }), rfidStatus?.isAssigned ? (_jsxs("div", { className: "grid grid-cols-2 gap-3 text-slate-700 font-bold", children: [_jsxs("div", { children: ["Card UID: ", _jsx("span", { className: "font-mono font-black text-slate-900", children: rfidStatus.cardUidMask || '••••••••' })] }), _jsxs("div", { children: ["Technology: ", _jsx("span", { className: "font-bold text-slate-800", children: rfidStatus.technology || 'MIFARE Classic 1K' })] })] })) : (_jsx("p", { className: "text-slate-500 text-[11px]", children: "No active RFID card assigned to this customer." }))] })] })), activeTab === 'ledger' && (_jsxs("div", { className: "space-y-4 text-xs", children: [_jsxs("div", { className: "grid grid-cols-3 gap-3 text-center", children: [_jsxs("div", { className: "p-3.5 bg-gradient-to-b from-[#F2FBF6] to-white border border-emerald-200/90 rounded-2xl shadow-sm", children: [_jsx("span", { className: "text-slate-500 font-black block text-[10px] uppercase tracking-wider", children: "Net Payable Balance" }), _jsxs("span", { className: "text-lg sm:text-xl font-black text-[#137333]", children: ["\u20B9", (ledgerSummary?.payableBalance || 0).toLocaleString()] })] }), _jsxs("div", { className: "p-3.5 bg-gradient-to-b from-[#FFFDF5] to-white border border-amber-200/90 rounded-2xl shadow-sm", children: [_jsx("span", { className: "text-slate-500 font-black block text-[10px] uppercase tracking-wider", children: "Outstanding Advance" }), _jsxs("span", { className: "text-lg sm:text-xl font-black text-[#B06000]", children: ["\u20B9", (ledgerSummary?.advanceOutstanding || 0).toLocaleString()] })] }), _jsxs("div", { className: "p-3.5 bg-gradient-to-b from-[#F5FAFF] to-white border border-sky-200/90 rounded-2xl shadow-sm", children: [_jsx("span", { className: "text-slate-500 font-black block text-[10px] uppercase tracking-wider", children: "Total Milk Delivered" }), _jsxs("span", { className: "text-lg sm:text-xl font-black text-[#1A73E8]", children: [(ledgerSummary?.totalMilkDeliveredKg || 0).toLocaleString(), " KG"] })] })] }), _jsx("div", { className: "border border-slate-200/80 rounded-2xl overflow-hidden max-h-60 overflow-y-auto", children: _jsxs("table", { className: "min-w-full divide-y divide-slate-100 text-left text-xs", children: [_jsx("thead", { className: "bg-[#F8FAFC] text-slate-500 font-black uppercase tracking-wider sticky top-0", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3.5 py-2.5", children: "Date" }), _jsx("th", { className: "px-3.5 py-2.5", children: "Description" }), _jsx("th", { className: "px-3.5 py-2.5", children: "Type" }), _jsx("th", { className: "px-3.5 py-2.5 text-right", children: "Amount" })] }) }), _jsx("tbody", { className: "divide-y divide-slate-100 font-semibold", children: ledgerTransactions.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 4, className: "px-3.5 py-8 text-center text-slate-400", children: "No ledger transactions posted yet." }) })) : (ledgerTransactions.map((tx, idx) => (_jsxs("tr", { className: "hover:bg-slate-50", children: [_jsx("td", { className: "px-3.5 py-2 text-slate-500", children: new Date(tx.created_at || tx.createdAt).toLocaleDateString() }), _jsx("td", { className: "px-3.5 py-2 font-bold text-slate-800", children: tx.description || tx.reference_type }), _jsx("td", { className: "px-3.5 py-2 font-black", children: _jsx("span", { className: tx.entry_type === 'CREDIT' ? 'text-[#137333]' : 'text-[#C5221F]', children: tx.entry_type || 'CREDIT' }) }), _jsxs("td", { className: "px-3.5 py-2 text-right font-mono font-black text-slate-900", children: ["\u20B9", Number(tx.amount || 0).toFixed(2)] })] }, idx)))) })] }) })] })), activeTab === 'bills' && (_jsx("div", { className: "space-y-3 text-xs", children: bills.length === 0 ? (_jsx("p", { className: "text-center py-8 text-slate-500 font-medium", children: "No monthly bills generated for this customer yet." })) : (_jsx("div", { className: "space-y-2.5 max-h-72 overflow-y-auto pr-1", children: bills.map((b) => (_jsxs("div", { className: "p-3.5 rounded-2xl border border-slate-200/90 bg-[#F8FAFC] flex items-center justify-between shadow-sm", children: [_jsxs("div", { children: [_jsx("span", { className: "font-mono font-black text-slate-900", children: b.billNumber || b.bill_number }), _jsxs("div", { className: "text-[11px] text-slate-500 font-medium mt-0.5", children: ["Qty: ", b.totalQuantityLiters || b.total_quantity_liters || 0, " L \u2022 Gross: \u20B9", b.grossAmount || b.gross_amount, " \u2022 Deductions: \u20B9", b.totalDeductions || b.total_deductions] })] }), _jsxs("div", { className: "flex items-center gap-2.5", children: [_jsxs("span", { className: "font-black text-[#137333] text-sm", children: ["\u20B9", Number(b.netPayableAmount || b.net_payable_amount || 0).toLocaleString()] }), _jsx(StatusBadge, { status: b.status }), _jsx("button", { onClick: () => billingApi.downloadPdf(b.id, b.billNumber || b.bill_number), className: "px-2.5 py-1 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 font-bold text-[10px] text-slate-700 shadow-sm", children: "\uD83D\uDCC4 PDF" })] })] }, b.id))) })) })), activeTab === 'payouts' && (_jsx("div", { className: "space-y-3 text-xs", children: payouts.length === 0 ? (_jsx("p", { className: "text-center py-8 text-slate-500 font-medium", children: "No payout records found for this customer." })) : (_jsx("div", { className: "space-y-2.5 max-h-72 overflow-y-auto pr-1", children: payouts.map((p) => (_jsxs("div", { className: "p-3.5 rounded-2xl border border-slate-200/90 bg-[#F8FAFC] flex items-center justify-between shadow-sm", children: [_jsxs("div", { children: [_jsx("span", { className: "font-mono font-black text-slate-900", children: p.referenceNumber || p.reference_number || p.id.substring(0, 8) }), _jsxs("div", { className: "text-[11px] text-slate-500 font-medium mt-0.5", children: ["Method: ", p.paymentMethod || p.payment_method, " \u2022 Date: ", new Date(p.createdAt || p.created_at).toLocaleDateString()] })] }), _jsxs("div", { className: "flex items-center gap-2.5", children: [_jsxs("span", { className: "font-black text-[#137333] text-sm", children: ["\u20B9", Number(p.amount || 0).toLocaleString()] }), _jsx(StatusBadge, { status: p.status })] })] }, p.id))) })) }))] })) })), _jsx(Modal, { isOpen: isDeleteModalOpen, onClose: () => setIsDeleteModalOpen(false), title: "Confirm Customer Soft Deletion", subtitle: `Farmer Code: ${actionCustomer?.farmerCode}`, maxWidth: "md", footer: _jsxs(_Fragment, { children: [_jsx(ClayButton, { variant: "secondary", size: "sm", onClick: () => setIsDeleteModalOpen(false), children: "Cancel" }), _jsx(ClayButton, { variant: "danger", size: "sm", onClick: handleSoftDelete, disabled: isDeleting || !deleteReason.trim(), isLoading: isDeleting, children: "Confirm Soft Delete" })] }), children: _jsxs("div", { className: "space-y-3.5 text-xs", children: [_jsxs("p", { className: "text-slate-600 font-medium leading-relaxed", children: ["Soft-deleting customer ", _jsx("span", { className: "font-black text-slate-900", children: actionCustomer?.fullName }), " will prevent new milk intake collections while completely preserving historical audit records and subledger balances."] }), _jsxs("div", { children: [_jsx("label", { className: "block font-black text-slate-700 mb-1.5 uppercase text-[10px] tracking-wider", children: "Mandatory Audit Reason (min 3 chars):" }), _jsx("textarea", { value: deleteReason, onChange: (e) => setDeleteReason(e.target.value), placeholder: "e.g. Farmer relocated outside service area, formal request filed", rows: 3, className: "w-full bg-[#EDF2F7] border border-slate-200/90 rounded-xl p-3 text-xs font-semibold shadow-[inset_2px_2px_4px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500" })] })] }) }), _jsx(Modal, { isOpen: isRestoreModalOpen, onClose: () => setIsRestoreModalOpen(false), title: "Confirm Customer Account Restoration", subtitle: `Farmer Code: ${actionCustomer?.farmerCode}`, maxWidth: "md", footer: _jsxs(_Fragment, { children: [_jsx(ClayButton, { variant: "secondary", size: "sm", onClick: () => setIsRestoreModalOpen(false), children: "Cancel" }), _jsx(ClayButton, { variant: "emerald", size: "sm", onClick: handleRestore, disabled: isDeleting || !deleteReason.trim(), isLoading: isDeleting, children: "Confirm Restore" })] }), children: _jsxs("div", { className: "space-y-3.5 text-xs", children: [_jsxs("p", { className: "text-slate-600 font-medium leading-relaxed", children: ["Restore customer ", _jsx("span", { className: "font-black text-slate-900", children: actionCustomer?.fullName }), " to ACTIVE status and enable milk collections."] }), _jsxs("div", { children: [_jsx("label", { className: "block font-black text-slate-700 mb-1.5 uppercase text-[10px] tracking-wider", children: "Mandatory Audit Reason (min 3 chars):" }), _jsx("textarea", { value: deleteReason, onChange: (e) => setDeleteReason(e.target.value), placeholder: "e.g. Resumed active dairy supply agreement", rows: 3, className: "w-full bg-[#EDF2F7] border border-slate-200/90 rounded-xl p-3 text-xs font-semibold shadow-[inset_2px_2px_4px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500" })] })] }) }), _jsx(Modal, { isOpen: isCreateModalOpen, onClose: () => setIsCreateModalOpen(false), title: "Register New Customer / Farmer", subtitle: "Provision KYC profile and assign dairy intake center", maxWidth: "lg", children: _jsxs("form", { onSubmit: handleCreateCustomer, className: "space-y-4 text-xs", children: [_jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3.5", children: [_jsxs("div", { children: [_jsx("label", { className: "block font-extrabold text-slate-700 mb-1 uppercase text-[10px] tracking-wider", children: "Full Legal Name *" }), _jsx("input", { type: "text", required: true, value: createForm.fullName, onChange: (e) => setCreateForm({ ...createForm, fullName: e.target.value }), placeholder: "e.g. Prakash Patil", className: "w-full bg-[#EDF2F7] border border-slate-200/90 rounded-xl p-2.5 text-xs font-semibold shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]" })] }), _jsxs("div", { children: [_jsx("label", { className: "block font-extrabold text-slate-700 mb-1 uppercase text-[10px] tracking-wider", children: "Mobile Number (+91 E.164) *" }), _jsx("input", { type: "text", required: true, value: createForm.mobileNumber, onChange: (e) => setCreateForm({ ...createForm, mobileNumber: e.target.value }), placeholder: "e.g. 9822012345", className: "w-full bg-[#EDF2F7] border border-slate-200/90 rounded-xl p-2.5 text-xs font-semibold shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]" })] })] }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3.5", children: [_jsxs("div", { children: [_jsx("label", { className: "block font-extrabold text-slate-700 mb-1 uppercase text-[10px] tracking-wider", children: "Primary Intake Center *" }), _jsx("select", { value: createForm.centerId, onChange: (e) => setCreateForm({ ...createForm, centerId: e.target.value }), className: "w-full bg-[#EDF2F7] border border-slate-200/90 rounded-xl p-2.5 text-xs font-semibold shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer", children: centers.map((c) => (_jsxs("option", { value: c.id, children: [c.code, " - ", c.name] }, c.id))) })] }), _jsxs("div", { children: [_jsx("label", { className: "block font-extrabold text-slate-700 mb-1 uppercase text-[10px] tracking-wider", children: "Preferred Language" }), _jsxs("select", { value: createForm.preferredLanguage, onChange: (e) => setCreateForm({ ...createForm, preferredLanguage: e.target.value }), className: "w-full bg-[#EDF2F7] border border-slate-200/90 rounded-xl p-2.5 text-xs font-semibold shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer", children: [_jsx("option", { value: "mr", children: "Marathi (\u092E\u0930\u093E\u0920\u0940)" }), _jsx("option", { value: "hi", children: "Hindi (\u0939\u093F\u0902\u0926\u0940)" }), _jsx("option", { value: "en", children: "English" })] })] })] }), _jsxs("div", { className: "grid grid-cols-3 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block font-extrabold text-slate-700 mb-1 uppercase text-[10px] tracking-wider", children: "Village" }), _jsx("input", { type: "text", value: createForm.village, onChange: (e) => setCreateForm({ ...createForm, village: e.target.value }), placeholder: "Village", className: "w-full bg-[#EDF2F7] border border-slate-200/90 rounded-xl p-2.5 text-xs font-semibold shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]" })] }), _jsxs("div", { children: [_jsx("label", { className: "block font-extrabold text-slate-700 mb-1 uppercase text-[10px] tracking-wider", children: "Taluka" }), _jsx("input", { type: "text", value: createForm.taluka, onChange: (e) => setCreateForm({ ...createForm, taluka: e.target.value }), placeholder: "Taluka", className: "w-full bg-[#EDF2F7] border border-slate-200/90 rounded-xl p-2.5 text-xs font-semibold shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]" })] }), _jsxs("div", { children: [_jsx("label", { className: "block font-extrabold text-slate-700 mb-1 uppercase text-[10px] tracking-wider", children: "District" }), _jsx("input", { type: "text", value: createForm.district, onChange: (e) => setCreateForm({ ...createForm, district: e.target.value }), placeholder: "District", className: "w-full bg-[#EDF2F7] border border-slate-200/90 rounded-xl p-2.5 text-xs font-semibold shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]" })] })] }), _jsxs("div", { className: "pt-3 border-t border-slate-100 flex justify-end gap-2.5", children: [_jsx(ClayButton, { type: "button", variant: "secondary", size: "sm", onClick: () => setIsCreateModalOpen(false), children: "Cancel" }), _jsx(ClayButton, { type: "submit", variant: "brand", size: "sm", children: "Register Farmer" })] })] }) })] }));
};
//# sourceMappingURL=CustomerManagement.js.map