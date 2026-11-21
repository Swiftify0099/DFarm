import React, { useState } from 'react'
import type { CustomerIdentity } from '@/types'
import { useHardware } from '@/context/HardwareContext'
import { useKioskOverlay } from '@/components/layout/CollectionAppShell'
import { CustomerIdentityPanel } from '@/components/workspace/CustomerIdentityPanel'
import { CustomerDossierCard } from '@/components/workspace/CustomerDossierCard'
import { MeasurementPanel } from '@/components/workspace/MeasurementPanel'
import { TransactionSummaryPanel } from '@/components/workspace/TransactionSummaryPanel'
import { RecentIntakeTable } from '@/components/workspace/RecentIntakeTable'
import { AlertTriangle } from 'lucide-react'

export const CollectionWorkspace: React.FC = () => {
  const {
    faceState,
    rfidState,
    hasIdentityConflict,
    manualCustomer,
    setManualCustomer,
    activeAttempt,
  } = useHardware()
  const { openOverlay } = useKioskOverlay()
  const [identificationMethod, setIdentificationMethod] = useState<string | null>(null)
  const [refreshTxnTrigger, setRefreshTxnTrigger] = useState(0)

  // Active customer is resolved from state machine attempt, manual override, or biometric/RFID
  const activeCustomer = manualCustomer
    ? manualCustomer
    : hasIdentityConflict
    ? null
    : activeAttempt?.customer || faceState.matchedCustomer || rfidState.matchedCustomer

  const effectiveMethod = manualCustomer
    ? identificationMethod || 'MANUAL_ENTRY'
    : activeAttempt?.identificationMethod === 'FACE_YUNET_SFACE'
    ? 'FACE_RECOGNITION'
    : activeAttempt?.identificationMethod === 'RFID_TAG'
    ? 'RFID_CARD'
    : faceState.matchedCustomer
    ? 'FACE_RECOGNITION'
    : rfidState.matchedCustomer
    ? 'RFID_CARD'
    : null

  const handleCustomerSelected = (cust: CustomerIdentity, method?: string) => {
    setManualCustomer(cust)
    setIdentificationMethod(method || 'DIRECT_CODE_ENTRY')
  }

  const handleTransactionSaved = () => {
    setManualCustomer(null)
    setIdentificationMethod(null)
    setRefreshTxnTrigger((prev) => prev + 1)
  }

  return (
    <div className="w-full max-w-[1720px] mx-auto space-y-3.5 pb-2">
      {/* Identity Conflict Alert Banner */}
      {hasIdentityConflict && !manualCustomer && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 flex items-center justify-between shadow-sm animate-pulse">
          <div className="flex items-center space-x-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-rose-700 uppercase tracking-wide mr-1.5">
                IDENTIFICATION CONFLICT:
              </span>
              <span>
                Camera matched <strong>{faceState.matchedCustomer?.fullName}</strong> (
                {faceState.matchedCustomer?.customerCode}) but RFID card belongs to{' '}
                <strong>{rfidState.matchedCustomer?.fullName}</strong> (
                {rfidState.matchedCustomer?.customerCode}). Automated intake locked.
              </span>
            </div>
          </div>
          <button
            onClick={() => openOverlay('CUSTOMERS')}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shrink-0 ml-3 shadow-sm transition-colors"
          >
            Supervisor Override (F2)
          </button>
        </div>
      )}

      {/* Main Single-Screen Counter Grid: Balanced 2-Column Desktop / Kiosk Terminal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
        {/* Left Column (5 cols): Farmer Identification & Biometrics + Customer Dossier */}
        <div className="lg:col-span-5 flex flex-col space-y-3.5">
          <CustomerIdentityPanel
            onCustomerSelected={handleCustomerSelected}
            onOpenManualSearch={() => openOverlay('CUSTOMERS')}
          />
          <CustomerDossierCard
            customer={activeCustomer}
            identificationMethod={effectiveMethod}
          />
        </div>

        {/* Right Column (7 cols): Quality Telemetry + Rate Matrix & Save Action */}
        <div className="lg:col-span-7 flex flex-col space-y-3.5">
          {/* 1. Digital Telemetry Gauges (Fat, SNF, CLR, Liters) + Tare Scale Button */}
          <MeasurementPanel />

          {/* 2. Rate Matrix, Financial Breakdown & Record Button */}
          <TransactionSummaryPanel
            customer={activeCustomer}
            identificationMethod={effectiveMethod}
            onTransactionSaved={handleTransactionSaved}
          />
        </div>
      </div>

      {/* Bottom Lower Region: Active Shift Intake Journal Table */}
      <RecentIntakeTable refreshTrigger={refreshTxnTrigger} />
    </div>
  )
}
