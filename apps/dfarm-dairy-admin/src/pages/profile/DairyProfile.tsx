import React from 'react'
import { SEED_DAIRY } from '@/api/mock-server'
import {
  ClayCard,
  ClayButton,
  ClayBadge,
} from '@/components/ui'
import { DfarmLogo, CowVisual, BuffaloVisual } from '@/assets/illustrations'
import { Building2, MapPin, Phone, Mail, Clock, ShieldCheck, Calendar } from 'lucide-react'

export const DairyProfilePage: React.FC = () => {
  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Building2 size={28} className="text-[#FF6A00]" />
          <h1 className="text-2xl font-black text-[#211B18] tracking-tight">Dairy Business Profile</h1>
        </div>
        <p className="text-xs text-[#817A75] mt-1 font-medium">
          Isolated tenant profile, registration coordinates, operating shift windows, and cooperative governance.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Tenant Identity */}
        <ClayCard className="md:col-span-1 text-center flex flex-col items-center !p-6 bg-gradient-to-b from-white to-[#FFF5EE]">
          <DfarmLogo size={64} className="mb-3" />
          <h2 className="text-xl font-black text-[#211B18] tracking-tight">{SEED_DAIRY.name}</h2>
          <ClayBadge variant="cow" className="mt-2 text-xs">
            {SEED_DAIRY.dairyCode}
          </ClayBadge>
          <p className="text-xs text-[#817A75] mt-2">
            Reg No: <span className="font-mono font-bold text-[#211B18]">{SEED_DAIRY.registrationNumber}</span>
          </p>

          <div className="w-full mt-6 pt-6 border-t border-[#F1E7E0] space-y-2.5 text-xs text-left">
            <div className="flex items-center gap-2 text-[#817A75]">
              <ShieldCheck size={16} className="text-[#FF6A00] shrink-0" />
              <span>Subscription: <strong className="text-[#211B18]">{SEED_DAIRY.subscriptionTier}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-[#817A75]">
              <Phone size={16} className="text-[#FF6A00] shrink-0" />
              <span>+91 {SEED_DAIRY.primaryContactPhone}</span>
            </div>
            <div className="flex items-center gap-2 text-[#817A75]">
              <Mail size={16} className="text-[#FF6A00] shrink-0" />
              <span>{SEED_DAIRY.contactEmail}</span>
            </div>
          </div>
        </ClayCard>

        {/* Right Column: Operational Rules & Address */}
        <div className="md:col-span-2 space-y-6">
          <ClayCard>
            <h3 className="text-sm font-bold text-[#211B18] pb-2 border-b border-[#F1E7E0] mb-4">
              Geographic Location & Registered Office
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[#817A75]">Village / Locality:</span>
                <p className="font-bold text-[#211B18] mt-0.5">{SEED_DAIRY.address.village}</p>
              </div>
              <div>
                <span className="text-[#817A75]">Taluka / Sub-District:</span>
                <p className="font-bold text-[#211B18] mt-0.5">{SEED_DAIRY.address.subDistrict}</p>
              </div>
              <div>
                <span className="text-[#817A75]">District & State:</span>
                <p className="font-bold text-[#211B18] mt-0.5">
                  {SEED_DAIRY.address.district}, {SEED_DAIRY.address.state}
                </p>
              </div>
              <div>
                <span className="text-[#817A75]">Postal Pincode:</span>
                <p className="font-mono font-bold text-[#211B18] mt-0.5">{SEED_DAIRY.address.pincode}</p>
              </div>
            </div>
          </ClayCard>

          <ClayCard>
            <h3 className="text-sm font-bold text-[#211B18] pb-2 border-b border-[#F1E7E0] mb-4">
              Daily Operational Shift Timings & Rules
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-[#FFF5EE] rounded-xl border border-[#FFE9DC]">
                <div className="flex items-center gap-1.5 font-bold text-[#FF6A00] mb-1">
                  <Clock size={14} />
                  <span>Morning Shift Window</span>
                </div>
                <p className="font-mono font-bold text-sm text-[#211B18]">
                  {SEED_DAIRY.operationalDetails.morningShiftStart} AM – {SEED_DAIRY.operationalDetails.morningShiftEnd} AM
                </p>
              </div>

              <div className="p-3 bg-[#FFF5EE] rounded-xl border border-[#FFE9DC]">
                <div className="flex items-center gap-1.5 font-bold text-[#FF6A00] mb-1">
                  <Clock size={14} />
                  <span>Evening Shift Window</span>
                </div>
                <p className="font-mono font-bold text-sm text-[#211B18]">
                  {SEED_DAIRY.operationalDetails.eveningShiftStart} PM – {SEED_DAIRY.operationalDetails.eveningShiftEnd} PM
                </p>
              </div>

              <div>
                <span className="text-[#817A75]">Active Milk Intake Streams:</span>
                <div className="flex items-center gap-2 mt-1">
                  <ClayBadge variant="cow" icon={<CowVisual size={14} />}>Cow Milk</ClayBadge>
                  <ClayBadge variant="buffalo" icon={<BuffaloVisual size={14} />}>Buffalo Milk</ClayBadge>
                </div>
              </div>

              <div>
                <span className="text-[#817A75]">Billing Cycle Cadence:</span>
                <p className="font-bold text-[#211B18] mt-1 flex items-center gap-1">
                  <Calendar size={13} className="text-[#FF6A00]" /> Fortnightly (Every {SEED_DAIRY.operationalDetails.billingCycleDays} Days)
                </p>
              </div>
            </div>
          </ClayCard>
        </div>
      </div>
    </div>
  )
}
