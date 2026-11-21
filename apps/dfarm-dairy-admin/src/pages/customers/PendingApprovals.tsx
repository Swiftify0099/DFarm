import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import type { CustomerRegistrationRequest } from '@/types'
import {
  ClayCard,
  ClayButton,
  ClayBadge,
  ClayModal,
  ConfirmationModal,
  ClayAlert,
  ClayTable,
  Column,
} from '@/components/ui'
import { FaceBiometricVisual, CowVisual, BuffaloVisual } from '@/assets/illustrations'
import { UserCheck, UserX, Shield, CheckCircle2, Clock, Smartphone, MapPin, Building, Eye } from 'lucide-react'

export const PendingApprovals: React.FC = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [selectedReq, setSelectedReq] = useState<CustomerRegistrationRequest | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showApproveConfirm, setShowApproveConfirm] = useState(false)
  const [showRejectConfirm, setShowRejectConfirm] = useState(false)
  const [targetReqId, setTargetReqId] = useState<string | null>(null)
  const [alertNotice, setAlertNotice] = useState<{ type: 'success' | 'danger'; message: string } | null>(null)

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['pendingRegistrations', user?.dairyId],
    queryFn: () => api.customers.getPending(),
  })

  const pendingList = requests.filter((r) => r.status === 'PENDING')

  // Approve Mutation
  const approveMutation = useMutation({
    mutationFn: (requestId: string) => api.customers.approve(requestId, user?.fullName || 'Dairy Admin'),
    onSuccess: (newCust) => {
      queryClient.invalidateQueries({ queryKey: ['pendingRegistrations', user?.dairyId] })
      queryClient.invalidateQueries({ queryKey: ['customers', user?.dairyId] })
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary', user?.dairyId] })
      setShowApproveConfirm(false)
      setShowDetailModal(false)
      setAlertNotice({
        type: 'success',
        message: `Successfully approved farmer registration for ${newCust.fullName} (Assigned Code: ${newCust.customerCode}).`,
      })
    },
    onError: (err: any) => {
      setAlertNotice({
        type: 'danger',
        message: err.message || 'Failed to approve registration',
      })
    },
  })

  // Reject Mutation
  const rejectMutation = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason: string }) =>
      api.customers.reject(requestId, reason, user?.fullName || 'Dairy Admin'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingRegistrations', user?.dairyId] })
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary', user?.dairyId] })
      setShowRejectConfirm(false)
      setShowDetailModal(false)
      setAlertNotice({
        type: 'success',
        message: 'Registration request successfully rejected with audit reason.',
      })
    },
    onError: (err: any) => {
      setAlertNotice({
        type: 'danger',
        message: err.message || 'Failed to reject registration',
      })
    },
  })

  const columns: Column<CustomerRegistrationRequest>[] = [
    {
      key: 'candidateName',
      header: 'Applicant Name',
      render: (row) => (
        <div>
          <p className="font-bold text-[#211B18]">{row.candidateName}</p>
          <p className="text-xs text-[#817A75] flex items-center gap-1 mt-0.5">
            <Smartphone size={12} /> +91 {row.mobileNumber}
          </p>
        </div>
      ),
    },
    {
      key: 'village',
      header: 'Village / Address',
      render: (row) => (
        <div>
          <p className="font-semibold text-[#211B18] flex items-center gap-1">
            <MapPin size={12} className="text-[#FF6A00]" /> {row.village}
          </p>
          <p className="text-xs text-[#817A75] truncate max-w-xs">{row.address}</p>
        </div>
      ),
    },
    {
      key: 'preferredCategory',
      header: 'Milk Type',
      render: (row) => (
        <ClayBadge
          variant={row.preferredCategory === 'COW' ? 'cow' : 'buffalo'}
          icon={row.preferredCategory === 'COW' ? <CowVisual size={16} /> : <BuffaloVisual size={16} />}
        >
          {row.preferredCategory}
        </ClayBadge>
      ),
    },
    {
      key: 'faceCapture',
      header: 'Biometric Status (YuNet/SFace)',
      render: (row) => (
        <div className="flex items-center gap-2">
          <FaceBiometricVisual size={20} />
          <div>
            <span className="text-xs font-bold text-emerald-800">
              Score: {row.faceCapture.qualityScore.toFixed(1)}%
            </span>
            <p className="text-[10px] text-[#817A75]">Consent Confirmed</p>
          </div>
        </div>
      ),
    },
    {
      key: 'submittedAt',
      header: 'Submitted',
      render: (row) => (
        <div className="text-xs text-[#817A75] flex items-center gap-1">
          <Clock size={12} />
          {new Date(row.submittedAt).toLocaleDateString([], {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <ClayButton
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedReq(row)
              setShowDetailModal(true)
            }}
            leftIcon={<Eye size={14} />}
          >
            Review
          </ClayButton>
          <ClayButton
            variant="primary"
            size="sm"
            onClick={() => {
              setTargetReqId(row.id)
              setShowApproveConfirm(true)
            }}
            leftIcon={<UserCheck size={14} />}
          >
            Approve
          </ClayButton>
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
            <h1 className="text-2xl font-black text-[#211B18] tracking-tight">
              Pending Customer Registrations
            </h1>
            <ClayBadge variant="pending" className="text-xs">
              {pendingList.length} Pending
            </ClayBadge>
          </div>
          <p className="text-xs text-[#817A75] mt-1 font-medium">
            Review applicant details, facial biometric enrollment quality (YuNet + SFace), and consent evidence.
          </p>
        </div>
      </div>

      {alertNotice && (
        <ClayAlert
          type={alertNotice.type}
          message={alertNotice.message}
          action={
            <button
              onClick={() => setAlertNotice(null)}
              className="text-xs underline font-bold cursor-pointer"
            >
              Dismiss
            </button>
          }
        />
      )}

      {/* Rules Notice */}
      <div className="p-4 bg-white rounded-xl border border-[#F1E7E0] flex items-start gap-3 shadow-xs text-xs text-[#817A75] leading-relaxed">
        <Shield size={18} className="text-[#FF6A00] shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-[#211B18]">Administrative Approval Policy: </span>
          Registrations submitted by farmers in the Customer App are never approved automatically. The Dairy Admin must
          verify identity uniqueness, village boundaries, bank credentials, and confirm the biometric template is
          properly captured before activating the account. Rejections require a clear reason.
        </div>
      </div>

      {/* Table */}
      <ClayCard className="!p-0 overflow-hidden">
        <ClayTable
          columns={columns}
          data={pendingList}
          keyExtractor={(r) => r.id}
          isLoading={isLoading}
          emptyMessage="No pending customer registrations"
          emptySubtext="New applications submitted from the Customer App will appear here."
        />
      </ClayCard>

      {/* Comprehensive Detail & Verification Modal */}
      {selectedReq && (
        <ClayModal
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          title="Review Customer Registration Dossier"
          subtitle={`Submitted on ${new Date(selectedReq.submittedAt).toLocaleString()}`}
          maxWidth="lg"
        >
          <div className="space-y-4 text-left">
            {/* Candidate Identity */}
            <div className="p-4 bg-[#FFF5EE] rounded-xl border border-[#FFE9DC]">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#FF6A00] mb-2">
                Candidate Profile
              </h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[#817A75]">Full Name:</span>
                  <p className="font-bold text-[#211B18] text-sm mt-0.5">{selectedReq.candidateName}</p>
                </div>
                <div>
                  <span className="text-[#817A75]">Verified Mobile:</span>
                  <p className="font-bold text-[#211B18] text-sm mt-0.5">+91 {selectedReq.mobileNumber}</p>
                </div>
                <div>
                  <span className="text-[#817A75]">Village:</span>
                  <p className="font-semibold text-[#211B18] mt-0.5">{selectedReq.village}</p>
                </div>
                <div>
                  <span className="text-[#817A75]">Residential Address:</span>
                  <p className="font-semibold text-[#211B18] mt-0.5">{selectedReq.address}</p>
                </div>
              </div>
            </div>

            {/* Biometric Verification Box */}
            <div className="p-4 bg-white rounded-xl border border-[#F1E7E0] shadow-xs">
              <div className="flex items-center gap-2 mb-3">
                <FaceBiometricVisual size={22} />
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#211B18]">
                  OpenCV Face Biometrics (YuNet & SFace ONNX)
                </h4>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[#817A75]">Model Pipeline:</span>
                  <p className="font-mono font-bold text-[#211B18] mt-0.5">
                    {selectedReq.faceCapture.modelVersion}
                  </p>
                </div>
                <div>
                  <span className="text-[#817A75]">Template Quality:</span>
                  <p className="font-bold text-emerald-700 mt-0.5">
                    {selectedReq.faceCapture.qualityScore.toFixed(1)}% (Passed)
                  </p>
                </div>
                <div>
                  <span className="text-[#817A75]">Consent Agreed:</span>
                  <p className="font-bold text-emerald-700 mt-0.5">
                    {selectedReq.faceCapture.consentAgreed ? 'Yes, Logged' : 'No'}
                  </p>
                </div>
                <div>
                  <span className="text-[#817A75]">Capture Device:</span>
                  <p className="font-semibold text-[#211B18] mt-0.5">
                    {selectedReq.faceCapture.captureDevice}
                  </p>
                </div>
                <div className="col-span-2">
                  <span className="text-[#817A75]">Consent Timestamp:</span>
                  <p className="font-mono text-[11px] text-[#211B18] mt-0.5">
                    {selectedReq.faceCapture.consentTimestamp}
                  </p>
                </div>
              </div>

              <div className="mt-3 p-2.5 bg-emerald-50 rounded-lg border border-emerald-200 text-[11px] text-emerald-900 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>
                  Raw image and embeddings are encrypted and protected. Template will be pushed to Kiosk cache upon
                  approval.
                </span>
              </div>
            </div>

            {/* Bank Information (if provided) */}
            {selectedReq.bankDetails && (
              <div className="p-4 bg-white rounded-xl border border-[#F1E7E0]">
                <div className="flex items-center gap-2 mb-2">
                  <Building size={16} className="text-[#FF6A00]" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#211B18]">
                    Bank Account for Milk Payments
                  </h4>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-[#817A75]">Bank:</span>
                    <p className="font-bold text-[#211B18]">{selectedReq.bankDetails.bankName}</p>
                  </div>
                  <div>
                    <span className="text-[#817A75]">Account No:</span>
                    <p className="font-mono font-bold text-[#211B18]">
                      {selectedReq.bankDetails.accountNumber}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#817A75]">IFSC Code:</span>
                    <p className="font-mono font-bold text-[#211B18]">{selectedReq.bankDetails.ifscCode}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-[#F1E7E0]">
              <ClayButton
                variant="danger"
                size="md"
                onClick={() => {
                  setTargetReqId(selectedReq.id)
                  setShowRejectConfirm(true)
                }}
                leftIcon={<UserX size={16} />}
              >
                Reject Request
              </ClayButton>

              <div className="flex items-center gap-2">
                <ClayButton variant="ghost" size="md" onClick={() => setShowDetailModal(false)}>
                  Close
                </ClayButton>
                <ClayButton
                  variant="primary"
                  size="md"
                  onClick={() => {
                    setTargetReqId(selectedReq.id)
                    setShowApproveConfirm(true)
                  }}
                  leftIcon={<UserCheck size={16} />}
                >
                  Approve Registration
                </ClayButton>
              </div>
            </div>
          </div>
        </ClayModal>
      )}

      {/* Confirm Approve Modal */}
      <ConfirmationModal
        isOpen={showApproveConfirm}
        onClose={() => setShowApproveConfirm(false)}
        onConfirm={async () => {
          if (targetReqId) {
            await approveMutation.mutateAsync(targetReqId)
          }
        }}
        title="Confirm Farmer Registration Approval"
        message="This action will issue an authoritative Customer ID, activate their dairy membership, and register their YuNet biometric template with collection kiosks."
        confirmText="Confirm & Activate Customer"
        variant="success"
        isLoading={approveMutation.isPending}
      />

      {/* Confirm Reject Modal with Mandatory Reason */}
      <ConfirmationModal
        isOpen={showRejectConfirm}
        onClose={() => setShowRejectConfirm(false)}
        onConfirm={async (reason) => {
          if (targetReqId && reason) {
            await rejectMutation.mutateAsync({ requestId: targetReqId, reason })
          }
        }}
        title="Reject Registration Request"
        message="Please provide a clear reason for rejecting this customer application. The rejection notice will be communicated back to the applicant."
        confirmText="Confirm Rejection"
        variant="danger"
        requireReason={true}
        reasonLabel="Mandatory Rejection Rationale"
        reasonPlaceholder="e.g. Village outside operational milk route; inaccurate bank documentation"
        isLoading={rejectMutation.isPending}
      />
    </div>
  )
}
