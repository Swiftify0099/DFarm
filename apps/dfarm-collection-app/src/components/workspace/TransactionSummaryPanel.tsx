import React, { useState } from 'react'
import type { CustomerIdentity, MilkCategory } from '@/types'
import { useHardware } from '@/context/HardwareContext'
import { useAuth } from '@/context/AuthContext'
import { transactionsApi } from '@/api/client'
import { MockCollectionBackend } from '@/api/mock-backend'
import { ClayCard, ClayBadge } from '@/components/ui'
import { MilkCategoryToggle } from './MilkCategoryToggle'
import { SaveTransactionButton } from './SaveTransactionButton'
import { Calculator, ArrowRight, Wallet, Check, AlertCircle } from 'lucide-react'

interface TransactionSummaryPanelProps {
  customer: CustomerIdentity | null
  onTransactionSaved: () => void
}

export const TransactionSummaryPanel: React.FC<TransactionSummaryPanelProps> = ({
  customer,
  onTransactionSaved,
}) => {
  const {
    activeSession,
    measurements,
    updateMeasurements,
    isNetworkOnline,
    refreshSession,
    refreshOfflineCount,
    resetIntakeCycle,
  } = useHardware()

  const { operator } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Rate Matrix Real-Time Calculation
  const { ratePerLiter, version } = MockCollectionBackend.calculateRate(
    measurements.milkCategory,
    measurements.fat,
    measurements.snf
  )

  const totalAmount = Number((ratePerLiter * measurements.weightLiters).toFixed(2))

  // Validation Gate Lock Conditions
  let canSubmit = true
  let lockReason: string | null = null

  if (!customer) {
    canSubmit = false
    lockReason = 'Identify patron via Face Camera, RFID, or Manual Search first.'
  } else if (measurements.weightLiters <= 0) {
    canSubmit = false
    lockReason = 'Milk intake volume must be greater than 0.00 Liters.'
  } else if (!measurements.scaleStable) {
    canSubmit = false
    lockReason = 'Weighing scale is stabilizing. Please wait for stability lock.'
  } else if (measurements.fat < 2.0 || measurements.fat > 15.0) {
    canSubmit = false
    lockReason = 'Milk Fat % is out of valid biological bounds (2.0% - 15.0%).'
  } else if (measurements.snf < 6.0 || measurements.snf > 12.0) {
    canSubmit = false
    lockReason = 'Milk SNF % is out of valid biological bounds (6.0% - 12.0%).'
  }

  const handleCategorySelect = (category: MilkCategory) => {
    updateMeasurements({ milkCategory: category })
  }

  const handleSubmit = async () => {
    if (!canSubmit || !customer || isSubmitting) return

    setIsSubmitting(true)
    try {
      let res: any
      try {
        res = await transactionsApi.submit({
          sessionId: activeSession?.id || 'session-current-001',
          sessionCode: activeSession?.sessionCode,
          customerId: customer.id,
          milkCategory: measurements.milkCategory,
          weightLiters: measurements.weightLiters,
          fat: measurements.fat,
          snf: measurements.snf,
          clrDensity: measurements.clrDensity,
          identificationMethod: 'FACE_YUNET_SFACE',
          operatorName: operator?.fullName || 'Operator',
          isOffline: !isNetworkOnline,
        })
      } catch (apiErr: any) {
        console.warn('Backend submit failed or offline, falling back to local DB/mock:', apiErr)
        res = await MockCollectionBackend.submitTransaction({
          customerId: customer.id,
          milkCategory: measurements.milkCategory,
          weightLiters: measurements.weightLiters,
          fat: measurements.fat,
          snf: measurements.snf,
          clrDensity: measurements.clrDensity,
          identificationMethod: 'FACE_YUNET_SFACE',
          operatorName: operator?.fullName || 'Operator',
          isOffline: !isNetworkOnline,
        })
      }

      setSuccessMessage(
        `Intake recorded! Txn #${res.transactionCode} — ${res.weightLiters}L of ${res.milkCategory} milk for ₹${res.totalAmount}`
      )

      await refreshSession()
      await refreshOfflineCount()
      onTransactionSaved()

      // Reset cycle for next customer after brief display
      setTimeout(() => {
        resetIntakeCycle()
        setSuccessMessage(null)
      }, 2500)
    } catch (err: any) {
      alert(`Submission failed: ${err.message || 'Unknown error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ClayCard className="p-5 flex flex-col justify-between h-full bg-cream space-y-4">
      {/* Top Header */}
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center space-x-2">
            <Calculator className="w-5 h-5 text-primary-orange" />
            <h3 className="text-base font-bold text-text-primary">Intake Calculation & Rate Matrix</h3>
          </div>
          <ClayBadge variant="primary" size="sm">
            Rate v{version}
          </ClayBadge>
        </div>

        {/* Milk Category Selector */}
        <div className="mt-3">
          <p className="text-xs font-semibold text-text-secondary mb-2">Selected Milk Category:</p>
          <MilkCategoryToggle
            selectedCategory={measurements.milkCategory}
            onSelectCategory={handleCategorySelect}
          />
        </div>

        {/* Dynamic Rate & Amount Breakdown */}
        <div className="mt-4 p-4 rounded-2xl bg-peach/40 border border-border-subtle space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-secondary">Calculated Rate per Liter:</span>
            <span className="font-mono font-bold text-base text-text-primary">
              ₹ {ratePerLiter.toFixed(2)}{' '}
              <span className="text-xs text-text-muted font-normal">/ L</span>
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-text-secondary">Intake Volume (Scale):</span>
            <span className="font-mono font-bold text-base text-text-primary">
              {measurements.weightLiters.toFixed(2)} L
            </span>
          </div>

          <div className="border-t border-border-subtle/60 pt-3 flex items-center justify-between">
            <span className="text-sm font-bold text-text-primary">Net Intake Value:</span>
            <span className="font-mono font-bold text-2xl text-primary-orange">
              ₹ {totalAmount.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Customer Balance Projection */}
        {customer && (
          <div className="mt-3 p-3 rounded-xl bg-cream-dark border border-border-subtle flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2 text-text-secondary">
              <Wallet className="w-4 h-4 text-primary-orange" />
              <span>Patron Balance:</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-text-muted">₹{customer.balanceDue.toFixed(2)}</span>
              <ArrowRight className="w-3 h-3 text-text-muted" />
              <span className="font-bold text-emerald-700">
                ₹{(customer.balanceDue + totalAmount).toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Success Notification Alert */}
      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center space-x-2 text-emerald-800 text-xs animate-fade-in">
          <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {/* Save Button with Strict Validation Lock */}
      <div>
        <SaveTransactionButton
          canSubmit={canSubmit}
          lockReason={lockReason}
          totalAmount={totalAmount}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
        />
      </div>
    </ClayCard>
  )
}
