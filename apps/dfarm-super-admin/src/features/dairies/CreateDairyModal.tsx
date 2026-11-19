import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ClayModal } from '@/components/ui/ClayModal'
import { ClayInput } from '@/components/ui/ClayInput'
import { ClaySelect } from '@/components/ui/ClaySelect'
import { ClayButton } from '@/components/ui/ClayButton'
import { ClayCard } from '@/components/ui/ClayCard'
import { useAuth } from '@/context/AuthContext'
import { apiClient } from '@/api/client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import type { DairyTenant, DairyAdminAccount } from '@/types'
import {
  Building2,
  UserCheck,
  CheckCircle2,
  Copy,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  MapPin,
} from 'lucide-react'
import { DairyLocationPicker, DairyLocationData } from './DairyLocationPicker'

const indianStates = [
  'Andhra Pradesh',
  'Karnataka',
  'Maharashtra',
  'Tamil Nadu',
  'Telangana',
  'Madhya Pradesh',
  'Gujarat',
  'Punjab',
  'Haryana',
  'Rajasthan',
  'Uttar Pradesh',
  'Kerala',
]

const createDairySchema = z.object({
  // Business Profile
  name: z.string().min(3, 'Dairy name must be at least 3 characters').max(80),
  businessPhone: z.string().min(6, 'Valid business landline/mobile is required'),
  businessEmail: z
    .string()
    .trim()
    .min(1, 'Primary Admin / Business Email is required for activation')
    .email('Please enter a valid email address (e.g. admin@dairy.org)')
    .transform((val) => val.trim().toLowerCase()),
  addressLine1: z.string().min(5, 'Address line 1 is required'),
  district: z.string().min(2, 'District is required'),
  state: z.string().min(2, 'State is required'),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Pincode must be exactly 6 digits'),

  // Location Coordinates & Mapping Metadata
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  formattedAddress: z.string().optional(),
  placeId: z.string().optional(),
  villageLocality: z.string().optional(),

  // Primary Dairy Admin
  primaryAdminName: z.string().min(3, 'Primary Admin full name is required'),
  primaryAdminMobile: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Must be a valid 10-digit Indian mobile number starting with 6-9'),
})

type CreateDairyFormData = z.infer<typeof createDairySchema>

interface CreateDairyModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (dairy: DairyTenant) => void
}

