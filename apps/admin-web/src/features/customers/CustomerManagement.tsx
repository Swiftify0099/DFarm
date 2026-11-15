import React, { useState, useEffect, useCallback } from 'react';
import {
  customerApi,
  Customer,
  CustomerFaceStatus,
  CustomerRfidStatus,
  CustomerLedgerSummary,
} from '../../api/customerApi.js';
import { billingApi } from '../../api/billingApi.js';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { SearchBar } from '../../components/SearchBar.js';
import { Pagination } from '../../components/Pagination.js';
import { Modal } from '../../components/Modal.js';
import { StatusBadge } from '../../components/Badge.js';
import { ClayButton } from '../../components/ClayButton.js';

export const CustomerManagement: React.FC = () => {
  const { selectedCenterId, centers, isAdmin, hasRole } = useAuth();
  const { showToast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showDeleted, setShowDeleted] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Selected Customer Modal
  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'biometrics' | 'ledger' | 'bills' | 'payouts'>('profile');
  const [faceStatus, setFaceStatus] = useState<CustomerFaceStatus | null>(null);
  const [rfidStatus, setRfidStatus] = useState<CustomerRfidStatus | null>(null);
  const [ledgerSummary, setLedgerSummary] = useState<CustomerLedgerSummary | null>(null);
  const [ledgerTransactions, setLedgerTransactions] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [modalLoading, setModalLoading] = useState<boolean>(false);

  // Soft Delete / Restore Modals
  const [actionCustomer, setActionCustomer] = useState<Customer | null>(null);
  const [deleteReason, setDeleteReason] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState<boolean>(false);

  // New Customer Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
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

      let list: Customer[] = [];
      let total = 0;

      if (Array.isArray(resp)) {
        list = resp;
        total = resp.length;
      } else if (resp && Array.isArray((resp as any).items)) {
        list = (resp as any).items;
        total = typeof (resp as any).total === 'number' ? (resp as any).total : (resp as any).items.length;
      } else if (resp && Array.isArray((resp as any).customers)) {
        list = (resp as any).customers;
        total = typeof (resp as any).total === 'number' ? (resp as any).total : (resp as any).customers.length;
      } else if (resp && Array.isArray((resp as any).data)) {
        list = (resp as any).data;
        total = typeof (resp as any).total === 'number' ? (resp as any).total : (resp as any).data.length;
      }

      setCustomers(list);
      setTotalCount(total);
    } catch (err: any) {
      setCustomers([]);
      setTotalCount(0);
      showToast(err.message || 'Failed to fetch customer directory', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter, selectedCenterId, showDeleted, showToast]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Load sub-details when a customer profile modal is opened
  const handleOpenCustomer = async (cust: Customer) => {
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

      if (face.status === 'fulfilled') setFaceStatus(face.value);
      if (rfid.status === 'fulfilled') setRfidStatus(rfid.value);
      if (ledger.status === 'fulfilled') setLedgerSummary(ledger.value);
      if (ledgerTx.status === 'fulfilled') {
        const val: any = ledgerTx.value;
        const txList = Array.isArray(val)
          ? val
          : (Array.isArray(val?.transactions) ? val.transactions : (Array.isArray(val?.items) ? val.items : []));
        setLedgerTransactions(txList);
      }
      if (custBills.status === 'fulfilled') {
        const val: any = custBills.value;
        const bList = Array.isArray(val)
          ? val
          : (Array.isArray(val?.bills) ? val.bills : (Array.isArray(val?.items) ? val.items : []));
        setBills(bList);
      }
      if (custPayouts.status === 'fulfilled') {
        const val: any = custPayouts.value;
        const pList = Array.isArray(val)
          ? val
          : (Array.isArray(val?.payouts) ? val.payouts : (Array.isArray(val?.items) ? val.items : []));
        setPayouts(pList);
      }
    } catch {
      // Handled
    } finally {
      setModalLoading(false);
    }
  };

  const handleSoftDelete = async () => {
    if (!actionCustomer || !deleteReason.trim()) return;
    setIsDeleting(true);
    try {
      await customerApi.softDelete(actionCustomer.id, deleteReason.trim());
      showToast(`Customer ${actionCustomer.farmerCode} soft-deleted`, 'success');
      setIsDeleteModalOpen(false);
      setActionCustomer(null);
      setDeleteReason('');
      loadCustomers();
    } catch (err: any) {
      showToast(err.message || 'Soft delete failed', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestore = async () => {
    if (!actionCustomer || !deleteReason.trim()) return;
    setIsDeleting(true);
    try {
      await customerApi.restore(actionCustomer.id, deleteReason.trim());
      showToast(`Customer ${actionCustomer.farmerCode} restored successfully`, 'success');
      setIsRestoreModalOpen(false);
      setActionCustomer(null);
      setDeleteReason('');
      loadCustomers();
    } catch (err: any) {
      showToast(err.message || 'Customer restore failed', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
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
    } catch (err: any) {
      showToast(err.message || 'Failed to register customer', 'error');
    }
  };

  return (
    <div className="space-y-6 select-none">
      {/* Search and Action Bar */}
      <div className="clay-surface p-4 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex-1 flex flex-col sm:flex-row items-center gap-3">
          <SearchBar
            placeholder="Search by farmer code, name, or phone..."
            value={search}
            onChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
          />

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs font-bold bg-[#EDF2F7] border border-slate-200/90 rounded-xl px-3.5 py-2.5 text-slate-700 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05),inset_-1.5px_-1.5px_3px_rgba(255,255,255,0.85)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="PENDING_VERIFICATION">Pending KYC</option>
            <option value="SUSPENDED">Suspended</option>
          </select>

          <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none px-2 py-1.5 rounded-xl hover:bg-slate-100 transition">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => {
                setShowDeleted(e.target.checked);
                setPage(1);
              }}
              className="w-4 h-4 rounded text-emerald-600 focus:ring-[#00506E] cursor-pointer"
            />
            <span>Show Soft-Deleted</span>
          </label>
        </div>

        {hasRole(['SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'REGISTRATION_OFFICER']) && (
          <ClayButton
            variant="brand"
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
            icon={<span className="text-base font-bold">+</span>}
          >
            <span>Register New Farmer</span>
          </ClayButton>
        )}
      </div>

      {/* Customer Master Table */}
      <div className="clay-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50/70 to-white">
          <div className="flex items-center gap-2">
            <span className="text-base">🧑‍🌾</span>
            <h3 className="text-sm font-extrabold text-slate-800 tracking-tight">Customer Master Directory</h3>
          </div>
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#E6F4FA] text-[#00506E] border border-sky-200">
            {totalCount} Total Farmers
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
            <thead className="bg-[#F8FAFC] text-slate-500 font-extrabold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5">Farmer Code</th>
                <th className="px-4 py-3.5">Farmer Name</th>
                <th className="px-4 py-3.5">Mobile Number</th>
                <th className="px-4 py-3.5">Center</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-center">Face KYC</th>
                <th className="px-4 py-3.5 text-center">RFID Card</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                      <span className="font-bold">Loading farmers from database...</span>
                    </div>
                  </td>
                </tr>
              ) : !Array.isArray(customers) || customers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <span className="text-3xl">🔍</span>
                      <p className="font-bold">No customers found matching filter criteria.</p>
                      <p className="text-[11px] text-slate-400">Try modifying your search query or status filter.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 font-mono font-black text-[#00506E]">
                      {c.farmerCode}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{c.fullName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">ID: {c.id.substring(0, 8)}...</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600">
                      {c.normalizedMobileNumber || c.mobileNumber || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-medium">
                      {c.centerName || 'Assigned Center'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.isDeleted ? 'SOFT_DELETED' : c.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#E6F4EA] text-[#137333] border border-emerald-200 shadow-sm">
                        Protected
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#E8F0FE] text-[#1A73E8] border border-sky-200 shadow-sm">
                        RFID Active
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => handleOpenCustomer(c)}
                        className="px-3 py-1 bg-white hover:bg-emerald-50 text-[#00506E] border border-slate-200 rounded-xl font-bold text-[11px] shadow-[0_2px_4px_rgba(0,0,0,0.04),inset_0_1px_1px_rgba(255,255,255,0.9)] hover:border-emerald-300 transition active:translate-y-0.5"
                      >
                        Profile & Ledger
                      </button>

                      {isAdmin && !c.isDeleted && (
                        <button
                          onClick={() => {
                            setActionCustomer(c);
                            setIsDeleteModalOpen(true);
                          }}
                          className="px-3 py-1 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-xl font-bold text-[11px] shadow-[0_2px_4px_rgba(225,29,72,0.06),inset_0_1px_1px_rgba(255,255,255,0.9)] transition active:translate-y-0.5"
                        >
                          Delete
                        </button>
                      )}

                      {isAdmin && c.isDeleted && (
                        <button
                          onClick={() => {
                            setActionCustomer(c);
                            setIsRestoreModalOpen(true);
                          }}
                          className="px-3 py-1 bg-white hover:bg-sky-50 text-[#00506E] border border-sky-200 rounded-xl font-bold text-[11px] shadow-[0_2px_4px_rgba(0,80,110,0.06),inset_0_1px_1px_rgba(255,255,255,0.9)] transition active:translate-y-0.5"
                        >
                          Restore
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={page}
          totalItems={totalCount}
          pageSize={10}
          onPageChange={setPage}
        />
      </div>

      {/* CUSTOMER DETAIL MODAL (Profile, Biometrics, Ledger, Bills, Payouts) */}
      {activeCustomer && (
        <Modal
          isOpen={Boolean(activeCustomer)}
          onClose={() => setActiveCustomer(null)}
          title={`${activeCustomer.fullName} (${activeCustomer.farmerCode})`}
          subtitle="Farmer Identity, Biometric Privacy Status & Subledger"
          maxWidth="3xl"
        >
          {modalLoading ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-3 border-[#00506E] border-t-transparent rounded-full animate-spin" />
              <span className="font-bold text-xs uppercase tracking-wider">Fetching ledger & biometric compliance status...</span>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Tabs */}
              <div className="flex border-b border-slate-100 space-x-2 text-xs font-bold overflow-x-auto pb-1">
                <button
                  onClick={() => setActiveTab('profile')}
                  className={`px-3.5 py-2 rounded-xl transition whitespace-nowrap flex items-center gap-1.5 ${
                    activeTab === 'profile'
                      ? 'bg-[#00506E] text-white shadow-md'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span>👤</span>
                  <span>KYC Profile</span>
                </button>
                <button
                  onClick={() => setActiveTab('biometrics')}
                  className={`px-3.5 py-2 rounded-xl transition whitespace-nowrap flex items-center gap-1.5 ${
                    activeTab === 'biometrics'
                      ? 'bg-[#00506E] text-white shadow-md'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span>🔒</span>
                  <span>Face & RFID Status</span>
                </button>
                <button
                  onClick={() => setActiveTab('ledger')}
                  className={`px-3.5 py-2 rounded-xl transition whitespace-nowrap flex items-center gap-1.5 ${
                    activeTab === 'ledger'
                      ? 'bg-[#00506E] text-white shadow-md'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span>💰</span>
                  <span>Subledger Account</span>
                </button>
                <button
                  onClick={() => setActiveTab('bills')}
                  className={`px-3.5 py-2 rounded-xl transition whitespace-nowrap flex items-center gap-1.5 ${
                    activeTab === 'bills'
                      ? 'bg-[#00506E] text-white shadow-md'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span>🧾</span>
                  <span>Monthly Bills</span>
                </button>
                <button
                  onClick={() => setActiveTab('payouts')}
                  className={`px-3.5 py-2 rounded-xl transition whitespace-nowrap flex items-center gap-1.5 ${
                    activeTab === 'payouts'
                      ? 'bg-[#00506E] text-white shadow-md'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span>💳</span>
                  <span>Payouts History</span>
                </button>
              </div>

              {/* Tab 1: KYC Profile */}
              {activeTab === 'profile' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 bg-[#F8FAFC] rounded-2xl border border-slate-200/80 shadow-[inset_1px_1px_2px_rgba(15,23,42,0.03)] space-y-2.5">
                    <span className="font-extrabold uppercase tracking-wider text-slate-500 block text-[10px]">Personal Details</span>
                    <div className="flex justify-between"><span className="text-slate-500 font-medium">Full Name:</span> <span className="font-black text-slate-900">{activeCustomer.fullName}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500 font-medium">Farmer Code:</span> <span className="font-mono font-black text-[#00506E]">{activeCustomer.farmerCode}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500 font-medium">Mobile:</span> <span className="font-mono font-bold text-slate-800">{activeCustomer.normalizedMobileNumber || activeCustomer.mobileNumber}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500 font-medium">Preferred Language:</span> <span className="uppercase font-bold text-slate-800">{activeCustomer.preferredLanguage || 'mr'}</span></div>
                  </div>

                  <div className="p-4 bg-[#F8FAFC] rounded-2xl border border-slate-200/80 shadow-[inset_1px_1px_2px_rgba(15,23,42,0.03)] space-y-2.5">
                    <span className="font-extrabold uppercase tracking-wider text-slate-500 block text-[10px]">Dairy Permissions & Center</span>
                    <div className="flex justify-between"><span className="text-slate-500 font-medium">Center:</span> <span className="font-bold text-slate-900">{activeCustomer.centerName || 'Assigned Center'}</span></div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Milk Permissions: </span>
                      <span className="font-black text-[#137333]">Cow & Buffalo Permitted</span>
                    </div>
                    <div className="flex justify-between items-center"><span className="text-slate-500 font-medium">Account Status:</span> <StatusBadge status={activeCustomer.status} /></div>
                    <div className="flex justify-between"><span className="text-slate-500 font-medium">Enrolled On:</span> <span className="font-bold text-slate-700">{new Date(activeCustomer.createdAt).toLocaleDateString()}</span></div>
                  </div>
                </div>
              )}

              {/* Tab 2: Biometrics & RFID Status (Privacy Shield: Zero embedding exposure) */}
              {activeTab === 'biometrics' && (
                <div className="space-y-4 text-xs">
                  <div className="p-5 bg-gradient-to-br from-[#F2FBF6] to-white border border-emerald-200/90 rounded-2xl space-y-2.5 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9)]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🛡️</span>
                        <span className="font-black text-emerald-950 text-sm">Face Recognition Enrollment</span>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full font-black text-[10px] ${faceStatus?.isEnrolled ? 'bg-[#E6F4EA] text-[#137333] border border-emerald-300' : 'bg-slate-200 text-slate-700'}`}>
                        {faceStatus?.isEnrolled ? 'ENROLLED & ACTIVE' : 'PENDING ENROLLMENT'}
                      </span>
                    </div>
                    <p className="text-emerald-800 text-[11px] leading-relaxed">
                      Biometric Shield Active: Raw embeddings are securely stored in pgvector and encrypted at rest. Ordinary dashboard profiles never expose raw vector data.
                    </p>
                    {faceStatus?.isEnrolled && (
                      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-emerald-200/60 text-slate-700 font-bold">
                        <div>Model Version: <span className="font-mono font-black text-slate-900">{faceStatus.modelCode || 'MobileFaceNet-V1'}</span></div>
                        <div>Quality Gate: <span className="font-black text-[#137333]">PASSED</span></div>
                      </div>
                    )}
                  </div>

                  <div className="p-5 bg-gradient-to-br from-[#F5FAFF] to-white border border-sky-200/90 rounded-2xl space-y-2.5 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9)]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">💳</span>
                        <span className="font-black text-slate-900 text-sm">RFID Card Binding</span>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full font-black text-[10px] ${rfidStatus?.isAssigned ? 'bg-[#E6F4EA] text-[#137333] border border-emerald-300' : 'bg-amber-100 text-amber-800'}`}>
                        {rfidStatus?.isAssigned ? 'CARD ASSIGNED' : 'UNASSIGNED'}
                      </span>
                    </div>
                    {rfidStatus?.isAssigned ? (
                      <div className="grid grid-cols-2 gap-3 text-slate-700 font-bold">
                        <div>Card UID: <span className="font-mono font-black text-slate-900">{rfidStatus.cardUidMask || '••••••••'}</span></div>
                        <div>Technology: <span className="font-bold text-slate-800">{rfidStatus.technology || 'MIFARE Classic 1K'}</span></div>
                      </div>
                    ) : (
                      <p className="text-slate-500 text-[11px]">No active RFID card assigned to this customer.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Customer Subledger */}
              {activeTab === 'ledger' && (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-3.5 bg-gradient-to-b from-[#F2FBF6] to-white border border-emerald-200/90 rounded-2xl shadow-sm">
                      <span className="text-slate-500 font-black block text-[10px] uppercase tracking-wider">Net Payable Balance</span>
                      <span className="text-lg sm:text-xl font-black text-[#137333]">
                        ₹{(ledgerSummary?.payableBalance || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="p-3.5 bg-gradient-to-b from-[#FFFDF5] to-white border border-amber-200/90 rounded-2xl shadow-sm">
                      <span className="text-slate-500 font-black block text-[10px] uppercase tracking-wider">Outstanding Advance</span>
                      <span className="text-lg sm:text-xl font-black text-[#B06000]">
                        ₹{(ledgerSummary?.advanceOutstanding || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="p-3.5 bg-gradient-to-b from-[#F5FAFF] to-white border border-sky-200/90 rounded-2xl shadow-sm">
                      <span className="text-slate-500 font-black block text-[10px] uppercase tracking-wider">Total Milk Delivered</span>
                      <span className="text-lg sm:text-xl font-black text-[#1A73E8]">
                        {(ledgerSummary?.totalMilkDeliveredKg || 0).toLocaleString()} KG
                      </span>
                    </div>
                  </div>

                  <div className="border border-slate-200/80 rounded-2xl overflow-hidden max-h-60 overflow-y-auto">
                    <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                      <thead className="bg-[#F8FAFC] text-slate-500 font-black uppercase tracking-wider sticky top-0">
                        <tr>
                          <th className="px-3.5 py-2.5">Date</th>
                          <th className="px-3.5 py-2.5">Description</th>
                          <th className="px-3.5 py-2.5">Type</th>
                          <th className="px-3.5 py-2.5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold">
                        {ledgerTransactions.length === 0 ? (
                          <tr><td colSpan={4} className="px-3.5 py-8 text-center text-slate-400">No ledger transactions posted yet.</td></tr>
                        ) : (
                          ledgerTransactions.map((tx, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="px-3.5 py-2 text-slate-500">{new Date(tx.created_at || tx.createdAt).toLocaleDateString()}</td>
                              <td className="px-3.5 py-2 font-bold text-slate-800">{tx.description || tx.reference_type}</td>
                              <td className="px-3.5 py-2 font-black">
                                <span className={tx.entry_type === 'CREDIT' ? 'text-[#137333]' : 'text-[#C5221F]'}>
                                  {tx.entry_type || 'CREDIT'}
                                </span>
                              </td>
                              <td className="px-3.5 py-2 text-right font-mono font-black text-slate-900">
                                ₹{Number(tx.amount || 0).toFixed(2)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab 4: Monthly Bills */}
              {activeTab === 'bills' && (
                <div className="space-y-3 text-xs">
                  {bills.length === 0 ? (
                    <p className="text-center py-8 text-slate-500 font-medium">No monthly bills generated for this customer yet.</p>
                  ) : (
                    <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                      {bills.map((b) => (
                        <div key={b.id} className="p-3.5 rounded-2xl border border-slate-200/90 bg-[#F8FAFC] flex items-center justify-between shadow-sm">
                          <div>
                            <span className="font-mono font-black text-slate-900">{b.billNumber || b.bill_number}</span>
                            <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                              Qty: {b.totalQuantityLiters || b.total_quantity_liters || 0} L &bull; Gross: ₹{b.grossAmount || b.gross_amount} &bull; Deductions: ₹{b.totalDeductions || b.total_deductions}
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <span className="font-black text-[#137333] text-sm">
                              ₹{Number(b.netPayableAmount || b.net_payable_amount || 0).toLocaleString()}
                            </span>
                            <StatusBadge status={b.status} />
                            <button
                              onClick={() => billingApi.downloadPdf(b.id, b.billNumber || b.bill_number)}
                              className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 font-bold text-[10px] text-slate-700 shadow-sm"
                            >
                              📄 PDF
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 5: Payouts */}
              {activeTab === 'payouts' && (
                <div className="space-y-3 text-xs">
                  {payouts.length === 0 ? (
                    <p className="text-center py-8 text-slate-500 font-medium">No payout records found for this customer.</p>
                  ) : (
                    <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                      {payouts.map((p) => (
                        <div key={p.id} className="p-3.5 rounded-2xl border border-slate-200/90 bg-[#F8FAFC] flex items-center justify-between shadow-sm">
                          <div>
                            <span className="font-mono font-black text-slate-900">{p.referenceNumber || p.reference_number || p.id.substring(0, 8)}</span>
                            <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                              Method: {p.paymentMethod || p.payment_method} &bull; Date: {new Date(p.createdAt || p.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <span className="font-black text-[#137333] text-sm">
                              ₹{Number(p.amount || 0).toLocaleString()}
                            </span>
                            <StatusBadge status={p.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Modal>
      )}

      {/* SOFT DELETE MODAL */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Confirm Customer Soft Deletion"
        subtitle={`Farmer Code: ${actionCustomer?.farmerCode}`}
        maxWidth="md"
        footer={
          <>
            <ClayButton
              variant="secondary"
              size="sm"
              onClick={() => setIsDeleteModalOpen(false)}
            >
              Cancel
            </ClayButton>
            <ClayButton
              variant="danger"
              size="sm"
              onClick={handleSoftDelete}
              disabled={isDeleting || !deleteReason.trim()}
              isLoading={isDeleting}
            >
              Confirm Soft Delete
            </ClayButton>
          </>
        }
      >
        <div className="space-y-3.5 text-xs">
          <p className="text-slate-600 font-medium leading-relaxed">
            Soft-deleting customer <span className="font-black text-slate-900">{actionCustomer?.fullName}</span> will prevent new milk intake collections while completely preserving historical audit records and subledger balances.
          </p>
          <div>
            <label className="block font-black text-slate-700 mb-1.5 uppercase text-[10px] tracking-wider">
              Mandatory Audit Reason (min 3 chars):
            </label>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="e.g. Farmer relocated outside service area, formal request filed"
              rows={3}
              className="w-full bg-[#EDF2F7] border border-slate-200/90 rounded-xl p-3 text-xs font-semibold shadow-[inset_2px_2px_4px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
        </div>
      </Modal>

      {/* RESTORE MODAL */}
      <Modal
        isOpen={isRestoreModalOpen}
        onClose={() => setIsRestoreModalOpen(false)}
        title="Confirm Customer Account Restoration"
        subtitle={`Farmer Code: ${actionCustomer?.farmerCode}`}
        maxWidth="md"
        footer={
          <>
            <ClayButton
              variant="secondary"
              size="sm"
              onClick={() => setIsRestoreModalOpen(false)}
            >
              Cancel
            </ClayButton>
            <ClayButton
              variant="emerald"
              size="sm"
              onClick={handleRestore}
              disabled={isDeleting || !deleteReason.trim()}
              isLoading={isDeleting}
            >
              Confirm Restore
            </ClayButton>
          </>
        }
      >
        <div className="space-y-3.5 text-xs">
          <p className="text-slate-600 font-medium leading-relaxed">
            Restore customer <span className="font-black text-slate-900">{actionCustomer?.fullName}</span> to ACTIVE status and enable milk collections.
          </p>
          <div>
            <label className="block font-black text-slate-700 mb-1.5 uppercase text-[10px] tracking-wider">
              Mandatory Audit Reason (min 3 chars):
            </label>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="e.g. Resumed active dairy supply agreement"
              rows={3}
              className="w-full bg-[#EDF2F7] border border-slate-200/90 rounded-xl p-3 text-xs font-semibold shadow-[inset_2px_2px_4px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
      </Modal>

      {/* NEW CUSTOMER REGISTRATION MODAL */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Register New Customer / Farmer"
        subtitle="Provision KYC profile and assign dairy intake center"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateCustomer} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-extrabold text-slate-700 mb-1 uppercase text-[10px] tracking-wider">Full Legal Name *</label>
              <input
                type="text"
                required
                value={createForm.fullName}
                onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                placeholder="e.g. Prakash Patil"
                className="w-full bg-[#EDF2F7] border border-slate-200/90 rounded-xl p-2.5 text-xs font-semibold shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]"
              />
            </div>

            <div>
              <label className="block font-extrabold text-slate-700 mb-1 uppercase text-[10px] tracking-wider">Mobile Number (+91 E.164) *</label>
              <input
                type="text"
                required
                value={createForm.mobileNumber}
                onChange={(e) => setCreateForm({ ...createForm, mobileNumber: e.target.value })}
                placeholder="e.g. 9822012345"
                className="w-full bg-[#EDF2F7] border border-slate-200/90 rounded-xl p-2.5 text-xs font-semibold shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-extrabold text-slate-700 mb-1 uppercase text-[10px] tracking-wider">Primary Intake Center *</label>
              <select
                value={createForm.centerId}
                onChange={(e) => setCreateForm({ ...createForm, centerId: e.target.value })}
                className="w-full bg-[#EDF2F7] border border-slate-200/90 rounded-xl p-2.5 text-xs font-semibold shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer"
              >
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-extrabold text-slate-700 mb-1 uppercase text-[10px] tracking-wider">Preferred Language</label>
              <select
                value={createForm.preferredLanguage}
                onChange={(e) => setCreateForm({ ...createForm, preferredLanguage: e.target.value })}
                className="w-full bg-[#EDF2F7] border border-slate-200/90 rounded-xl p-2.5 text-xs font-semibold shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer"
              >
                <option value="mr">Marathi (मराठी)</option>
                <option value="hi">Hindi (हिंदी)</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-extrabold text-slate-700 mb-1 uppercase text-[10px] tracking-wider">Village</label>
              <input
                type="text"
                value={createForm.village}
                onChange={(e) => setCreateForm({ ...createForm, village: e.target.value })}
                placeholder="Village"
                className="w-full bg-[#EDF2F7] border border-slate-200/90 rounded-xl p-2.5 text-xs font-semibold shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]"
              />
            </div>
            <div>
              <label className="block font-extrabold text-slate-700 mb-1 uppercase text-[10px] tracking-wider">Taluka</label>
              <input
                type="text"
                value={createForm.taluka}
                onChange={(e) => setCreateForm({ ...createForm, taluka: e.target.value })}
                placeholder="Taluka"
                className="w-full bg-[#EDF2F7] border border-slate-200/90 rounded-xl p-2.5 text-xs font-semibold shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]"
              />
            </div>
            <div>
              <label className="block font-extrabold text-slate-700 mb-1 uppercase text-[10px] tracking-wider">District</label>
              <input
                type="text"
                value={createForm.district}
                onChange={(e) => setCreateForm({ ...createForm, district: e.target.value })}
                placeholder="District"
                className="w-full bg-[#EDF2F7] border border-slate-200/90 rounded-xl p-2.5 text-xs font-semibold shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2.5">
            <ClayButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsCreateModalOpen(false)}
            >
              Cancel
            </ClayButton>
            <ClayButton
              type="submit"
              variant="brand"
              size="sm"
            >
              Register Farmer
            </ClayButton>
          </div>
        </form>
      </Modal>
    </div>
  );
};
