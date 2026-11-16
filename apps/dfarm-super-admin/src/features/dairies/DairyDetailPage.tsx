import React, { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { apiClient } from '@/api/client'
import { ClayCard } from '@/components/ui/ClayCard'
import { ClayBadge } from '@/components/ui/ClayBadge'
import { ClayButton } from '@/components/ui/ClayButton'
import { ClayTabs } from '@/components/ui/ClayTabs'
import { ClayInput } from '@/components/ui/ClayInput'
import { ClaySelect } from '@/components/ui/ClaySelect'
import { SuspendDairyModal } from './SuspendDairyModal'
import { ReactivateDairyModal } from './ReactivateDairyModal'
import { TransferAdminModal } from '../admins/TransferAdminModal'
import { DairyActivationModal } from './DairyActivationModal'
import { useAuth } from '@/context/AuthContext'
import { formatDate, formatMobile } from '@/utils/formatters'
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  ShieldCheck,
  User,
  Clock,
  Activity,
  HardDrive,
  Cpu,
  History,
  Sliders,
  AlertTriangle,
  ArrowLeft,
  ShieldAlert,
  Send,
  CheckCircle2,
  XCircle,
  KeyRound,
  Sparkles,
} from 'lucide-react'
import { DairyLocationPicker } from './DairyLocationPicker'

