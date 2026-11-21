import React from 'react'
import type { CustomerIdentity } from '@/types'
import { ClayModal, ClayBadge, ClayButton } from '@/components/ui'
import { User, Phone, MapPin, Wallet, ShieldCheck, Radio, Calendar, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useHardware } from '@/context/HardwareContext'

interface CustomerDetailModalProps {
  customer: CustomerIdentity | null
  isOpen: boolean
  onClose: () => void
}

export const CustomerDetailModal: React.FC<CustomerDetailModalProps> = ({
  customer,
  isOpen,
  onClose,
}) => {
  const navigate = useNavigate()
  const { selectManualCustomer } = useHardware()

  if (!customer) return null

  const handleSelectForIntake = () => {
    onClose()
    selectManualCustomer(customer)
    navigate('/collection')
  }

  return (
    <ClayModal
      isOpen={isOpen}
      onClose={onClose}
      title="Patron Profile & Biometric Ledger"
      description={`Customer #${customer.customerCode} • Active Producer Profile`}
      size="md"
    >
      <div className="space-y-4">
        {/* Customer Header Card */}
        <div className="p-4 rounded-2xl bg-peach/40 border border-border-subtle flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-orange to-secondary-orange text-white flex items-center justify-center font-bold text-lg shadow-md">
              {customer.fullName.charAt(0)}
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary">{customer.fullName}</h3>
              <p className="text-xs text-text-muted font-mono">Code: {customer.customerCode}</p>
            </div>
          </div>
          <ClayBadge variant={customer.status === 'ACTIVE' ? 'success' : 'danger'} size="sm">
            {customer.status}
          </ClayBadge>
        </div>

        {/* Detailed Fields */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-cream border border-border-subtle">
            <span className="text-text-muted block text-[10px] uppercase font-bold">Contact</span>
            <div className="flex items-center space-x-1.5 mt-1 font-semibold text-text-primary">
              <Phone className="w-3.5 h-3.5 text-primary-orange" />
              <span>+91 {customer.mobileNumber}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-cream border border-border-subtle">
            <span className="text-text-muted block text-[10px] uppercase font-bold">Village</span>
            <div className="flex items-center space-x-1.5 mt-1 font-semibold text-text-primary">
              <MapPin className="w-3.5 h-3.5 text-primary-orange" />
              <span>{customer.village}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-cream border border-border-subtle">
            <span className="text-text-muted block text-[10px] uppercase font-bold">
              Outstanding Ledger Due
            </span>
            <div className="flex items-center space-x-1.5 mt-1 font-mono font-bold text-primary-orange text-sm">
              <Wallet className="w-3.5 h-3.5 text-primary-orange" />
              <span>₹{customer.balanceDue.toFixed(2)}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-cream border border-border-subtle">
            <span className="text-text-muted block text-[10px] uppercase font-bold">
              Assigned RFID Tag
            </span>
            <div className="flex items-center space-x-1.5 mt-1 font-mono font-semibold text-text-primary">
              <Radio className="w-3.5 h-3.5 text-primary-orange" />
              <span>{customer.rfidCardUid || 'Unassigned'}</span>
            </div>
          </div>
        </div>

        {/* Biometric Status (OpenCV YuNet + SFace) */}
        <div className="p-3 rounded-xl bg-cream border border-border-subtle space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-1.5 font-semibold text-text-primary">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Biometric Enrollment (YuNet + SFace)</span>
            </div>
            <ClayBadge variant={customer.biometric ? 'success' : 'secondary'} size="sm">
              {customer.biometric ? `${customer.biometric.qualityScore}% Quality` : 'Not Enrolled'}
            </ClayBadge>
          </div>
          <p className="text-[11px] text-text-muted">
            Model: {customer.biometric?.modelVersion || 'OpenCV SFace INT8'} • Template {customer.biometric?.templateVersion || 'v1.0'} •
            Consent {customer.biometric?.consentVerified ? 'Verified' : 'Pending'}
          </p>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <ClayButton
            variant="primary"
            size="lg"
            onClick={handleSelectForIntake}
            className="w-full flex items-center justify-center space-x-2"
          >
            <span>Select for Milk Intake (F1)</span>
            <ArrowRight className="w-4 h-4" />
          </ClayButton>
        </div>
      </div>
    </ClayModal>
  )
}
