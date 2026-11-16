import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import {
  ClayCard,
  ClayButton,
  ClayBadge,
  ClayTabs,
  ClayTable,
  Column,
} from '@/components/ui'
import {
  FaceBiometricVisual,
  RfidCardVisual,
  CowVisual,
  BuffaloVisual,
  MilkCanVisual,
  LedgerShieldVisual,
} from '@/assets/illustrations'
import {
  ArrowLeft,
  Smartphone,
  MapPin,
  Building,
  CreditCard,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Clock,
  Shield,
} from 'lucide-react'
import type {
  MilkCollectionTransaction,
  CustomerLedgerEntry,
  DairyBill,
  CustomerFeedSale,
  PaymentRecord,
} from '@/types'

export const CustomerDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('profile')

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => (id ? api.customers.getById(id) : null),
  })

  const { data: transactions = [] } = useQuery({
    queryKey: ['customerTransactions', id],
    queryFn: () => (id ? api.collections.getTransactions({ customerId: id }) : []),
    enabled: !!id,
  })

  const { data: ledgerEntries = [] } = useQuery({
    queryKey: ['customerLedger', id],
    queryFn: () => (id ? api.ledger.getEntries(id) : []),
    enabled: !!id,
  })

  const { data: allBills = [] } = useQuery({
    queryKey: ['customerBills'],
    queryFn: () => api.billing.getBills(),
  })
  const customerBills = allBills.filter((b) => b.customerId === id)

  const { data: allFeedSales = [] } = useQuery({
    queryKey: ['customerFeedSales'],
    queryFn: () => api.feed.getSales(),
  })
  const customerFeedPurchases = allFeedSales.filter((f) => f.customerId === id)

  const { data: allPayments = [] } = useQuery({
    queryKey: ['customerPayments'],
    queryFn: () => api.payments.getAll(),
  })
  const customerPayments = allPayments.filter((p) => p.customerId === id)

  if (isLoading || !customer) {
    return (
      <div className="p-12 text-center text-[#817A75]">
        <div className="w-8 h-8 border-4 border-[#FF6A00] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-sm font-semibold">Loading customer master record...</p>
      </div>
    )
  }

  const tabs = [
    { id: 'profile', label: '1. Profile & Bank' },
    { id: 'biometrics', label: '2. Face & RFID' },
    { id: 'collections', label: '3. Milk Collections', badge: transactions.length },
    { id: 'ledger', label: '4. Account Ledger', badge: ledgerEntries.length },
    { id: 'bills', label: '5. Bills & Settlements', badge: customerBills.length },
    { id: 'feed', label: '6. Feed Purchases', badge: customerFeedPurchases.length },
    { id: 'payments', label: '7. Payments Received', badge: customerPayments.length },
  ]

  // Collection Table Columns
  const collectionCols: Column<MilkCollectionTransaction>[] = [
    { key: 'transactionId', header: 'Txn ID', render: (r) => <span className="font-mono font-bold text-xs">{r.transactionId}</span> },
    { key: 'date', header: 'Date & Shift', render: (r) => <span>{r.date} ({r.shift})</span> },
    { key: 'weightLiters', header: 'Weight', render: (r) => <span className="font-bold">{r.weightLiters.toFixed(1)} L</span> },
    { key: 'fatPercentage', header: 'Fat %', render: (r) => <span>{r.fatPercentage.toFixed(1)}%</span> },
    { key: 'snfPercentage', header: 'SNF %', render: (r) => <span>{r.snfPercentage.toFixed(1)}%</span> },
    { key: 'appliedRatePerLiter', header: 'Rate (₹/L)', render: (r) => <span>₹{r.appliedRatePerLiter.toFixed(2)}</span> },
    { key: 'totalAmount', header: 'Total Value', render: (r) => <span className="font-bold text-[#FF6A00]">₹{r.totalAmount.toFixed(2)}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <ClayBadge variant={r.status === 'CONFIRMED' ? 'approved' : 'warning'}>
          {r.status}
        </ClayBadge>
      ),
    },
  ]

  // Ledger Columns
  const ledgerCols: Column<CustomerLedgerEntry>[] = [
    { key: 'date', header: 'Date', render: (r) => <span className="font-mono text-xs">{r.date}</span> },
    { key: 'description', header: 'Particulars', render: (r) => <span className="font-semibold text-xs">{r.description}</span> },
    { key: 'debit', header: 'Debit (₹)', render: (r) => <span className="text-red-700 font-bold">{r.debit > 0 ? `₹${r.debit.toFixed(2)}` : '-'}</span> },
    { key: 'credit', header: 'Credit (₹)', render: (r) => <span className="text-emerald-700 font-bold">{r.credit > 0 ? `₹${r.credit.toFixed(2)}` : '-'}</span> },
    { key: 'runningBalance', header: 'Running Bal (₹)', render: (r) => <span className="font-black text-xs">₹{r.runningBalance.toFixed(2)}</span> },
    { key: 'authorizedBy', header: 'Authorized By', render: (r) => <span className="text-xs text-[#817A75]">{r.authorizedBy}</span> },
  ]

  return (
    <div className="space-y-6 text-left">
      {/* Top breadcrumb & Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/customers/directory')}
          className="flex items-center gap-1.5 text-xs font-bold text-[#817A75] hover:text-[#211B18] cursor-pointer"
        >
          <ArrowLeft size={16} />
          <span>Back to Customer Directory</span>
        </button>

        <ClayBadge variant={customer.status === 'ACTIVE' ? 'active' : 'inactive'}>
          {customer.status}
        </ClayBadge>
      </div>

      {/* Customer Header Dossier Card */}
      <ClayCard className="!p-6 bg-gradient-to-r from-white via-[#FFF5EE] to-[#FFE9DC]/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#FFE9DC] border border-[#F1E7E0] flex items-center justify-center font-black text-xl text-[#FF6A00] shrink-0">
              {customer.customerCode}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-[#211B18] tracking-tight">{customer.fullName}</h1>
                <ClayBadge
                  variant={customer.preferredCategory === 'COW' ? 'cow' : 'buffalo'}
                  icon={customer.preferredCategory === 'COW' ? <CowVisual size={14} /> : <BuffaloVisual size={14} />}
                >
                  {customer.preferredCategory} Milk
                </ClayBadge>
              </div>
              <p className="text-xs text-[#817A75] flex items-center gap-3 mt-1 font-medium">
                <span className="flex items-center gap-1"><Smartphone size={13} /> +91 {customer.mobileNumber}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><MapPin size={13} /> {customer.village}</span>
                <span>•</span>
                <span>Member since {customer.registrationDate}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-xl border border-[#F1E7E0] shadow-xs">
            <div>
              <p className="text-[10px] uppercase font-bold text-[#817A75]">Pending Balance Due</p>
              <h3 className="text-lg font-black text-[#FF6A00]">₹{customer.summary.pendingBalance.toLocaleString('en-IN')}</h3>
            </div>
          </div>
        </div>
      </ClayCard>

      {/* Dossier Tabs */}
      <ClayTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab 1: Profile & Bank Details */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ClayCard>
            <h4 className="text-sm font-bold text-[#211B18] mb-4 pb-2 border-b border-[#F1E7E0]">Personal & Family Information</h4>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-[#F1E7E0]/60">
                <span className="text-[#817A75]">Father / Husband Name:</span>
                <span className="font-bold text-[#211B18]">{customer.fatherOrHusbandName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#F1E7E0]/60">
                <span className="text-[#817A75]">Village / Locality:</span>
                <span className="font-bold text-[#211B18]">{customer.village}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#F1E7E0]/60">
                <span className="text-[#817A75]">Dairy Association:</span>
                <span className="font-bold text-[#211B18]">Gokul Dairy Cooperative (DF-GOKUL-01)</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#817A75]">Audit Actions Recorded:</span>
                <span className="font-bold text-[#211B18]">{customer.auditCount} events</span>
              </div>
            </div>
          </ClayCard>

          <ClayCard>
            <h4 className="text-sm font-bold text-[#211B18] mb-4 pb-2 border-b border-[#F1E7E0]">Bank Settlement Credentials</h4>
            {customer.bankDetails ? (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-1 border-b border-[#F1E7E0]/60">
                  <span className="text-[#817A75]">Account Holder:</span>
                  <span className="font-bold text-[#211B18]">{customer.bankDetails.accountHolderName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#F1E7E0]/60">
                  <span className="text-[#817A75]">Bank Name:</span>
                  <span className="font-bold text-[#211B18]">{customer.bankDetails.bankName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#F1E7E0]/60">
                  <span className="text-[#817A75]">Account Number:</span>
                  <span className="font-mono font-bold text-[#211B18]">{customer.bankDetails.accountNumber}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#817A75]">IFSC Code:</span>
                  <span className="font-mono font-bold text-[#211B18]">{customer.bankDetails.ifscCode}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#817A75]">No direct bank credentials registered. Settlements paid in cash/cheque.</p>
            )}
          </ClayCard>
        </div>
      )}

      {/* Tab 2: Biometrics & RFID Status */}
      {activeTab === 'biometrics' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ClayCard>
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-[#F1E7E0]">
              <FaceBiometricVisual size={22} />
              <h4 className="text-sm font-bold text-[#211B18]">Face Biometric Template (YuNet + SFace ONNX)</h4>
            </div>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-[#F1E7E0]/60">
                <span className="text-[#817A75]">Enrollment Lifecycle Status:</span>
                <ClayBadge variant={customer.biometric.faceEnrollmentStatus === 'APPROVED' ? 'approved' : 'warning'}>
                  {customer.biometric.faceEnrollmentStatus}
                </ClayBadge>
              </div>
              <div className="flex justify-between py-1 border-b border-[#F1E7E0]/60">
                <span className="text-[#817A75]">Model Specification:</span>
                <span className="font-mono font-bold text-[#211B18]">{customer.biometric.faceModelVersion || 'YuNet-v1.0 + SFace-INT8-v1.0'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#F1E7E0]/60">
                <span className="text-[#817A75]">Enrolled At:</span>
                <span className="font-semibold text-[#211B18]">{customer.biometric.faceEnrolledAt || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#817A75]">Consent Hash:</span>
                <span className="font-mono text-[10px] text-[#817A75] truncate max-w-xs">{customer.biometric.consentEvidenceHash || 'sha256:verified'}</span>
              </div>
            </div>
            <div className="mt-4 p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>Biometric template active in collection kiosks. Raw images are never stored or exposed.</span>
            </div>
          </ClayCard>

          <ClayCard>
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-[#F1E7E0]">
              <RfidCardVisual size={22} />
              <h4 className="text-sm font-bold text-[#211B18]">RFID Smart Card Association</h4>
            </div>
            {customer.rfidCard ? (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-1 border-b border-[#F1E7E0]/60">
                  <span className="text-[#817A75]">Card UID:</span>
                  <span className="font-mono font-bold text-[#211B18] text-sm">{customer.rfidCard.cardUid}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#F1E7E0]/60">
                  <span className="text-[#817A75]">Card Status:</span>
                  <ClayBadge variant={customer.rfidCard.status === 'ACTIVE' ? 'approved' : 'rejected'}>
                    {customer.rfidCard.status}
                  </ClayBadge>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#817A75]">Assigned Date:</span>
                  <span className="font-semibold text-[#211B18]">{new Date(customer.rfidCard.assignedAt).toLocaleDateString()}</span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-[#817A75] py-4">
                No RFID smart card currently assigned to this patron.
              </div>
            )}
          </ClayCard>
        </div>
      )}

      {/* Tab 3: Milk Collections */}
      {activeTab === 'collections' && (
        <ClayCard className="!p-0 overflow-hidden">
          <ClayTable
            columns={collectionCols}
            data={transactions}
            keyExtractor={(t) => t.id}
            emptyMessage="No historical collection records"
            emptySubtext="Recorded morning/evening deliveries will appear here."
          />
        </ClayCard>
      )}

      {/* Tab 4: Account Ledger */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          <div className="p-3 bg-white rounded-xl border border-[#F1E7E0] flex items-center justify-between text-xs">
            <span className="font-bold text-[#211B18]">Server-Authoritative Double-Entry Ledger</span>
            <span className="text-[#817A75]">All credits and debits are strictly auditable</span>
          </div>
          <ClayCard className="!p-0 overflow-hidden">
            <ClayTable
              columns={ledgerCols}
              data={ledgerEntries}
              keyExtractor={(l) => l.id}
              emptyMessage="No ledger entries found"
              emptySubtext="Ledger entries will be created upon collection or feed sales."
            />
          </ClayCard>
        </div>
      )}

      {/* Tab 5: Bills & Settlements */}
      {activeTab === 'bills' && (
        <ClayCard className="!p-4">
          <h4 className="text-sm font-bold text-[#211B18] mb-3">Fortnightly Billing Records</h4>
          {customerBills.length === 0 ? (
            <p className="text-xs text-[#817A75]">No bills generated yet for this customer.</p>
          ) : (
            <div className="space-y-3">
              {customerBills.map((b) => (
                <div key={b.id} className="p-3 bg-[#FFF5EE] rounded-xl border border-[#F1E7E0] flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono font-bold text-[#211B18]">{b.billNumber}</span>
                    <p className="text-[11px] text-[#817A75] mt-0.5">{b.cycleName} ({b.periodStart} to {b.periodEnd})</p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-[#FF6A00] text-sm">₹{b.netPayableAmount.toLocaleString('en-IN')}</span>
                    <p className="text-[10px] text-emerald-700 font-bold">{b.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ClayCard>
      )}

      {/* Tab 6: Feed Purchases */}
      {activeTab === 'feed' && (
        <ClayCard className="!p-4">
          <h4 className="text-sm font-bold text-[#211B18] mb-3">Feed & Nutrition Purchases</h4>
          {customerFeedPurchases.length === 0 ? (
            <p className="text-xs text-[#817A75]">No feed purchases recorded for this customer.</p>
          ) : (
            <div className="space-y-3">
              {customerFeedPurchases.map((f) => (
                <div key={f.id} className="p-3 bg-[#FCF8F5] rounded-xl border border-[#F1E7E0] flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-[#211B18]">{f.productName}</span>
                    <p className="text-[11px] text-[#817A75] mt-0.5">{f.quantity} {f.unit} • {f.purchaseDate}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-red-700">₹{f.totalAmount.toFixed(2)}</span>
                    <p className="text-[10px] text-[#817A75] font-semibold">{f.paymentMode}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ClayCard>
      )}

      {/* Tab 7: Payments Received */}
      {activeTab === 'payments' && (
        <ClayCard className="!p-4">
          <h4 className="text-sm font-bold text-[#211B18] mb-3">Settlement Payments</h4>
          {customerPayments.length === 0 ? (
            <p className="text-xs text-[#817A75]">No payment receipts registered yet.</p>
          ) : (
            <div className="space-y-3">
              {customerPayments.map((p) => (
                <div key={p.id} className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-200 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono font-bold text-[#211B18]">{p.receiptNumber}</span>
                    <p className="text-[11px] text-[#817A75] mt-0.5">{p.paymentDate} • Via {p.paymentMethod}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-emerald-800 text-sm">₹{p.amount.toFixed(2)}</span>
                    <p className="text-[10px] text-emerald-700 font-bold">{p.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ClayCard>
      )}
    </div>
  )
}
