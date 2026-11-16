import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import type { FaceEnrollmentRecord } from '@/types'
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
import { FaceBiometricVisual } from '@/assets/illustrations'
import { Shield, RefreshCw, Ban, Eye, CheckCircle2, History } from 'lucide-react'

export const FaceEnrollmentList: React.FC = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [selectedRecord, setSelectedRecord] = useState<FaceEnrollmentRecord | null>(null)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [showReEnrollModal, setShowReEnrollModal] = useState(false)
  const [showRevokeModal, setShowRevokeModal] = useState(false)
  const [targetRecId, setTargetRecId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ type: 'success' | 'danger'; message: string } | null>(null)

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['faceEnrollments'],
    queryFn: () => api.faceEnrollment.getAll(),
  })

  // Re-enrollment mutation
  const reEnrollMutation = useMutation({
    mutationFn: ({ recordId, note }: { recordId: string; note: string }) =>
      api.faceEnrollment.requestReEnrollment(recordId, note, user?.fullName || 'Dairy Admin'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faceEnrollments'] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      setShowReEnrollModal(false)
      setNotice({ type: 'success', message: 'Re-enrollment notification dispatched to farmer mobile app.' })
    },
    onError: (err: any) => {
      setNotice({ type: 'danger', message: err.message || 'Failed to request re-enrollment' })
    },
  })

  // Revoke mutation
  const revokeMutation = useMutation({
    mutationFn: ({ recordId, reason }: { recordId: string; reason: string }) =>
      api.faceEnrollment.revoke(recordId, reason, user?.fullName || 'Dairy Admin'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faceEnrollments'] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      setShowRevokeModal(false)
      setNotice({ type: 'success', message: 'Face biometric template revoked and purged from collection kiosks.' })
    },
    onError: (err: any) => {
      setNotice({ type: 'danger', message: err.message || 'Failed to revoke biometric template' })
    },
  })

  const columns: Column<FaceEnrollmentRecord>[] = [
    {
      key: 'customer',
      header: 'Customer Details',
      render: (r) => (
        <div>
          <span className="font-extrabold text-[#FF6A00] text-xs bg-[#FFE9DC] px-2 py-0.5 rounded">
            {r.customerCode}
          </span>
          <span className="font-bold text-[#211B18] text-sm ml-2">{r.customerName}</span>
        </div>
      ),
    },
    {
      key: 'modelVersion',
      header: 'Model Pipeline',
      render: (r) => (
        <div>
          <span className="font-mono font-bold text-xs text-[#211B18]">{r.modelVersion}</span>
          <p className="text-[10px] text-[#817A75]">Template v{r.templateVersion}</p>
        </div>
      ),
    },
    {
      key: 'qualityScore',
      header: 'Quality Score',
      render: (r) => (
        <div>
          <span
            className={`font-bold text-xs ${
              r.qualityScore >= 85 ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {r.qualityScore.toFixed(1)}%
          </span>
          <p className="text-[10px] text-[#817A75]">
            {r.qualityScore >= 85 ? 'High Confidence' : 'Threshold Warning'}
          </p>
        </div>
      ),
    },
    {
      key: 'consentGiven',
      header: 'Consent Evidence',
      render: (r) => (
        <div className="text-xs">
          <span className="text-emerald-700 font-bold flex items-center gap-1">
            <CheckCircle2 size={13} /> Consent Logged
          </span>
          <p className="text-[10px] text-[#817A75]">
            {new Date(r.consentTimestamp).toLocaleDateString()}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Lifecycle Status',
      render: (r) => (
        <ClayBadge
          variant={
            r.status === 'APPROVED'
              ? 'approved'
              : r.status === 'REVOKED'
              ? 'rejected'
              : 'warning'
          }
        >
          {r.status}
        </ClayBadge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <ClayButton
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedRecord(r)
              setShowHistoryModal(true)
            }}
            leftIcon={<History size={14} />}
          >
            History
          </ClayButton>

          {r.status === 'APPROVED' && (
            <>
              <ClayButton
                variant="secondary"
                size="sm"
                onClick={() => {
                  setTargetRecId(r.id)
                  setShowReEnrollModal(true)
                }}
                leftIcon={<RefreshCw size={14} />}
              >
                Re-Enroll
              </ClayButton>
              <ClayButton
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-50"
                onClick={() => {
                  setTargetRecId(r.id)
                  setShowRevokeModal(true)
                }}
              >
                <Ban size={14} />
              </ClayButton>
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <FaceBiometricVisual size={28} />
          <h1 className="text-2xl font-black text-[#211B18] tracking-tight">
            Face Enrollment Lifecycle (OpenCV YuNet & SFace ONNX)
          </h1>
        </div>
        <p className="text-xs text-[#817A75] mt-1 font-medium">
          Manage administrative lifecycle of biometric face templates, consent audit trails, re-enrollment requests,
          and security revocations.
        </p>
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

      {/* Security notice */}
      <div className="p-4 bg-white rounded-xl border border-[#F1E7E0] flex items-start gap-3 shadow-xs text-xs text-[#817A75] leading-relaxed">
        <Shield size={18} className="text-[#FF6A00] shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-[#211B18]">Biometric Privacy & Zero-Knowledge Policy: </span>
          The Dairy Admin Web UI does not store or expose raw face images or unrestricted mathematical embeddings. Only
          cryptographic template signatures, model version hashes, quality scores, and explicit user consent logs are
          retained for administrative governance.
        </div>
      </div>

      {/* Table */}
      <ClayCard className="!p-0 overflow-hidden">
        <ClayTable
          columns={columns}
          data={records}
          keyExtractor={(r) => r.id}
          isLoading={isLoading}
          emptyMessage="No biometric records enrolled"
          emptySubtext="Customer biometric enrollments will appear here once submitted."
        />
      </ClayCard>

      {/* Audit History Modal */}
      {selectedRecord && (
        <ClayModal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          title={`Biometric Audit Trail: ${selectedRecord.customerName}`}
          subtitle={`Model: ${selectedRecord.modelVersion} • Template v${selectedRecord.templateVersion}`}
        >
          <div className="space-y-3 text-left">
            {selectedRecord.auditLogs.map((log, index) => (
              <div key={index} className="p-3 bg-[#FFF5EE] rounded-xl border border-[#FFE9DC] text-xs">
                <div className="flex items-center justify-between font-bold text-[#211B18]">
                  <span>{log.action}</span>
                  <span className="text-[11px] text-[#817A75] font-mono">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="text-[11px] text-[#817A75] mt-1">Operator: {log.operator}</p>
                {log.note && <p className="text-xs text-[#211B18] mt-1 font-medium">{log.note}</p>}
              </div>
            ))}
          </div>
        </ClayModal>
      )}

      {/* Request Re-Enrollment Modal */}
      <ConfirmationModal
        isOpen={showReEnrollModal}
        onClose={() => setShowReEnrollModal(false)}
        onConfirm={async (reason) => {
          if (targetRecId && reason) {
            await reEnrollMutation.mutateAsync({ recordId: targetRecId, note: reason })
          }
        }}
        title="Request Customer Re-Enrollment"
        message="Request a fresh facial scan from the customer. The customer will be prompted in their mobile application to re-capture their face under good lighting."
        confirmText="Dispatch Re-Enrollment Request"
        variant="primary"
        requireReason={true}
        reasonLabel="Reason for Re-Enrollment"
        reasonPlaceholder="e.g. Low quality score in morning kiosk sessions"
        isLoading={reEnrollMutation.isPending}
      />

      {/* Revoke Enrollment Modal */}
      <ConfirmationModal
        isOpen={showRevokeModal}
        onClose={() => setShowRevokeModal(false)}
        onConfirm={async (reason) => {
          if (targetRecId && reason) {
            await revokeMutation.mutateAsync({ recordId: targetRecId, reason })
          }
        }}
        title="Revoke Biometric Template"
        message="This will immediately revoke the customer's facial recognition template and purge it from all kiosk caches. The customer will have to rely on RFID cards until re-enrolled."
        confirmText="Confirm Revocation"
        variant="danger"
        requireReason={true}
        reasonLabel="Mandatory Reason for Revocation"
        reasonPlaceholder="e.g. Template compromise reported; identity dispute"
        isLoading={revokeMutation.isPending}
      />
    </div>
  )
}
