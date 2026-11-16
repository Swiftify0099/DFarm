import React from 'react'
import type { CustomerIdentity } from '@/types'
import { ClayCard, ClayBadge } from '@/components/ui'
import { User, MapPin, Phone, ShieldCheck, Calendar, Wallet } from 'lucide-react'

interface CustomerDossierCardProps {
  customer: CustomerIdentity | null
}

export const CustomerDossierCard: React.FC<CustomerDossierCardProps> = ({ customer }) => {
  if (!customer) {
    return (
      <ClayCard className="p-4 flex flex-col justify-center items-center text-center h-full min-h-[160px] border-dashed border-border-subtle bg-peach/20">
        <div className="w-12 h-12 rounded-full bg-peach/60 flex items-center justify-center text-primary-orange mb-2">
          <User className="w-6 h-6" />
        </div>
        <p className="text-sm font-semibold text-text-primary">No Patron Identified</p>
        <p className="text-xs text-text-muted mt-1 max-w-[260px]">
          Please position customer before camera or tap RFID card to load profile and rate matrix.
        </p>
      </ClayCard>
    )
  }

  return (
    <ClayCard className="p-4 flex flex-col justify-between h-full border-l-4 border-l-primary-orange bg-cream">
      {/* Top Header */}
      <div>
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-orange to-secondary-orange text-white flex items-center justify-center font-bold text-base shadow-md">
              {customer.fullName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono font-bold bg-peach px-2 py-0.5 rounded text-primary-orange border border-primary-orange/20">
                  {customer.customerCode}
                </span>
                <ClayBadge variant={customer.status === 'ACTIVE' ? 'success' : 'danger'} size="sm">
                  {customer.status}
                </ClayBadge>
              </div>
              <h3 className="text-base font-bold text-text-primary leading-snug mt-1">
                {customer.fullName}
              </h3>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-text-muted font-medium uppercase tracking-wider block">
              Preferred
            </span>
            <ClayBadge variant="primary" size="sm" className="mt-0.5">
              {customer.preferredCategory} MILK
            </ClayBadge>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border-subtle text-xs">
          <div className="flex items-center space-x-2 text-text-secondary">
            <MapPin className="w-3.5 h-3.5 text-primary-orange flex-shrink-0" />
            <span className="truncate">{customer.village}</span>
          </div>

          <div className="flex items-center space-x-2 text-text-secondary">
            <Phone className="w-3.5 h-3.5 text-primary-orange flex-shrink-0" />
            <span>+91 {customer.mobileNumber}</span>
          </div>

          <div className="flex items-center space-x-2 text-text-secondary">
            <Wallet className="w-3.5 h-3.5 text-primary-orange flex-shrink-0" />
            <span>
              Pending:{' '}
              <strong className="text-text-primary">
                ₹{customer.balanceDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </strong>
            </span>
          </div>

          <div className="flex items-center space-x-2 text-text-secondary">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
            <span>
              Bio Score:{' '}
              <strong className="text-emerald-700">
                {customer.biometric ? `${customer.biometric.qualityScore}%` : 'Enrolled'}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Last Delivery Footer */}
      {customer.lastDelivery && (
        <div className="mt-3 pt-2 border-t border-border-subtle flex items-center justify-between text-[11px] text-text-muted bg-peach/30 px-2.5 py-1.5 rounded-lg">
          <div className="flex items-center space-x-1.5">
            <Calendar className="w-3 h-3 text-primary-orange" />
            <span>Last Intake:</span>
          </div>
          <span className="font-semibold text-text-primary">
            {customer.lastDelivery.liters} L ({customer.lastDelivery.shift} shift)
          </span>
        </div>
      )}
    </ClayCard>
  )
}
