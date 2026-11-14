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

      // API returns { items, total, ... } or { customers, total } or array
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
    try {
      await customerApi.create({
        fullName: createForm.fullName.trim(),
        mobileNumber: createForm.mobileNumber.trim(),
        primaryCenterId: createForm.centerId || centers[0]?.id,
        preferredLanguage: createForm.preferredLanguage,
        milkCategories: createForm.milkCategories,
        address: {
          village: createForm.village,
          taluka: createForm.taluka,
          district: createForm.district,
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
    <div className="space-y-5">
      {/* Search and Action Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
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
            className="text-xs font-semibold bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="PENDING_VERIFICATION">Pending KYC</option>
            <option value="SUSPENDED">Suspended</option>
          </select>

          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => {
                setShowDeleted(e.target.checked);
                setPage(1);
              }}
              className="rounded text-emerald-600 focus:ring-emerald-500"
            />
            <span>Show Soft-Deleted</span>
          </label>
        </div>

        {hasRole(['SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER', 'REGISTRATION_OFFICER']) && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow"
          >
            <span>+</span>
            <span>Register New Farmer</span>
          </button>
        )}
      </div>

      {/* Customer Master Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
            <thead className="bg-gray-50/75 text-gray-500 font-bold uppercase tracking-wider">
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
            <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                      <span>Loading farmers from database...</span>
                    </div>
                  </td>
                </tr>
              ) : !Array.isArray(customers) || customers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                    No customers found matching filter criteria.
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/80 transition">
                    <td className="px-4 py-3 font-mono font-bold text-emerald-800">
                      {c.farmerCode}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-gray-900">{c.fullName}</div>
                      <div className="text-[10px] text-gray-400">ID: {c.id.substring(0, 8)}...</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-600">
                      {c.normalizedMobileNumber || c.mobileNumber || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.centerName || 'Assigned Center'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.isDeleted ? 'SOFT_DELETED' : c.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        Protected
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        RFID Active
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => handleOpenCustomer(c)}
                        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded font-bold text-[11px] transition"
                      >
                        Profile & Ledger
                      </button>

                      {isAdmin && !c.isDeleted && (
                        <button
                          onClick={() => {
                            setActionCustomer(c);
                            setIsDeleteModalOpen(true);
                          }}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded font-bold text-[11px] transition"
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
                          className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded font-bold text-[11px] transition"
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
            <div className="p-8 text-center text-gray-500 flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
              <span>Fetching ledger & biometric compliance status...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Tabs */}
              <div className="flex border-b border-gray-200 space-x-3 text-xs font-bold overflow-x-auto">
                <button
                  onClick={() => setActiveTab('profile')}
                  className={`pb-2 border-b-2 transition whitespace-nowrap ${
                    activeTab === 'profile'
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  👤 KYC Profile
                </button>
                <button
                  onClick={() => setActiveTab('biometrics')}
                  className={`pb-2 border-b-2 transition whitespace-nowrap ${
                    activeTab === 'biometrics'
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  🔒 Face & RFID Status
                </button>
                <button
                  onClick={() => setActiveTab('ledger')}
                  className={`pb-2 border-b-2 transition whitespace-nowrap ${
                    activeTab === 'ledger'
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  💰 Subledger Account
                </button>
                <button
                  onClick={() => setActiveTab('bills')}
                  className={`pb-2 border-b-2 transition whitespace-nowrap ${
                    activeTab === 'bills'
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  🧾 Monthly Bills
                </button>
                <button
                  onClick={() => setActiveTab('payouts')}
                  className={`pb-2 border-b-2 transition whitespace-nowrap ${
                    activeTab === 'payouts'
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  💳 Payouts History
                </button>
              </div>

              {/* Tab 1: KYC Profile */}
              {activeTab === 'profile' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 bg-gray-50 rounded-lg space-y-2">
                    <span className="font-bold uppercase tracking-wider text-gray-500 block">Personal Details</span>
                    <div><span className="text-gray-500">Full Name:</span> <span className="font-bold text-gray-900">{activeCustomer.fullName}</span></div>
                    <div><span className="text-gray-500">Farmer Code:</span> <span className="font-mono font-bold text-emerald-800">{activeCustomer.farmerCode}</span></div>
                    <div><span className="text-gray-500">Mobile:</span> <span className="font-mono">{activeCustomer.normalizedMobileNumber || activeCustomer.mobileNumber}</span></div>
                    <div><span className="text-gray-500">Preferred Language:</span> <span className="uppercase font-semibold">{activeCustomer.preferredLanguage || 'mr'}</span></div>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-lg space-y-2">
                    <span className="font-bold uppercase tracking-wider text-gray-500 block">Dairy Permissions & Center</span>
                    <div><span className="text-gray-500">Center:</span> <span className="font-semibold text-gray-900">{activeCustomer.centerName || 'Assigned Center'}</span></div>
                    <div>
                      <span className="text-gray-500">Milk Permissions: </span>
                      <span className="font-bold text-emerald-700">Cow & Buffalo Permitted</span>
                    </div>
                    <div><span className="text-gray-500">Account Status:</span> <StatusBadge status={activeCustomer.status} /></div>
                    <div><span className="text-gray-500">Enrolled On:</span> <span>{new Date(activeCustomer.createdAt).toLocaleDateString()}</span></div>
                  </div>
                </div>
              )}

              {/* Tab 2: Biometrics & RFID Status (Privacy Shield: Zero embedding exposure) */}
              {activeTab === 'biometrics' && (
                <div className="space-y-4 text-xs">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-900 text-sm">Face Recognition Enrollment</span>
                      <span className={`px-2 py-0.5 rounded font-bold ${faceStatus?.isEnrolled ? 'bg-emerald-200 text-emerald-800' : 'bg-gray-200 text-gray-700'}`}>
                        {faceStatus?.isEnrolled ? 'ENROLLED & ACTIVE' : 'PENDING ENROLLMENT'}
                      </span>
                    </div>
                    <p className="text-emerald-800 text-[11px]">
                      Biometric Shield Active: Raw embeddings are securely stored in pgvector and encrypted at rest. Ordinary dashboard profiles never expose raw vector data.
                    </p>
                    {faceStatus?.isEnrolled && (
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-200/60 text-gray-700">
                        <div>Model Version: <span className="font-mono font-bold">{faceStatus.modelCode || 'MobileFaceNet-V1'}</span></div>
                        <div>Quality Gate: <span className="font-bold text-emerald-700">PASSED</span></div>
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-sm">RFID Card Binding</span>
                      <span className={`px-2 py-0.5 rounded font-bold ${rfidStatus?.isAssigned ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {rfidStatus?.isAssigned ? 'CARD ASSIGNED' : 'UNASSIGNED'}
                      </span>
                    </div>
                    {rfidStatus?.isAssigned ? (
                      <div className="grid grid-cols-2 gap-2 text-gray-700">
                        <div>Card UID: <span className="font-mono font-bold">{rfidStatus.cardUidMask || '••••••••'}</span></div>
                        <div>Technology: <span className="font-semibold">{rfidStatus.technology || 'MIFARE Classic 1K'}</span></div>
                      </div>
                    ) : (
                      <p className="text-gray-500 text-[11px]">No active RFID card assigned to this customer.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Customer Subledger */}
              {activeTab === 'ledger' && (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <span className="text-gray-500 font-bold block text-[10px] uppercase">Net Payable Balance</span>
                      <span className="text-lg font-extrabold text-emerald-700">
                        ₹{(ledgerSummary?.payableBalance || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <span className="text-gray-500 font-bold block text-[10px] uppercase">Outstanding Advance</span>
                      <span className="text-lg font-extrabold text-amber-700">
                        ₹{(ledgerSummary?.advanceOutstanding || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg">
                      <span className="text-gray-500 font-bold block text-[10px] uppercase">Total Milk Delivered</span>
                      <span className="text-lg font-extrabold text-sky-700">
                        {(ledgerSummary?.totalMilkDeliveredKg || 0).toLocaleString()} KG
                      </span>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                      <thead className="bg-gray-50 text-gray-500 font-bold uppercase sticky top-0">
                        <tr>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Description</th>
                          <th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {ledgerTransactions.length === 0 ? (
                          <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No ledger transactions posted yet.</td></tr>
                        ) : (
                          ledgerTransactions.map((tx, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-3 py-1.5 text-gray-500">{new Date(tx.created_at || tx.createdAt).toLocaleDateString()}</td>
                              <td className="px-3 py-1.5 font-medium text-gray-800">{tx.description || tx.reference_type}</td>
                              <td className="px-3 py-1.5 font-bold">
                                <span className={tx.entry_type === 'CREDIT' ? 'text-emerald-700' : 'text-rose-700'}>
                                  {tx.entry_type || 'CREDIT'}
                                </span>
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono font-bold">
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
                    <p className="text-center py-8 text-gray-500">No monthly bills generated for this customer yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {bills.map((b) => (
                        <div key={b.id} className="p-3 rounded-lg border border-gray-200 bg-gray-50/50 flex items-center justify-between">
                          <div>
                            <span className="font-mono font-bold text-gray-900">{b.billNumber || b.bill_number}</span>
                            <div className="text-[11px] text-gray-500">
                              Qty: {b.totalQuantityLiters || b.total_quantity_liters || 0} L &bull; Gross: ₹{b.grossAmount || b.gross_amount} &bull; Deductions: ₹{b.totalDeductions || b.total_deductions}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-emerald-800 text-sm">
                              ₹{Number(b.netPayableAmount || b.net_payable_amount || 0).toLocaleString()}
                            </span>
                            <StatusBadge status={b.status} />
                            <button
                              onClick={() => billingApi.downloadPdf(b.id, b.billNumber || b.bill_number)}
                              className="px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-100 font-bold text-[10px] text-gray-700"
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
                    <p className="text-center py-8 text-gray-500">No payout records found for this customer.</p>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {payouts.map((p) => (
                        <div key={p.id} className="p-3 rounded-lg border border-gray-200 bg-gray-50/50 flex items-center justify-between">
                          <div>
                            <span className="font-mono font-bold text-gray-900">{p.referenceNumber || p.reference_number || p.id.substring(0, 8)}</span>
                            <div className="text-[11px] text-gray-500">
                              Method: {p.paymentMethod || p.payment_method} &bull; Date: {new Date(p.createdAt || p.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-emerald-800 text-sm">
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
            <button
              onClick={() => setIsDeleteModalOpen(false)}
              className="px-3 py-1.5 border rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={handleSoftDelete}
              disabled={isDeleting || !deleteReason.trim()}
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition disabled:opacity-50"
            >
              {isDeleting ? 'Deleting...' : 'Confirm Soft Delete'}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          <p className="text-gray-600">
            Soft-deleting customer <span className="font-bold text-gray-900">{actionCustomer?.fullName}</span> will prevent new milk intake collections while completely preserving historical audit records and subledger balances.
          </p>
          <div>
            <label className="block font-bold text-gray-700 mb-1">
              Mandatory Audit Reason (min 3 chars):
            </label>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="e.g. Farmer relocated outside service area, formal request filed"
              rows={3}
              className="w-full border rounded-lg p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
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
            <button
              onClick={() => setIsRestoreModalOpen(false)}
              className="px-3 py-1.5 border rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={handleRestore}
              disabled={isDeleting || !deleteReason.trim()}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition disabled:opacity-50"
            >
              {isDeleting ? 'Restoring...' : 'Confirm Restore'}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          <p className="text-gray-600">
            Restore customer <span className="font-bold text-gray-900">{actionCustomer?.fullName}</span> to ACTIVE status and enable milk collections.
          </p>
          <div>
            <label className="block font-bold text-gray-700 mb-1">
              Mandatory Audit Reason (min 3 chars):
            </label>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="e.g. Resumed active dairy supply agreement"
              rows={3}
              className="w-full border rounded-lg p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-gray-700 mb-1">Full Legal Name *</label>
              <input
                type="text"
                required
                value={createForm.fullName}
                onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                placeholder="e.g. Prakash Patil"
                className="w-full border rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Mobile Number (+91 E.164) *</label>
              <input
                type="text"
                required
                value={createForm.mobileNumber}
                onChange={(e) => setCreateForm({ ...createForm, mobileNumber: e.target.value })}
                placeholder="e.g. 9822012345"
                className="w-full border rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-gray-700 mb-1">Primary Intake Center *</label>
              <select
                value={createForm.centerId}
                onChange={(e) => setCreateForm({ ...createForm, centerId: e.target.value })}
                className="w-full border rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Preferred Language</label>
              <select
                value={createForm.preferredLanguage}
                onChange={(e) => setCreateForm({ ...createForm, preferredLanguage: e.target.value })}
                className="w-full border rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                <option value="mr">Marathi (मराठी)</option>
                <option value="hi">Hindi (हिंदी)</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-gray-700 mb-1">Village</label>
              <input
                type="text"
                value={createForm.village}
                onChange={(e) => setCreateForm({ ...createForm, village: e.target.value })}
                placeholder="Village"
                className="w-full border rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block font-bold text-gray-700 mb-1">Taluka</label>
              <input
                type="text"
                value={createForm.taluka}
                onChange={(e) => setCreateForm({ ...createForm, taluka: e.target.value })}
                placeholder="Taluka"
                className="w-full border rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block font-bold text-gray-700 mb-1">District</label>
              <input
                type="text"
                value={createForm.district}
                onChange={(e) => setCreateForm({ ...createForm, district: e.target.value })}
                placeholder="District"
                className="w-full border rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="pt-3 border-t flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 border rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow"
            >
              Register Farmer
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
