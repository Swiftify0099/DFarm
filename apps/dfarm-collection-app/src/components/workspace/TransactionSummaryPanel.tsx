import React, { useState } from 'react'
import type { CustomerIdentity, MilkCategory, CollectionTransaction } from '@/types'
import { useHardware } from '@/context/HardwareContext'
import { useAuth } from '@/context/AuthContext'
import { transactionsApi, ratesApi } from '@/api/client'
import { localDB } from '@/services/local-storage'
import { ClayCard, ClayBadge } from '@/components/ui'
import { MilkCategoryToggle } from './MilkCategoryToggle'
import { SaveTransactionButton } from './SaveTransactionButton'
import { Calculator, ArrowRight, Wallet, Check, AlertCircle } from 'lucide-react'

interface TransactionSummaryPanelProps {
  customer: CustomerIdentity | null
  identificationMethod?: string | null
  onTransactionSaved: () => void
}

export const TransactionSummaryPanel: React.FC<TransactionSummaryPanelProps> = ({
  customer,
  identificationMethod,
  onTransactionSaved,
}) => {
  const {
    activeSession,
    measurements,
    updateMeasurements,
    isNetworkOnline,
    refreshSession,
    reopenSession,
    refreshOfflineCount,
    resetIntakeCycle,
    printReceipt,
    activeAttempt,
    commitCollectionAttempt,
  } = useHardware()

  const { operator } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isReopening, setIsReopening] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const handleReopen = async () => {
    if (!activeSession?.sessionCode) return
    setIsReopening(true)
    try {
      await reopenSession(activeSession.sessionCode)
      await refreshSession()
    } catch (err: any) {
      alert(`Reopen failed: ${err.message}`)
    } finally {
      setIsReopening(false)
    }
  }

  // Rate Matrix Real-Time Calculation
  const { ratePerLiter, version } = ratesApi.calculateRate(
    measurements.milkCategory,
    measurements.fat,
    measurements.snf
  )

  const totalAmount = Number((ratePerLiter * measurements.weightLiters).toFixed(2))

  // Validation Gate Lock Conditions
  let canSubmit = true
  let lockReason: string | null = null

  if (!activeSession) {
    canSubmit = false
    lockReason = 'No active shift session. Please wait for session initialization or open a session.'
  } else if (activeSession.status === 'CLOSED') {
    canSubmit = false
    lockReason = 'Current shift session is CLOSED. Open an active session to accept milk intake.'
  } else if (!customer) {
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

  // Allow Ctrl+Enter to submit intake when valid
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (canSubmit && customer && !isSubmitting) {
          e.preventDefault()
          handleSubmit()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canSubmit, customer, isSubmitting])

  const handleSubmit = async () => {
    if (!canSubmit || !customer || isSubmitting) return

    setIsSubmitting(true)
    try {
      let res: CollectionTransaction
      const normalizedMethod: 'FACE_YUNET_SFACE' | 'RFID_TAG' | 'MANUAL_SEARCH' =
        identificationMethod === 'RFID_CARD' || identificationMethod === 'RFID_TAG'
          ? 'RFID_TAG'
          : identificationMethod === 'FACE_RECOGNITION' || identificationMethod === 'FACE_YUNET_SFACE'
          ? 'FACE_YUNET_SFACE'
          : 'MANUAL_SEARCH'

      // Acquire stable idempotency attempt key from active collection attempt
      const attemptId = activeAttempt?.attemptId || `ATT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`

      if (isNetworkOnline) {
        try {
          res = await transactionsApi.submit({
            sessionId: activeSession!.id,
            sessionCode: activeSession?.sessionCode,
            customerId: customer.id,
            milkCategory: measurements.milkCategory,
            weightLiters: measurements.weightLiters,
            fat: measurements.fat,
            snf: measurements.snf,
            clrDensity: measurements.clrDensity,
            identificationMethod: normalizedMethod,
            operatorName: operator?.fullName || 'Operator',
            isOffline: false,
            idempotencyKey: attemptId,
          })
        } catch (apiErr: any) {
          throw new Error(apiErr.message || 'Server submission failed')
        }
      } else {
        // Honest offline persistence: store directly in IndexedDB offline queue without fake mock fallback
        const offlineTxn: CollectionTransaction = {
          id: `OFFLINE-${attemptId}`,
          transactionCode: `OFF-${attemptId.slice(-6).toUpperCase()}`,
          sessionId: activeSession ? activeSession.id : 'offline-session',
          dairyId: customer.dairyId || operator?.dairyId || '',
          customerId: customer.id,
          customerCode: customer.customerCode,
          customerName: customer.fullName,
          timestamp: new Date().toISOString(),
          date: new Date().toISOString().split('T')[0],
          shift: (activeSession?.shift || 'MORNING') as any,
          milkCategory: measurements.milkCategory,
          weightLiters: measurements.weightLiters,
          fatPercentage: measurements.fat,
          snfPercentage: measurements.snf,
          clrDensity: measurements.clrDensity || 28.0,
          appliedRatePerLiter: ratePerLiter,
          rateChartVersion: version,
          totalAmount: totalAmount,
          identificationMethod: normalizedMethod,
          syncStatus: 'PENDING_OFFLINE',
          deviceId: 'KIOSK_MAIN',
          operatorName: operator?.fullName || 'Operator',
        }
        await localDB.queueOfflineTransaction(offlineTxn)
        await localDB.saveTransaction(offlineTxn)
        res = offlineTxn
      }

      // Mark transaction committed in state machine
      commitCollectionAttempt(res)

      setSuccessMessage(
        `Intake recorded! Txn #${res.transactionCode} — ${res.weightLiters}L of ${res.milkCategory} milk for ₹${res.totalAmount}`
      )

      // Automatically trigger thermal voucher / serial print
      try {
        await printReceipt(res)
      } catch (printErr) {
        console.warn('Auto-print receipt warning:', printErr)
      }

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

      {/* Closed Session Warning & Reopen Action */}
      {activeSession?.status === 'CLOSED' && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between text-amber-900 text-xs">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-bold">Shift Session Concluded</p>
              <p className="text-[11px] text-amber-700">Session '{activeSession.sessionCode}' is concluded.</p>
            </div>
          </div>
          <button
            onClick={handleReopen}
            disabled={isReopening}
            className="px-3 py-1.5 bg-primary-orange text-white font-semibold rounded-lg text-xs hover:bg-orange-600 transition-colors shadow-sm disabled:opacity-50"
          >
            {isReopening ? 'Reopening...' : 'Reopen Shift'}
          </button>
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