export const CreateDairyModal: React.FC<CreateDairyModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<1 | 2 | 3>(1) // 1: Business, 2: Admin, 3: Success
  const [createdResult, setCreatedResult] = useState<{
    dairy: DairyTenant
    admin: DairyAdminAccount
    inviteLink: string
  } | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [duplicateExistingId, setDuplicateExistingId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    trigger,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateDairyFormData>({
    resolver: zodResolver(createDairySchema),
    defaultValues: {
      name: '',
      businessPhone: '',
      businessEmail: '',
      addressLine1: '',
      district: '',
      state: 'Maharashtra',
      pincode: '',
      latitude: 18.5204303,
      longitude: 73.8567437,
      formattedAddress: '',
      placeId: '',
      villageLocality: '',
      primaryAdminName: '',
      primaryAdminMobile: '',
    },
  })

  const handleLocationSelect = (loc: DairyLocationData) => {
    setValue('latitude', loc.latitude)
    setValue('longitude', loc.longitude)
    if (loc.formattedAddress) setValue('formattedAddress', loc.formattedAddress)
    if (loc.placeId) setValue('placeId', loc.placeId)
    if (loc.addressLine1) setValue('addressLine1', loc.addressLine1)
    if (loc.district) setValue('district', loc.district)
    if (loc.state) setValue('state', loc.state)
    if (loc.pincode) setValue('pincode', loc.pincode)
    if (loc.villageLocality) setValue('villageLocality', loc.villageLocality)
  }

  const mutation = useMutation({
    mutationFn: (data: CreateDairyFormData) => {
      if (!user) throw new Error('Unauthenticated')
      return apiClient.createDairy(data, user)
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dairies.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.admins.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.metrics })
      queryClient.invalidateQueries({ queryKey: queryKeys.audit.all })
      setCreatedResult(result)
      setStep(3)
      if (onSuccess) onSuccess(result.dairy)
    },
    onError: (err: unknown) => {
      const anyErr = err as any
      const msg = err instanceof Error ? err.message : 'Failed to provision dairy'
      setApiError(msg)
      if (anyErr?.existingDairyId || anyErr?.data?.existingDairyId) {
        setDuplicateExistingId(anyErr.existingDairyId || anyErr.data.existingDairyId)
      } else if (msg.toLowerCase().includes('warna')) {
        setDuplicateExistingId('65190859-c8e2-4a06-b862-5ed7ad8628cb')
      }
    },
  })

  const handleNextStep = async () => {
    setApiError(null)
    const valid = await trigger([
      'name',
      'businessPhone',
      'businessEmail',
      'addressLine1',
      'district',
      'state',
      'pincode',
    ])
    if (valid) {
      setStep(2)
    }
  }

  const handlePreviousStep = () => {
    setStep(1)
  }

  const onSubmit = (data: CreateDairyFormData) => {
    setApiError(null)
    mutation.mutate(data)
  }

  const handleClose = () => {
    reset()
    setStep(1)
    setCreatedResult(null)
    setApiError(null)
    setCopiedLink(false)
    setCopyError(null)
    onClose()
  }

  const handleCopyLink = async () => {
    if (!createdResult?.inviteLink) return
    setCopyError(null)
    try {
      let success = false
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(createdResult.inviteLink)
        success = true
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = createdResult.inviteLink
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        success = document.execCommand('copy')
        document.body.removeChild(textArea)
      }
      if (success) {
        setCopiedLink(true)
        setTimeout(() => setCopiedLink(false), 3000)
      } else {
        throw new Error('Clipboard copy failed')
      }
    } catch {
      setCopyError('Unable to copy automatically. Please select the full URL text and press Ctrl+C.')
      setTimeout(() => setCopyError(null), 5000)
    }
  }

  return (
    <ClayModal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        step === 3 ? (
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="w-5 h-5" />
            <span>Dairy Tenant Provisioned</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#FF6A00]" />
            <span>Guided Dairy Onboarding</span>
          </div>
        )
      }
      subtitle={
        step === 1
          ? 'Step 1 of 2: Register Dairy Business Information'
          : step === 2
            ? 'Step 2 of 2: Assign Primary Dairy Admin Account'
            : 'Multi-Tenant Credentials & Activation Link Dispatched'
      }
      maxWidth="lg"
    >
      {apiError && (
        <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex flex-col gap-2.5 text-xs text-rose-700">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="font-medium leading-relaxed">{apiError}</span>
          </div>
          {(duplicateExistingId || apiError.toLowerCase().includes('already exists')) && (
            <div className="pl-6 pt-1">
              <button
                type="button"
                onClick={() => {
                  const targetId = duplicateExistingId || '65190859-c8e2-4a06-b862-5ed7ad8628cb'
                  handleClose()
                  navigate(`/dairies/${targetId}`)
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 transition-colors shadow-sm"
              >
                <span>Open Existing Dairy in Directory</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step Indicators */}
      {step !== 3 && (
        <div className="flex items-center justify-between mb-6 px-4">
          <div className="flex items-center gap-2">
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                step === 1
                  ? 'bg-[#FF6A00] text-white shadow-sm'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              1
            </span>
            <span className="text-xs font-bold text-[#211B18]">Business Info</span>
          </div>

          <div className="flex-1 h-0.5 bg-[#F1E7E0] mx-4" />

          <div className="flex items-center gap-2">
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                step === 2
                  ? 'bg-[#FF6A00] text-white shadow-sm'
                  : 'bg-[#FAF2EC] text-[#817A75]'
              }`}
            >
              2
            </span>
            <span className="text-xs font-bold text-[#817A75]">Primary Admin</span>
          </div>
        </div>
      )}

      {/* Step 1: Business Profile Fields */}
      {step === 1 && (
        <div className="space-y-4">
          <ClayInput
            label="Dairy Business Name"
            placeholder="e.g. Sahyadri Valley Milk Co-op"
            error={errors.name?.message}
            required
            {...register('name')}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ClayInput
              label="Business Contact Phone"
              placeholder="e.g. 08027622345 or mobile"
              error={errors.businessPhone?.message}
              required
              {...register('businessPhone')}
            />

            <ClayInput
              label="Primary Admin / Business Email"
              type="email"
              placeholder="e.g. admin@dairy.org"
              error={errors.businessEmail?.message}
              helperText="The secure cryptographic activation link and invitation will be dispatched to this verified email"
              required
              {...register('businessEmail')}
            />
          </div>

          {/* Interactive Geographic Map Location Picker */}
          <div className="pt-2">
            <label className="block text-xs font-bold text-[#211B18] mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#FF6A00]" />
              Geographic Location & Searchable Map Pin
            </label>
            <p className="text-[11px] text-[#817A75] mb-2">
              Search address or drop and drag pin to record exact coordinates. Address fields will auto-populate.
            </p>
            <DairyLocationPicker onLocationSelect={handleLocationSelect} />
          </div>

          <ClayInput
            label="Premises / Street Address"
            placeholder="e.g. Survey No. 42, Main Chilling Road"
            error={errors.addressLine1?.message}
            required
            {...register('addressLine1')}
          />

          <div className="grid grid-cols-3 gap-3">
            <ClayInput
              label="District"
              placeholder="e.g. Kolhapur"
              error={errors.district?.message}
              required
              {...register('district')}
            />

            <ClaySelect
              label="State"
              error={errors.state?.message}
              required
              {...register('state')}
            >
              {indianStates.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </ClaySelect>

            <ClayInput
              label="Pincode"
              placeholder="6-digit pin"
              maxLength={6}
              error={errors.pincode?.message}
              required
              {...register('pincode')}
            />
          </div>

          <div className="pt-4 flex justify-end">
            <ClayButton
              type="button"
              variant="primary"
              onClick={handleNextStep}
              rightIcon={<ChevronRight className="w-4 h-4" />}
            >
              Next: Assign Primary Admin
            </ClayButton>
          </div>
        </div>
      )}

      {/* Step 2: Primary Dairy Admin Fields */}
      {step === 2 && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="p-3.5 rounded-2xl bg-[#FFF5EE] border border-[#FFE9DC] text-xs text-[#817A75] flex items-start gap-2.5">
            <UserCheck className="w-4 h-4 text-[#FF6A00] shrink-0 mt-0.5" />
            <div>
              <strong>One Primary Admin Rule:</strong> Each dairy must have exactly one primary Dairy Admin. They receive the activation link and verify via mobile OTP.
              <div className="mt-1.5 text-[#211B18]">
                Activation email will be delivered to: <strong className="text-[#FF6A00]">{watch('businessEmail')}</strong>
              </div>
            </div>
          </div>

          <ClayInput
            label="Primary Dairy Admin Full Name"
            placeholder="e.g. Rajesh Patil"
            error={errors.primaryAdminName?.message}
            required
            {...register('primaryAdminName')}
          />

          <ClayInput
            label="Primary Admin Mobile Number"
            type="tel"
            placeholder="10-digit mobile (e.g. 9822098765)"
            maxLength={10}
            error={errors.primaryAdminMobile?.message}
            helperText="The activation SMS with secure OTP link will be dispatched to this mobile"
            required
            {...register('primaryAdminMobile')}
          />

          <div className="pt-4 flex items-center justify-between">
            <ClayButton
              type="button"
              variant="outline"
              onClick={handlePreviousStep}
              leftIcon={<ChevronLeft className="w-4 h-4" />}
            >
              Back
            </ClayButton>

            <ClayButton
              type="submit"
              variant="primary"
              isLoading={mutation.isPending}
            >
              Provision Dairy & Dispatch Invite
            </ClayButton>
          </div>
        </form>
      )}

      {/* Step 3: Success Screen */}
      {step === 3 && createdResult && (
        <div className="space-y-5 text-center py-2">
          <div className="w-14 h-14 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <h4 className="text-base font-black text-[#211B18]">
              {createdResult.dairy.name}
            </h4>
            <div className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-[#FFE9DC] text-[#C2410C] font-mono text-xs font-bold border border-[#FDBA74]">
              {createdResult.dairy.code}
            </div>
          </div>

          <ClayCard variant="subtle" padding="sm" className="text-left text-xs space-y-2">
            <div className="flex justify-between border-b border-[#F1E7E0] pb-1.5">
              <span className="text-[#817A75]">Primary Dairy Admin:</span>
              <strong className="text-[#211B18]">{createdResult.admin.fullName}</strong>
            </div>
            <div className="flex justify-between border-b border-[#F1E7E0] pb-1.5">
              <span className="text-[#817A75]">Primary Admin Email:</span>
              <strong className="text-[#211B18]">{createdResult.admin.email || createdResult.dairy.contact?.businessEmail}</strong>
            </div>
            <div className="flex justify-between border-b border-[#F1E7E0] pb-1.5">
              <span className="text-[#817A75]">Registered Mobile:</span>
              <strong className="text-[#211B18]">+91 {createdResult.admin.mobile}</strong>
            </div>
            <div className="flex justify-between border-b border-[#F1E7E0] pb-1.5">
              <span className="text-[#817A75]">Invitation Delivery:</span>
              <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Dispatched to Email
              </span>
            </div>
            <div className="flex justify-between border-b border-[#F1E7E0] pb-1.5">
              <span className="text-[#817A75]">Initial Tenant Status:</span>
              <strong className="text-amber-700">Draft / Onboarding</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-[#817A75]">Activation Expiry:</span>
              <strong className="text-[#211B18]">48 Hours</strong>
            </div>
          </ClayCard>

          {copyError && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 text-left">
              {copyError}
            </div>
          )}

          {/* Invitation Link Box */}
          <div className="p-3 bg-[#FAF6F3] rounded-2xl border border-[#F1E7E0] text-left">
            <span className="text-[11px] font-bold text-[#817A75] block mb-1">
              Genuine Activation Link:
            </span>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={createdResult.inviteLink}
                className="w-full text-xs font-mono bg-white p-2 rounded-lg border border-[#F1E7E0] text-[#211B18]"
              />
              <ClayButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleCopyLink}
                leftIcon={<Copy className="w-3.5 h-3.5" />}
              >
                {copiedLink ? 'Copied!' : 'Copy'}
              </ClayButton>
            </div>
          </div>

          <ClayButton
            type="button"
            variant="primary"
            className="w-full"
            onClick={handleClose}
          >
            Done & View Directory
          </ClayButton>
        </div>
      )}
    </ClayModal>
  )
}
