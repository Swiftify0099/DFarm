import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { apiClient } from '@/api/client'
import { ClayCard } from '@/components/ui/ClayCard'
import { ClayButton } from '@/components/ui/ClayButton'
import { ClayBadge } from '@/components/ui/ClayBadge'
import { ClayInput } from '@/components/ui/ClayInput'
import { ClaySelect } from '@/components/ui/ClaySelect'
import { ClayModal } from '@/components/ui/ClayModal'
import { ClayTable, type ColumnDef } from '@/components/ui/ClayTable'
import { ClayTextarea } from '@/components/ui/ClayTextarea'
import type { AmcPlan, AmcSubscription, DairyTenant } from '@/types'
import { formatDate } from '@/utils/formatters'
import {
  ShieldAlert,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Building2,
  CreditCard,
  AlertTriangle,
  Receipt,
  FileCheck2,
} from 'lucide-react'

export const AmcManagementPage: React.FC = () => {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Modals state
  const [createPlanModalOpen, setCreatePlanModalOpen] = useState(false)
  const [createSubModalOpen, setCreateSubModalOpen] = useState(false)
  const [verifyTargetSub, setVerifyTargetSub] = useState<AmcSubscription | null>(null)

  // Plan Form
  const [planName, setPlanName] = useState('')
  const [planDuration, setPlanDuration] = useState('12')
  const [planPrice, setPlanPrice] = useState('49999')
  const [planDesc, setPlanDesc] = useState('')

  // Subscription Form
  const [subDairyId, setSubDairyId] = useState('')
  const [subPlanId, setSubPlanId] = useState('')
  const [subStartDate, setSubStartDate] = useState(new Date().toISOString().slice(0, 10))

  // Payment Verification Form
  const [razorpayPaymentId, setRazorpayPaymentId] = useState('')
  const [razorpaySignature, setRazorpaySignature] = useState('')

  // Queries
  const { data: plans = [], isLoading: isPlansLoading } = useQuery<AmcPlan[]>({
    queryKey: queryKeys.amc.plans,
    queryFn: () => apiClient.getAmcPlans(),
  })

  const { data: subscriptions = [], isLoading: isSubsLoading } = useQuery<AmcSubscription[]>({
    queryKey: queryKeys.amc.subscriptions(),
    queryFn: () => apiClient.getAmcSubscriptions(),
  })

  const { data: dairies = [] } = useQuery<DairyTenant[]>({
    queryKey: queryKeys.dairies.all,
    queryFn: () => apiClient.getDairies(),
  })

  // Mutations
  const createPlanMutation = useMutation({
    mutationFn: () =>
      apiClient.createAmcPlan({
        name: planName.trim(),
        durationMonths: Number(planDuration),
        priceInr: Number(planPrice),
        description: planDesc.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.amc.plans })
      setCreatePlanModalOpen(false)
      setPlanName('')
      setPlanDesc('')
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to create AMC plan')
    },
  })

  const createSubMutation = useMutation({
    mutationFn: () => {
      if (!subDairyId || !subPlanId) throw new Error('Dairy and Plan are required')
      return apiClient.createAmcSubscription({
        dairyId: subDairyId,
        planId: subPlanId,
        startDate: subStartDate,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.amc.subscriptions() })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.metrics })
      setCreateSubModalOpen(false)
      setSubDairyId('')
      setSubPlanId('')
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to create AMC subscription')
    },
  })

  const verifyPaymentMutation = useMutation({
    mutationFn: () => {
      if (!verifyTargetSub || !razorpayPaymentId) throw new Error('Subscription ID and Payment ID required')
      return apiClient.verifyAmcPayment(verifyTargetSub.id, razorpayPaymentId.trim(), razorpaySignature.trim() || undefined)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.amc.subscriptions() })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.metrics })
      setVerifyTargetSub(null)
      setRazorpayPaymentId('')
      setRazorpaySignature('')
    },
    onError: (err: any) => {
      alert(err.message || 'Payment verification failed')
    },
  })

  // Filter subscriptions
  const filteredSubs = subscriptions.filter((sub) => {
    const term = search.toLowerCase()
    const matchesSearch =
      !term ||
      (sub.dairyName && sub.dairyName.toLowerCase().includes(term)) ||
      (sub.dairyCode && sub.dairyCode.toLowerCase().includes(term)) ||
      (sub.planName && sub.planName.toLowerCase().includes(term)) ||
      (sub.razorpayPaymentId && sub.razorpayPaymentId.toLowerCase().includes(term))
    const matchesStatus = statusFilter === 'ALL' || sub.status === statusFilter
    return matchesSearch && matchesStatus
  })

  // Metric calculation
  const totalActiveSubs = subscriptions.filter((s) => s.status === 'ACTIVE').length
  const expiringSubs = subscriptions.filter((s) => s.status === 'RENEWAL_DUE').length
  const unpaidSubs = subscriptions.filter((s) => s.paymentStatus === 'UNPAID').length
  const totalValue = subscriptions.reduce((acc, s) => acc + (Number(s.amountPaid) || 0), 0)

  const columns: ColumnDef<AmcSubscription>[] = [
    {
      key: 'dairy',
      header: 'Dairy Business',
      render: (s) => {
        const dairy = dairies.find((d) => d.id === s.dairyId)
        return (
          <div className="flex flex-col">
            <span className="font-bold text-sm text-[#211B18] flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-[#FF6A00]" />
              {dairy?.name || s.dairyName || 'Dairy Tenant'}
            </span>
            <span className="text-xs text-[#817A75] font-mono">
              {dairy?.code || s.dairyCode || s.dairyId.slice(0, 8)}
            </span>
          </div>
        )
      },
    },
    {
      key: 'plan',
      header: 'AMC Care Plan',
      render: (s) => {
        const plan = plans.find((p) => p.id === s.planId)
        return (
          <div className="flex flex-col">
            <span className="font-bold text-xs text-[#211B18]">{plan?.name || s.planName || 'Standard Care'}</span>
            <span className="text-[10px] text-[#817A75] font-mono">
              ₹{plan?.priceInr?.toLocaleString('en-IN') || '—'} / {plan?.durationMonths || 12} mo
            </span>
          </div>
        )
      },
    },
    {
      key: 'dates',
      header: 'Coverage Duration',
      render: (s) => (
        <div className="flex flex-col text-xs">
          <span className="text-[#211B18] font-mono">{formatDate(s.startDate)}</span>
          <span className="text-[10px] text-[#817A75]">to {formatDate(s.expiryDate)}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Contract Status',
      render: (s) => (
        <ClayBadge
          variant={
            s.status === 'ACTIVE'
              ? 'active'
              : s.status === 'RENEWAL_DUE'
              ? 'warning'
              : s.status === 'EXPIRED'
              ? 'suspended'
              : 'draft_onboarding'
          }
          label={s.status.replace(/_/g, ' ')}
        />
      ),
    },
    {
      key: 'payment',
      header: 'Billing Status',
      render: (s) => (
        <div className="flex flex-col">
          <span
            className={`font-bold text-xs ${
              s.paymentStatus === 'PAID' ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {s.paymentStatus === 'PAID' ? '✓ PAID' : '⏳ UNPAID'}
          </span>
          {s.razorpayPaymentId && (
            <span className="text-[10px] font-mono text-[#817A75] truncate max-w-[120px]">
              {s.razorpayPaymentId}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (s) => (
        <div className="flex items-center justify-end gap-1.5">
          {s.paymentStatus === 'UNPAID' ? (
            <ClayButton
              variant="primary"
              size="sm"
              leftIcon={<CreditCard className="w-3.5 h-3.5" />}
              onClick={() => {
                setVerifyTargetSub(s)
                setRazorpayPaymentId('pay_amc_' + Date.now().toString().slice(-6))
              }}
            >
              Verify Payment
            </ClayButton>
          ) : (
            <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Verified
            </span>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-[#211B18] tracking-tight">
              AMC & Service Management
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FFE9DC] text-[#FF6A00] border border-[#FDBA74]/50">
              Control-Plane
            </span>
          </div>
          <p className="text-xs text-[#817A75] mt-0.5">
            Annual maintenance contracts, plan catalog, and hardware service coverage.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ClayButton
            variant="outline"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setCreatePlanModalOpen(true)}
          >
            New Plan
          </ClayButton>
          <ClayButton
            variant="primary"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => {
              setCreateSubModalOpen(true)
              if (dairies[0]) setSubDairyId(dairies[0].id)
              if (plans[0]) setSubPlanId(plans[0].id)
            }}
          >
            Assign AMC
          </ClayButton>
        </div>
      </div>

      {/* Razorpay Strict Boundary Banner */}
      <ClayCard variant="peach" className="space-y-2.5">
        <div className="flex items-center gap-2 text-[#FF6A00] font-bold text-sm">
          <Receipt className="w-5 h-5 shrink-0" />
          <span>Payment Gateway Boundary: SaaS & Hardware Care Billing Only</span>
        </div>
        <p className="text-xs text-[#817A75] leading-relaxed">
          Razorpay integration is strictly scoped to <strong>Platform SaaS Subscriptions and Annual Maintenance Contracts (AMC)</strong>. Razorpay is <strong>strictly prohibited</strong> from being invoked in milk procurement intake, farmer payouts, or tenant ledger settlements.
        </p>
      </ClayCard>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <ClayCard variant="default" className="p-4 space-y-1">
          <span className="text-[11px] font-bold text-[#817A75] uppercase">Active Subscriptions</span>
          <div className="text-2xl font-black text-emerald-700 font-mono">{totalActiveSubs}</div>
          <span className="text-[10px] text-emerald-600 font-semibold">Under active care</span>
        </ClayCard>
        <ClayCard variant="default" className="p-4 space-y-1">
          <span className="text-[11px] font-bold text-[#817A75] uppercase">Expiring in 30 Days</span>
          <div className="text-2xl font-black text-amber-700 font-mono">{expiringSubs}</div>
          <span className="text-[10px] text-amber-600 font-semibold">Renewal due</span>
        </ClayCard>
        <ClayCard variant="default" className="p-4 space-y-1">
          <span className="text-[11px] font-bold text-[#817A75] uppercase">Pending Payments</span>
          <div className="text-2xl font-black text-[#FF6A00] font-mono">{unpaidSubs}</div>
          <span className="text-[10px] text-[#817A75]">Awaiting confirmation</span>
        </ClayCard>
        <ClayCard variant="default" className="p-4 space-y-1">
          <span className="text-[11px] font-bold text-[#817A75] uppercase">Total Realized Revenue</span>
          <div className="text-2xl font-black text-[#211B18] font-mono">
            ₹{totalValue.toLocaleString('en-IN')}
          </div>
          <span className="text-[10px] text-[#817A75]">Verified AMC receipts</span>
        </ClayCard>
      </div>

      {/* Available Plans Catalog Cards */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#817A75]">
          Active AMC Plans Catalog ({plans.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((p) => (
            <ClayCard key={p.id} variant="default" className="p-4 space-y-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-[#211B18]">{p.name}</h4>
                  <ClayBadge variant="active" label="Catalog" />
                </div>
                <div className="text-lg font-black text-emerald-700 font-mono mt-1">
                  ₹{Number(p.priceInr).toLocaleString('en-IN')}
                  <span className="text-xs font-normal text-[#817A75]"> / {p.durationMonths} Months</span>
                </div>
                {p.description && (
                  <p className="text-xs text-[#817A75] mt-1.5 line-clamp-2">{p.description}</p>
                )}
              </div>
            </ClayCard>
          ))}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <ClayInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subscriptions by Dairy name, code, or payment ID..."
            leftIcon={<Search className="w-4 h-4 text-[#817A75]" />}
          />
        </div>
        <div className="w-full sm:w-48">
          <ClaySelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'ALL', label: 'All Statuses' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'PENDING_PAYMENT', label: 'Pending Payment' },
              { value: 'RENEWAL_DUE', label: 'Renewal Due' },
              { value: 'EXPIRED', label: 'Expired' },
            ]}
          />
        </div>
      </div>

      {/* Subscriptions Table */}
      <ClayTable
        columns={columns}
        data={filteredSubs}
        keyExtractor={(item) => item.id}
        isLoading={isSubsLoading}
        emptyMessage="No AMC subscriptions found matching criteria."
      />

      {/* Modal: Create Plan */}
      <ClayModal
        isOpen={createPlanModalOpen}
        onClose={() => setCreatePlanModalOpen(false)}
        title="Create Standard AMC Plan"
        subtitle="Add a new maintenance tier to the central platform catalog."
        size="md"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <ClayButton variant="ghost" onClick={() => setCreatePlanModalOpen(false)}>
              Cancel
            </ClayButton>
            <ClayButton
              variant="primary"
              disabled={createPlanMutation.isPending || !planName || !planPrice}
              onClick={() => createPlanMutation.mutate()}
            >
              {createPlanMutation.isPending ? 'Saving...' : 'Save Plan'}
            </ClayButton>
          </div>
        }
      >
        <div className="space-y-4">
          <ClayInput
            label="Plan Name *"
            placeholder="e.g. Enterprise Platinum AMC 2026"
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <ClayInput
              type="number"
              label="Duration (Months) *"
              value={planDuration}
              onChange={(e) => setPlanDuration(e.target.value)}
            />
            <ClayInput
              type="number"
              label="Price (INR) *"
              value={planPrice}
              onChange={(e) => setPlanPrice(e.target.value)}
            />
          </div>
          <ClayTextarea
            label="Plan Coverage Description"
            placeholder="Includes sensor recalibration, on-site repairs, and parts replacement..."
            value={planDesc}
            onChange={(e) => setPlanDesc(e.target.value)}
          />
        </div>
      </ClayModal>

      {/* Modal: Create Subscription */}
      <ClayModal
        isOpen={createSubModalOpen}
        onClose={() => setCreateSubModalOpen(false)}
        title="Assign AMC Contract to Dairy"
        subtitle="Select the Dairy business and maintenance plan."
        size="md"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <ClayButton variant="ghost" onClick={() => setCreateSubModalOpen(false)}>
              Cancel
            </ClayButton>
            <ClayButton
              variant="primary"
              disabled={createSubMutation.isPending || !subDairyId || !subPlanId}
              onClick={() => createSubMutation.mutate()}
            >
              {createSubMutation.isPending ? 'Assigning...' : 'Assign Subscription'}
            </ClayButton>
          </div>
        }
      >
        <div className="space-y-4">
          <ClaySelect
            label="Target Dairy Tenant *"
            value={subDairyId}
            onChange={(e) => setSubDairyId(e.target.value)}
            options={dairies.map((d) => ({
              value: d.id,
              label: `${d.name} (${d.code})`,
            }))}
          />
          <ClaySelect
            label="Selected AMC Plan *"
            value={subPlanId}
            onChange={(e) => setSubPlanId(e.target.value)}
            options={plans.map((p) => ({
              value: p.id,
              label: `${p.name} — ₹${Number(p.priceInr).toLocaleString('en-IN')} (${p.durationMonths}m)`,
            }))}
          />
          <ClayInput
            type="date"
            label="Coverage Start Date *"
            value={subStartDate}
            onChange={(e) => setSubStartDate(e.target.value)}
          />
        </div>
      </ClayModal>

      {/* Modal: Verify Payment */}
      <ClayModal
        isOpen={!!verifyTargetSub}
        onClose={() => setVerifyTargetSub(null)}
        title="Verify Razorpay SaaS Payment"
        subtitle="Confirm genuine payment receipt for this AMC contract."
        size="md"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <ClayButton variant="ghost" onClick={() => setVerifyTargetSub(null)}>
              Cancel
            </ClayButton>
            <ClayButton
              variant="primary"
              disabled={verifyPaymentMutation.isPending || !razorpayPaymentId}
              onClick={() => verifyPaymentMutation.mutate()}
            >
              {verifyPaymentMutation.isPending ? 'Verifying...' : 'Verify & Activate'}
            </ClayButton>
          </div>
        }
      >
        <div className="space-y-4">
          <ClayInput
            label="Razorpay Payment ID *"
            placeholder="pay_..."
            value={razorpayPaymentId}
            onChange={(e) => setRazorpayPaymentId(e.target.value)}
          />
          <ClayInput
            label="Razorpay Signature (Optional)"
            placeholder="HMAC-SHA256 signature token"
            value={razorpaySignature}
            onChange={(e) => setRazorpaySignature(e.target.value)}
          />
          <div className="p-3 rounded-xl bg-[#FAF6F3] border border-[#F1E7E0] text-xs text-[#817A75]">
            Confirming payment automatically moves the subscription to <strong>ACTIVE</strong> status and enables warranty SLA tracking for all hardware assigned to this Dairy.
          </div>
        </div>
      </ClayModal>
    </div>
  )
}
export default AmcManagementPage
