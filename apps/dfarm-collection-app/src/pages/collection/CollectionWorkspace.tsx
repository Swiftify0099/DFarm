import React, { useState } from 'react'
import type { CustomerIdentity } from '@/types'
import { useHardware } from '@/context/HardwareContext'
import { CustomerIdentityPanel } from '@/components/workspace/CustomerIdentityPanel'
import { CustomerDossierCard } from '@/components/workspace/CustomerDossierCard'
import { MeasurementPanel } from '@/components/workspace/MeasurementPanel'
import { TransactionSummaryPanel } from '@/components/workspace/TransactionSummaryPanel'
import { RecentIntakeTable } from '@/components/workspace/RecentIntakeTable'
import { CustomerLookupModal } from '@/components/workspace/CustomerLookupModal'

export const CollectionWorkspace: React.FC = () => {
  const { faceState, rfidState } = useHardware()
  const [manualCustomer, setManualCustomer] = useState<CustomerIdentity | null>(null)
  const [isLookupOpen, setIsLookupOpen] = useState(false)
  const [refreshTxnTrigger, setRefreshTxnTrigger] = useState(0)

  // Active customer is resolved from biometric, RFID, or manual override
  const activeCustomer =
    manualCustomer || faceState.matchedCustomer || rfidState.matchedCustomer

  const handleCustomerSelected = (cust: CustomerIdentity) => {
    setManualCustomer(cust)
  }

  const handleTransactionSaved = () => {
    setManualCustomer(null)
    setRefreshTxnTrigger((prev) => prev + 1)
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-8">
      {/* Top Section: Biometric / RFID Scanner & Dossier & Rate Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left Column (7 cols): Camera/RFID Scanner + Customer Dossier */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          <CustomerIdentityPanel
            onCustomerSelected={handleCustomerSelected}
            onOpenManualSearch={() => setIsLookupOpen(true)}
          />
          <CustomerDossierCard customer={activeCustomer} />
        </div>

        {/* Right Column (5 cols): Dynamic Calculation & Record Button */}
        <div className="lg:col-span-5">
          <TransactionSummaryPanel
            customer={activeCustomer}
            onTransactionSaved={handleTransactionSaved}
          />
        </div>
      </div>

      {/* Middle Section: Digital Quality Telemetry & Net Volume Scale */}
      <MeasurementPanel />

      {/* Bottom Section: Active Shift Intake Journal Table */}
      <RecentIntakeTable refreshTrigger={refreshTxnTrigger} />

      {/* Manual Search Modal */}
      <CustomerLookupModal
        isOpen={isLookupOpen}
        onClose={() => setIsLookupOpen(false)}
        onSelectCustomer={handleCustomerSelected}
      />
    </div>
  )
}