export const DairyDetailPage: React.FC = () => {
  const { dairyId } = useParams<{ dairyId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState('overview')
  const [suspendModalOpen, setSuspendModalOpen] = useState(false)
  const [reactivateModalOpen, setReactivateModalOpen] = useState(false)
  const [transferModalOpen, setTransferModalOpen] = useState(false)
  const [activationModalOpen, setActivationModalOpen] = useState(false)
  const [configSuccess, setConfigSuccess] = useState(false)
  const [isEditingLocation, setIsEditingLocation] = useState(false)
  const [pendingLocation, setPendingLocation] = useState<{
    latitude: number
    longitude: number
    addressLine1?: string
    formattedAddress?: string
    placeId?: string
    district?: string
    state?: string
    pincode?: string
    villageLocality?: string
  } | null>(null)
  const [isSavingLocation, setIsSavingLocation] = useState(false)
  const [locationSuccessMsg, setLocationSuccessMsg] = useState<string | null>(null)

  const handleSaveLocation = async () => {
    if (!dairy || !pendingLocation) return
    setIsSavingLocation(true)
    try {
      await apiClient.updateDairyLocation(dairy.id, pendingLocation, user || undefined)
      await queryClient.invalidateQueries({ queryKey: queryKeys.dairies.detail(dairyId || '') })
      await queryClient.invalidateQueries({ queryKey: ['dairies'] })
      setLocationSuccessMsg(`Location coordinates updated to ${pendingLocation.latitude.toFixed(6)}, ${pendingLocation.longitude.toFixed(6)}`)
      setIsEditingLocation(false)
      setPendingLocation(null)
      setTimeout(() => setLocationSuccessMsg(null), 4000)
    } catch (err: any) {
      alert(err.message || 'Failed to update location')
    } finally {
      setIsSavingLocation(false)
    }
  }

  // Fetch dairy details
  const {
    data: dairy,
    isLoading: isDairyLoading,
    error: dairyError,
    refetch: refetchDairy,
  } = useQuery({
    queryKey: queryKeys.dairies.detail(dairyId || ''),
    queryFn: () => apiClient.getDairyById(dairyId || ''),
    enabled: !!dairyId,
  })

  // Fetch admin accounts for this dairy
  const { data: admins = [] } = useQuery({
    queryKey: queryKeys.admins.list({ dairyId: dairy?.id }),
    queryFn: () => apiClient.getAdmins({ dairyId: dairy?.id }),
    enabled: !!dairy?.id,
  })

  // Fetch audit logs for this dairy
  const { data: auditLogs = [] } = useQuery({
    queryKey: queryKeys.audit.list({ dairyId: dairy?.id }),
    queryFn: () => apiClient.getAuditLogs({ dairyId: dairy?.id }),
    enabled: !!dairy?.id,
  })

  // Config form state
  const [configForm, setConfigForm] = useState({
    timezone: 'Asia/Kolkata',
    locale: 'en-IN',
    allowSelfRegistration: false,
    offlineSyncGracePeriodHours: 48,
    automaticFatTestingIntegration: true,
    smsAlertsEnabled: true,
    chillingCenterSync: false,
  })

  // Populate config form when dairy loads
  React.useEffect(() => {
    if (dairy?.configuration) {
      setConfigForm({
        timezone: dairy.configuration.timezone || 'Asia/Kolkata',
        locale: dairy.configuration.locale || 'en-IN',
        allowSelfRegistration: dairy.configuration.allowSelfRegistration || false,
        offlineSyncGracePeriodHours: dairy.configuration.offlineSyncGracePeriodHours || 48,
        automaticFatTestingIntegration:
          dairy.configuration.featureFlags.automaticFatTestingIntegration || false,
        smsAlertsEnabled: dairy.configuration.featureFlags.smsAlertsEnabled || false,
        chillingCenterSync: dairy.configuration.featureFlags.chillingCenterSync || false,
      })
    }
  }, [dairy])

  // Config mutation
  const configMutation = useMutation({
    mutationFn: () => {
      if (!dairy || !user) throw new Error('Unauthenticated')
      return apiClient.updateDairyConfig(
        {
          dairyId: dairy.id,
          configuration: {
            timezone: configForm.timezone,
            locale: configForm.locale,
            allowSelfRegistration: configForm.allowSelfRegistration,
            offlineSyncGracePeriodHours: Number(configForm.offlineSyncGracePeriodHours),
            featureFlags: {
              automaticFatTestingIntegration: configForm.automaticFatTestingIntegration,
              smsAlertsEnabled: configForm.smsAlertsEnabled,
              chillingCenterSync: configForm.chillingCenterSync,
            },
          },
        },
        user
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dairies.detail(dairyId || '') })
      setConfigSuccess(true)
      setTimeout(() => setConfigSuccess(false), 3000)
    },
  })

  // Resend invitation mutation
  const resendInviteMutation = useMutation({
    mutationFn: (adminId: string) => {
      if (!user) throw new Error('Unauthenticated')
      return apiClient.resendInvitation({ adminId }, user)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admins.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.dairies.detail(dairyId || '') })
    },
  })

  if (isDairyLoading) {
    return (
      <div className="py-24 text-center">
        <div className="w-10 h-10 border-3 border-[#FF6A00] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs font-semibold text-[#817A75]">Loading dairy details...</p>
      </div>
    )
  }

  if (dairyError || !dairy) {
    return (
      <ClayCard variant="peach" className="max-w-lg mx-auto text-center p-8 space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-[#211B18]">Dairy Tenant Not Found</h2>
        <p className="text-xs text-[#817A75]">
          The requested dairy tenant does not exist or has been archived.
        </p>
        <ClayButton variant="outline" onClick={() => navigate('/dairies')}>
          Return to Directory
        </ClayButton>
      </ClayCard>
    )
  }

  const primaryAdmin = admins.find((a) => a.id === dairy.primaryAdminId) || admins[0]

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dairies')}
            className="p-2 rounded-xl bg-white border border-[#F1E7E0] text-[#817A75] hover:text-[#211B18] shadow-xs cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-[#211B18] tracking-tight">
                {dairy.name}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-[#FFE9DC] text-[#C2410C] font-mono text-xs font-bold border border-[#FDBA74]">
                {dairy.code}
              </span>
              <ClayBadge variant={dairy.status} />
            </div>
            <p className="text-xs text-[#817A75] mt-0.5">
              Multi-tenant isolated node • Registered on {formatDate(dairy.createdAt)}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <ClayButton
            variant={dairy.operationalReadiness.primaryAdminActivated ? 'outline' : 'primary'}
            size="sm"
            onClick={() => setActivationModalOpen(true)}
            leftIcon={<KeyRound className="w-4 h-4 text-[#FF6A00]" />}
          >
            {dairy.operationalReadiness.primaryAdminActivated ? 'Activation Info' : 'Activate Admin'}
          </ClayButton>

          <Link to={`/support-access?dairyId=${dairy.id}`}>
            <ClayButton
              variant="outline"
              size="sm"
              leftIcon={<ShieldAlert className="w-4 h-4 text-amber-600" />}
            >
              Support Access
            </ClayButton>
          </Link>

          <ClayButton
            variant="outline"
            size="sm"
            onClick={() => setTransferModalOpen(true)}
            leftIcon={<User className="w-4 h-4 text-blue-600" />}
          >
            Transfer Admin
          </ClayButton>

          {dairy.status === 'suspended' ? (
            <ClayButton
              variant="primary"
              size="sm"
              onClick={() => setReactivateModalOpen(true)}
              leftIcon={<CheckCircle2 className="w-4 h-4" />}
            >
              Reactivate Dairy
            </ClayButton>
          ) : (
            <ClayButton
              variant="danger"
              size="sm"
              onClick={() => setSuspendModalOpen(true)}
              leftIcon={<XCircle className="w-4 h-4" />}
            >
              Suspend Dairy
            </ClayButton>
          )}
        </div>
      </div>

      {/* Suspension Alert Banner if suspended */}
      {dairy.status === 'suspended' && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-3 shadow-xs">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <strong className="block text-sm font-bold text-rose-950">
              Tenant Suspended on {formatDate(dairy.suspendedAt)}
            </strong>
            <p className="mt-1">
              <strong>Mandatory Audit Reason:</strong> "{dairy.suspensionReason}"
            </p>
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <ClayTabs
        tabs={[
          { id: 'overview', label: 'Tenant Overview', icon: <Building2 className="w-4 h-4" /> },
          { id: 'admin', label: 'Primary Dairy Admin', icon: <User className="w-4 h-4" /> },
          { id: 'hardware', label: 'Hardware & Sync Telemetry', icon: <HardDrive className="w-4 h-4" /> },
          { id: 'config', label: 'Tenant Configuration', icon: <Sliders className="w-4 h-4" /> },
          {
            id: 'audit',
            label: 'Audit History',
            icon: <History className="w-4 h-4" />,
            badge: auditLogs.length,
          },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Activation Required Prompt Banner */}
          {!dairy.operationalReadiness.primaryAdminActivated && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50 via-orange-50 to-[#FFF7F2] border border-amber-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0 mt-0.5">
                  <KeyRound className="w-5 h-5 text-[#FF6A00]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="text-sm font-bold text-[#211B18]">
                      Primary Dairy Admin Activation Pending
                    </strong>
                    <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold">
                      25% Deployment Health
                    </span>
                  </div>
                  <p className="text-xs text-[#615953] mt-1 leading-relaxed">
                    Tenant onboarding requires Primary Administrator (<strong>{primaryAdmin?.fullName || dairy.primaryAdminName || 'Administrator'}</strong>) verification. Click to view the cryptographic activation link or activate directly.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
                <ClayButton
                  variant="primary"
                  size="sm"
                  className="w-full md:w-auto whitespace-nowrap"
                  onClick={() => setActivationModalOpen(true)}
                  leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                >
                  Open Activation Window
                </ClayButton>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Section 1: Business Profile */}
            <ClayCard variant="default" className="md:col-span-2 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#817A75] border-b border-[#F1E7E0] pb-2">
              Business Profile & Premise
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[#817A75] block">Business Name</span>
                <strong className="text-sm text-[#211B18]">{dairy.name}</strong>
              </div>
              <div>
                <span className="text-[#817A75] block">Unique Tenant Code</span>
                <strong className="font-mono text-sm text-[#FF6A00]">{dairy.code}</strong>
              </div>
              <div>
                <span className="text-[#817A75] block">Official Contact Phone</span>
                <strong className="text-[#211B18]">{dairy.contact.businessPhone || '—'}</strong>
              </div>
              <div>
                <span className="text-[#817A75] block">Official Business Email</span>
                <strong className="text-[#211B18]">{dairy.contact.businessEmail || '—'}</strong>
              </div>
              <div className="sm:col-span-2">
                <span className="text-[#817A75] block">Premises Address</span>
                <strong className="text-[#211B18]">
                  {dairy.location.addressLine1}
                  {dairy.location.addressLine2 ? `, ${dairy.location.addressLine2}` : ''}
                </strong>
              </div>
              <div>
                <span className="text-[#817A75] block">District & State</span>
                <strong className="text-[#211B18]">
                  {dairy.location.district}, {dairy.location.state}
                </strong>
              </div>
              <div>
                <span className="text-[#817A75] block">Postal Pincode</span>
                <strong className="font-mono text-[#211B18]">{dairy.location.pincode}</strong>
              </div>

              {/* Geographic Coordinates & Pin Drop */}
              <div className="sm:col-span-2 pt-2 border-t border-[#F1E7E0]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[#817A75] text-xs font-semibold flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#FF6A00]" />
                    Geographic Coordinates & Pin Drop
                  </span>
                  <div className="flex items-center gap-2">
                    {locationSuccessMsg && (
                      <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-medium border border-emerald-200">
                        {locationSuccessMsg}
                      </span>
                    )}
                    {isEditingLocation ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingLocation(false)
                            setPendingLocation(null)
                          }}
                          className="text-xs text-[#817A75] hover:text-[#211B18] px-2.5 py-1 rounded-md border border-[#F1E7E0] bg-white transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveLocation}
                          disabled={isSavingLocation || !pendingLocation}
                          className="text-xs text-white bg-[#FF6A00] hover:bg-[#E05D00] px-3 py-1 rounded-md font-bold shadow-sm transition-colors disabled:opacity-50"
                        >
                          {isSavingLocation ? 'Saving...' : 'Save Pin Location'}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsEditingLocation(true)}
                        className="text-xs text-[#FF6A00] hover:text-[#E05D00] px-2.5 py-1 rounded-md border border-[#FFD0B0] bg-[#FFF5EE] font-semibold transition-colors flex items-center gap-1"
                      >
                        <MapPin className="w-3 h-3" /> Edit Pin
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="font-mono text-xs bg-[#FFF5EE] px-2.5 py-1 rounded-md border border-[#F1E7E0] text-[#FF6A00] font-bold">
                    {dairy.location.latitude !== undefined && dairy.location.longitude !== undefined
                      ? `${dairy.location.latitude.toFixed(6)}, ${dairy.location.longitude.toFixed(6)}`
                      : '18.520430, 73.856744 (Default)'}
                  </span>
                  {dairy.location.formattedAddress && (
                    <span className="text-xs text-[#817A75]">
                      {dairy.location.formattedAddress}
                    </span>
                  )}
                </div>

                {isEditingLocation && (
                  <p className="text-xs text-[#817A75] mb-2 bg-[#FFF8F2] p-2 rounded-lg border border-[#FFE0CC]">
                    💡 <strong>Interactive Pin Adjustment:</strong> Click anywhere on the map or drag the pin to set new geographic coordinates, then click <strong>Save Pin Location</strong> to update across the tenant directory.
                  </p>
                )}

                <div className="rounded-xl overflow-hidden mt-2">
                  <DairyLocationPicker
                    initialLatitude={dairy.location.latitude ?? 18.5204303}
                    initialLongitude={dairy.location.longitude ?? 73.8567437}
                    initialAddress={dairy.location.formattedAddress || dairy.location.addressLine1}
                    onLocationSelect={(loc) => setPendingLocation(loc)}
                    readOnly={!isEditingLocation}
                  />
                </div>
              </div>
            </div>
          </ClayCard>

          {/* Section 2: Operational Readiness Scorecard */}
          <ClayCard variant="peach" className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#817A75] border-b border-[#FFE9DC] pb-2">
              Operational Readiness
            </h3>

            <div className="text-center py-2">
              <div className="text-3xl font-black text-[#FF6A00]">
                {dairy.operationalReadiness.readinessScore}%
              </div>
              <span className="text-xs text-[#817A75]">Platform Deployment Health</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2 rounded-xl bg-white/70">
                <span>Business Profile</span>
                {dairy.operationalReadiness.businessProfileComplete ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-amber-500" />
                )}
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-white/70">
                <span className="font-medium text-[#211B18]">Primary Admin Activated</span>
                {dairy.operationalReadiness.primaryAdminActivated ? (
                  <span className="flex items-center gap-1 text-emerald-600 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4" /> Active
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActivationModalOpen(true)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors text-[11px] font-bold cursor-pointer"
                  >
                    <Clock className="w-3 h-3 text-amber-600" />
                    <span>Pending · Activate</span>
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-white/70">
                <span>Hardware Devices Synced</span>
                {dairy.operationalReadiness.hardwareSynced ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-amber-500" />
                )}
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-white/70">
                <span>Collection Staff Trained</span>
                {dairy.operationalReadiness.collectionStaffTrained ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-amber-500" />
                )}
              </div>
            </div>
          </ClayCard>
        </div>
      </div>
      )}

      {/* TAB 2: PRIMARY DAIRY ADMIN */}
      {activeTab === 'admin' && (
        <div className="space-y-6">
          <ClayCard variant="default" className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#F1E7E0] pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#817A75]">
                  Primary Dairy Administrator
                </h3>
                <p className="text-xs text-[#817A75]">
                  Strict Platform Boundary: Exactly one Primary Admin holds root ownership for this tenant.
                </p>
              </div>

              <ClayButton
                variant="outline"
                size="sm"
                onClick={() => setTransferModalOpen(true)}
              >
                Initiate Ownership Transfer
              </ClayButton>
            </div>

            {primaryAdmin ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 text-xs pt-2">
                <div className="p-3.5 rounded-2xl bg-[#FAF6F3] border border-[#F1E7E0]">
                  <span className="text-[#817A75] block">Full Name</span>
                  <strong className="text-sm text-[#211B18] mt-1 block">{primaryAdmin.fullName}</strong>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#FAF6F3] border border-[#F1E7E0]">
                  <span className="text-[#817A75] block">Primary Admin Email</span>
                  <strong className="text-sm text-[#211B18] mt-1 block truncate">
                    {primaryAdmin.email || dairy.contact.businessEmail || '—'}
                  </strong>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#FAF6F3] border border-[#F1E7E0]">
                  <span className="text-[#817A75] block">Registered Mobile</span>
                  <strong className="text-sm text-[#211B18] mt-1 block">
                    {formatMobile(primaryAdmin.mobile)}
                  </strong>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#FAF6F3] border border-[#F1E7E0]">
                  <span className="text-[#817A75] block">Verification Status</span>
                  <div className="mt-1">
                    <ClayBadge variant={primaryAdmin.verificationStatus} />
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#FAF6F3] border border-[#F1E7E0]">
                  <span className="text-[#817A75] block">Account Status</span>
                  <div className="mt-1">
                    <ClayBadge variant={primaryAdmin.status} />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#817A75]">No primary admin record located.</p>
            )}

            {/* Invitation Status & Resend */}
            {primaryAdmin && primaryAdmin.verificationStatus === 'unverified' && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-900 mt-4">
                <div>
                  <strong className="block font-bold">
                    Activation Pending: Primary Admin Invitation Dispatched
                  </strong>
                  <span>
                    Sent on {formatDate(primaryAdmin.invitationSentAt)} via {primaryAdmin.invitationChannel.toUpperCase()} to <strong>{primaryAdmin.email || dairy.contact.businessEmail}</strong>.
                    {primaryAdmin.invitationExpiresAt && (
                      <span className="ml-2 font-semibold text-amber-800">Expires: {formatDate(primaryAdmin.invitationExpiresAt)}</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <ClayButton
                    variant="primary"
                    size="sm"
                    onClick={() => setActivationModalOpen(true)}
                    leftIcon={<KeyRound className="w-3.5 h-3.5" />}
                  >
                    Open Activation Window
                  </ClayButton>
                  <ClayButton
                    variant="secondary"
                    size="sm"
                    isLoading={resendInviteMutation.isPending}
                    onClick={() => resendInviteMutation.mutate(primaryAdmin.id)}
                    leftIcon={<Send className="w-3.5 h-3.5" />}
                  >
                    Resend Email
                  </ClayButton>
                </div>
              </div>
            )}
          </ClayCard>
        </div>
      )}

      {/* TAB 3: HARDWARE & SYNC TELEMETRY */}
      {activeTab === 'hardware' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ClayCard variant="default" className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#817A75] border-b border-[#F1E7E0] pb-2">
              Collection Hardware Units
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-4 rounded-2xl bg-[#FAF6F3] border border-[#F1E7E0]">
                <span className="text-[#817A75]">Registered Units</span>
                <div className="text-2xl font-black text-[#211B18] mt-1">
                  {dairy.deviceSummary.registeredDevicesCount}
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-[#ECFDF5] border border-emerald-200">
                <span className="text-emerald-700">Online Units</span>
                <div className="text-2xl font-black text-emerald-800 mt-1">
                  {dairy.deviceSummary.onlineDevicesCount}
                </div>
              </div>
            </div>

            <div className="text-xs space-y-2 pt-2">
              <div className="flex justify-between py-1 border-b border-[#F1E7E0]">
                <span className="text-[#817A75]">Firmware Versions</span>
                <strong className="text-[#211B18]">{dairy.deviceSummary.firmwareVersionsSummary}</strong>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#817A75]">Last Hardware Heartbeat</span>
                <strong className="text-[#211B18]">{formatDate(dairy.deviceSummary.lastHeartbeatAt)}</strong>
              </div>
            </div>
          </ClayCard>

          <ClayCard variant="default" className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#817A75] border-b border-[#F1E7E0] pb-2">
              Edge Synchronization Health
            </h3>

            <div className="flex items-center justify-between">
              <span className="text-xs text-[#817A75]">Node Sync State</span>
              <ClayBadge variant={dairy.syncHealth.status} />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-4 rounded-2xl bg-[#FAF6F3] border border-[#F1E7E0]">
                <span className="text-[#817A75]">Average Latency</span>
                <div className="text-xl font-black text-[#211B18] mt-1">
                  {dairy.syncHealth.averageLatencyMs} ms
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-[#FAF6F3] border border-[#F1E7E0]">
                <span className="text-[#817A75]">Pending Packets</span>
                <div className="text-xl font-black text-[#211B18] mt-1">
                  {dairy.syncHealth.pendingSyncEventsCount}
                </div>
              </div>
            </div>

            <div className="text-xs space-y-2 pt-2">
              <div className="flex justify-between py-1 border-b border-[#F1E7E0]">
                <span className="text-[#817A75]">Last Successful Synchronization</span>
                <strong className="text-[#211B18]">{formatDate(dairy.syncHealth.lastSyncAt)}</strong>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#817A75]">Ingestion Errors (24h)</span>
                <strong className="text-[#211B18]">{dairy.syncHealth.errorCountLast24h}</strong>
              </div>
            </div>
          </ClayCard>
        </div>
      )}

      {/* TAB 4: TENANT CONFIGURATION */}
      {activeTab === 'config' && (
        <ClayCard variant="default" className="max-w-2xl space-y-5">
          <div className="border-b border-[#F1E7E0] pb-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#817A75]">
              Approved Tenant Configuration Options
            </h3>
            <p className="text-xs text-[#817A75] mt-0.5">
              Platform-level policy control. Changes require backend validation and generate audit entries.
            </p>
          </div>

          {configSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Tenant configuration successfully updated and audited.</span>
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <ClaySelect
                label="Tenant Operational Timezone"
                value={configForm.timezone}
                onChange={(e) => setConfigForm({ ...configForm, timezone: e.target.value })}
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option>
              </ClaySelect>

              <ClaySelect
                label="Default In-App Locale"
                value={configForm.locale}
                onChange={(e) => setConfigForm({ ...configForm, locale: e.target.value })}
              >
                <option value="en-IN">English (India)</option>
                <option value="hi-IN">Hindi (हिन्दी)</option>
                <option value="kn-IN">Kannada (ಕನ್ನಡ)</option>
                <option value="mr-IN">Marathi (मराठी)</option>
                <option value="te-IN">Telugu (తెలుగు)</option>
                <option value="ta-IN">Tamil (தமிழ்)</option>
              </ClaySelect>
            </div>

            <ClayInput
              label="Offline Ingestion Grace Period (Hours)"
              type="number"
              value={configForm.offlineSyncGracePeriodHours}
              onChange={(e) =>
                setConfigForm({
                  ...configForm,
                  offlineSyncGracePeriodHours: Number(e.target.value),
                })
              }
              helperText="Maximum allowed lag before tenant hardware flags sync warning"
            />

            <div className="pt-2 border-t border-[#F1E7E0] space-y-3">
              <span className="text-xs font-bold text-[#211B18] block">
                Platform Feature Flag Entitlements
              </span>

              <label className="flex items-center gap-2.5 text-xs text-[#211B18] cursor-pointer">
                <input
                  type="checkbox"
                  checked={configForm.automaticFatTestingIntegration}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      automaticFatTestingIntegration: e.target.checked,
                    })
                  }
                  className="rounded border-[#F1E7E0] text-[#FF6A00] focus:ring-[#FF6A00]"
                />
                <span>Automatic Ultrasonic Fat/SNF Analyzer Sync</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-[#211B18] cursor-pointer">
                <input
                  type="checkbox"
                  checked={configForm.smsAlertsEnabled}
                  onChange={(e) =>
                    setConfigForm({ ...configForm, smsAlertsEnabled: e.target.checked })
                  }
                  className="rounded border-[#F1E7E0] text-[#FF6A00] focus:ring-[#FF6A00]"
                />
                <span>Automated SMS Dispatch for Daily Milk Slips</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-[#211B18] cursor-pointer">
                <input
                  type="checkbox"
                  checked={configForm.chillingCenterSync}
                  onChange={(e) =>
                    setConfigForm({ ...configForm, chillingCenterSync: e.target.checked })
                  }
                  className="rounded border-[#F1E7E0] text-[#FF6A00] focus:ring-[#FF6A00]"
                />
                <span>Bulk Milk Cooler (BMC) Telemetry Integration</span>
              </label>
            </div>

            <div className="pt-4 flex justify-end">
              <ClayButton
                type="button"
                variant="primary"
                isLoading={configMutation.isPending}
                onClick={() => configMutation.mutate()}
              >
                Save Configuration Changes
              </ClayButton>
            </div>
          </div>
        </ClayCard>
      )}

      {/* TAB 5: AUDIT HISTORY */}
      {activeTab === 'audit' && (
        <ClayCard variant="default" className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#817A75] border-b border-[#F1E7E0] pb-2">
            Append-Only Audit History ({auditLogs.length} Events)
          </h3>

          {auditLogs.length === 0 ? (
            <p className="text-xs text-[#817A75] py-4 text-center">
              No audit entries recorded for this dairy tenant yet.
            </p>
          ) : (
            <div className="space-y-3">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3.5 rounded-2xl bg-[#FAF6F3] border border-[#F1E7E0] text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#211B18]">{log.actionDescription}</span>
                    <span className="text-[#817A75] font-mono text-[11px]">
                      {formatDate(log.timestamp)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[#817A75] text-[11px]">
                    <span>Actor: <strong>{log.actorName}</strong></span>
                    <span>•</span>
                    <span>Action: <code className="font-mono">{log.action}</code></span>
                    <span>•</span>
                    <span>IP: {log.ipAddress}</span>
                  </div>
                  {log.reason && (
                    <p className="text-amber-900 bg-amber-50 p-2 rounded-lg italic">
                      Reason: "{log.reason}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </ClayCard>
      )}

      {/* Modal Dialogs */}
      <SuspendDairyModal
        isOpen={suspendModalOpen}
        onClose={() => setSuspendModalOpen(false)}
        dairy={dairy}
      />

      <ReactivateDairyModal
        isOpen={reactivateModalOpen}
        onClose={() => setReactivateModalOpen(false)}
        dairy={dairy}
      />

      <TransferAdminModal
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        dairy={dairy}
        currentAdmin={primaryAdmin || null}
      />

      <DairyActivationModal
        isOpen={activationModalOpen}
        onClose={() => setActivationModalOpen(false)}
        dairy={dairy}
        primaryAdmin={primaryAdmin}
        onActivated={() => refetchDairy()}
      />
    </div>
  )
}
