import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import type { Customer } from '@/types'
import {
  ClayCard,
  ClayButton,
  ClayBadge,
  ClayInput,
  ClaySelect,
  ConfirmationModal,
  ClayAlert,
  ClayTable,
  Column,
} from '@/components/ui'
import { FaceBiometricVisual, RfidCardVisual, CowVisual, BuffaloVisual } from '@/assets/illustrations'
import {
  Search,
  Filter,
  UserPlus,
  Trash2,
  RefreshCw,
  Eye,
  Smartphone,
  MapPin,
} from 'lucide-react'

export const CustomerDirectory: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [milkFilter, setMilkFilter] = useState('ALL')
  const [showDeleted, setShowDeleted] = useState(false)

  const [targetCustomer, setTargetCustomer] = useState<Customer | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showRestoreModal, setShowRestoreModal] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'danger'; message: string } | null>(null)

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers', user?.dairyId, showDeleted],
    queryFn: () => api.customers.getAll(showDeleted),
  })

  // Soft delete mutation
  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.customers.softDelete(id, reason, user?.fullName || 'Dairy Admin'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', user?.dairyId] })
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary', user?.dairyId] })
      setShowDeleteModal(false)
      setNotice({ type: 'success', message: 'Customer account marked as soft-deleted in audit records.' })
    },
    onError: (err: any) => {
      setNotice({ type: 'danger', message: err.message || 'Failed to soft-delete customer' })
    },
  })

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.customers.restore(id, user?.fullName || 'Dairy Admin'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', user?.dairyId] })
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary', user?.dairyId] })
      setShowRestoreModal(false)
      setNotice({ type: 'success', message: 'Customer account successfully restored to active status.' })
    },
    onError: (err: any) => {
      setNotice({ type: 'danger', message: err.message || 'Failed to restore customer' })
    },
  })

  // Filtered customer list
  const filteredCustomers = customers.filter((cust) => {
    const matchesSearch =
      cust.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cust.customerCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cust.mobileNumber.includes(searchTerm) ||
      cust.village.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && cust.status === 'ACTIVE' && !cust.isSoftDeleted) ||
      (statusFilter === 'SUSPENDED' && cust.status === 'SUSPENDED') ||
      (statusFilter === 'DELETED' && cust.isSoftDeleted)

    const matchesMilk = milkFilter === 'ALL' || cust.preferredCategory === milkFilter

    return matchesSearch && matchesStatus && matchesMilk
  })

  const columns: Column<Customer>[] = [
    {
      key: 'customerCode',
      header: 'Code / Name',
      render: (row) => (
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-[#FF6A00] text-xs bg-[#FFE9DC] px-2 py-0.5 rounded">
              {row.customerCode}
            </span>
            <span className="font-bold text-[#211B18] text-sm">{row.fullName}</span>
          </div>
          <p className="text-xs text-[#817A75] flex items-center gap-1 mt-1">
            <Smartphone size={12} /> +91 {row.mobileNumber} • <MapPin size={12} /> {row.village}
          </p>
        </div>
      ),
    },
    {
      key: 'preferredCategory',
      header: 'Milk Category',
      render: (row) => (
        <ClayBadge
          variant={row.preferredCategory === 'COW' ? 'cow' : 'buffalo'}
          icon={row.preferredCategory === 'COW' ? <CowVisual size={14} /> : <BuffaloVisual size={14} />}
        >
          {row.preferredCategory}
        </ClayBadge>
      ),
    },
    {
      key: 'biometrics',
      header: 'Biometrics & RFID',
      render: (row) => (
        <div className="flex items-center gap-2">
          {/* Face Status */}
          <div
            title={`Face Enrollment: ${row.biometric.faceEnrollmentStatus}`}
            className="flex items-center gap-1 text-xs"
          >
            <FaceBiometricVisual size={18} />
            <span
              className={
                row.biometric.faceEnrollmentStatus === 'APPROVED'
                  ? 'text-emerald-700 font-bold'
                  : 'text-amber-700 font-bold'
              }
            >
              {row.biometric.faceEnrollmentStatus === 'APPROVED' ? 'Enrolled' : 'Pending/Re-enroll'}
            </span>
          </div>

          <span className="text-[#F1E7E0]">|</span>

          {/* RFID Status */}
          <div
            title={row.rfidCard ? `RFID: ${row.rfidCard.cardUid}` : 'No RFID Assigned'}
            className="flex items-center gap-1 text-xs"
          >
            <RfidCardVisual size={18} />
            <span className={row.rfidCard?.status === 'ACTIVE' ? 'text-emerald-700 font-bold' : 'text-[#817A75]'}>
              {row.rfidCard?.status === 'ACTIVE' ? 'Card Active' : 'No Card'}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'summary',
      header: 'Delivered / Balance',
      render: (row) => (
        <div>
          <p className="font-bold text-[#211B18] text-xs">
            {row.summary.totalLitersDelivered.toFixed(1)} <span className="text-[10px] text-[#817A75]">Liters</span>
          </p>
          <p className="text-xs font-bold text-[#FF6A00] mt-0.5">
            ₹{row.summary.pendingBalance.toLocaleString('en-IN')}{' '}
            <span className="text-[10px] text-[#817A75] font-normal">due</span>
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <ClayBadge
          variant={row.isSoftDeleted ? 'rejected' : row.status === 'ACTIVE' ? 'active' : 'inactive'}
        >
          {row.isSoftDeleted ? 'DELETED' : row.status}
        </ClayBadge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <ClayButton
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/customers/detail/${row.id}`)}
            leftIcon={<Eye size={14} />}
          >
            Dossier
          </ClayButton>

          {row.isSoftDeleted ? (
            <ClayButton
              variant="secondary"
              size="sm"
              onClick={() => {
                setTargetCustomer(row)
                setShowRestoreModal(true)
              }}
              leftIcon={<RefreshCw size={14} />}
            >
              Restore
            </ClayButton>
          ) : (
            <ClayButton
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50"
              onClick={() => {
                setTargetCustomer(row)
                setShowDeleteModal(true)
              }}
            >
              <Trash2 size={14} />
            </ClayButton>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-[#211B18] tracking-tight">Customer Directory</h1>
            <ClayBadge variant="cow" className="text-xs">
              {customers.length} Registered
            </ClayBadge>
          </div>
          <p className="text-xs text-[#817A75] mt-1 font-medium">
            Authorized registered dairy patrons, biometric enrollments, RFID smart cards, and ledger balances.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ClayButton
            variant="primary"
            size="sm"
            onClick={() => navigate('/customers/approvals')}
            leftIcon={<UserPlus size={16} />}
          >
            Review Pending Approvals
          </ClayButton>
        </div>
      </div>

      {notice && (
        <ClayAlert
          type={notice.type}
          message={notice.message}
          action={
            <button onClick={() => setNotice(null)} className="text-xs underline font-bold cursor-pointer">
              Dismiss
            </button>
          }
        />
      )}

      {/* Filter and Search Bar */}
      <ClayCard className="!p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <ClayInput
            placeholder="Search by name, code, phone, village..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search size={16} />}
          />

          <ClaySelect
            options={[
              { label: 'All Statuses', value: 'ALL' },
              { label: 'Active Only', value: 'ACTIVE' },
              { label: 'Suspended Only', value: 'SUSPENDED' },
              { label: 'Deleted Only', value: 'DELETED' },
            ]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />

          <ClaySelect
            options={[
              { label: 'All Milk Types', value: 'ALL' },
              { label: 'Cow Milk Preferred', value: 'COW' },
              { label: 'Buffalo Milk Preferred', value: 'BUFFALO' },
            ]}
            value={milkFilter}
            onChange={(e) => setMilkFilter(e.target.value)}
          />

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-[#817A75] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => setShowDeleted(e.target.checked)}
                className="rounded text-[#FF6A00] focus:ring-[#FF6A00]"
              />
              <span>Include soft-deleted</span>
            </label>
          </div>
        </div>
      </ClayCard>

      {/* Customer Directory Table */}
      <ClayCard className="!p-0 overflow-hidden">
        <ClayTable
          columns={columns}
          data={filteredCustomers}
          keyExtractor={(c) => c.id}
          isLoading={isLoading}
          emptyMessage="No matching customers found"
          emptySubtext="Try adjusting your search criteria or review pending registrations."
        />
      </ClayCard>

      {/* Soft Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={async (reason) => {
          if (targetCustomer && reason) {
            await deleteMutation.mutateAsync({ id: targetCustomer.id, reason })
          }
        }}
        title="Soft-Delete Customer Record"
        message={`Are you sure you want to soft-delete ${targetCustomer?.fullName} (${targetCustomer?.customerCode})? Historical collections, ledger entries, and bills are permanently preserved in audit history.`}
        confirmText="Confirm Soft-Delete"
        variant="danger"
        requireReason={true}
        reasonLabel="Mandatory Reason for Deletion"
        reasonPlaceholder="e.g. Farmer relocated to another district; ceased dairy farming"
        isLoading={deleteMutation.isPending}
      />

      {/* Restore Confirmation Modal */}
      <ConfirmationModal
        isOpen={showRestoreModal}
        onClose={() => setShowRestoreModal(false)}
        onConfirm={async () => {
          if (targetCustomer) {
            await restoreMutation.mutateAsync(targetCustomer.id)
          }
        }}
        title="Restore Customer Account"
        message={`Restore active membership for ${targetCustomer?.fullName} (${targetCustomer?.customerCode})?`}
        confirmText="Confirm Restoration"
        variant="success"
        isLoading={restoreMutation.isPending}
      />
    </div>
  )
}
