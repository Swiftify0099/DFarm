import React, { useState } from 'react'
import type { CustomerIdentity, MilkCategory, CollectionTransaction } from '@/types'
import { useHardware } from '@/context/HardwareContext'
import { useAuth } from '@/context/AuthContext'
import { transactionsApi, ratesApi } from '@/api/client'
import { localDB } from '@/services/local-storage'
import { storagePersistence } from '@/services/storage-persistence'
import { roundHalfUp } from '@/utils/rounding'
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
    rateCharts,
    storageQuota,
    triggerSync,
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

  // Active Cached Rate Chart for Selected Category
  const activeRateChart = rateCharts?.[measurements.milkCategory] || null

  // Rate Matrix Real-Time Dynamic Calculation
  const rateCalc = ratesApi.calculateRate(
    measurements.milkCategory,
    measurements.fat,
    measurements.snf,
    activeRateChart
  )

  const ratePerLiter = rateCalc.ratePerLiter
  const version = rateCalc.version

  const isFinancialInputsFinite =
    Number.isFinite(measurements.weightLiters) &&
    Number.isFinite(measurements.fat) &&
    Number.isFinite(measurements.snf) &&
    Number.isFinite(ratePerLiter);

  let totalAmount = 0;
  if (isFinancialInputsFinite && measurements.weightLiters > 0 && ratePerLiter > 0) {
    totalAmount = roundHalfUp(ratePerLiter * measurements.weightLiters, 2);
  }

  // Validation Gate Lock Conditions
  let canSubmit = true
  let lockReason: string | null = null

  if (!isFinancialInputsFinite) {
    canSubmit = false
    lockReason = 'Measurement readings contain invalid or non-finite financial values.'
  } else if (!activeSession) {
    canSubmit = false
    lockReason = 'No active shift session. Please wait for session initialization or open a session.'
  } else if (activeSession.status === 'CLOSED') {
    canSubmit = false
    lockReason = 'Current shift session is CLOSED. Open an active session to accept milk intake.'
  } else if (!activeRateChart) {
    canSubmit = false
    lockReason = `No active rate chart cached for ${measurements.milkCategory}. Connect to internet to download rate charts.`
  } else if (!rateCalc.isValid) {
    canSubmit = false
    lockReason = rateCalc.error || `Invalid rate for ${measurements.milkCategory} at ${measurements.fat}% Fat / ${measurements.snf}% SNF.`
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
  } else if (storageQuota?.isCritical) {
    canSubmit = false
    lockReason = 'Storage quota critical (>85%). Connect to internet to sync and free disk space.'
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

    if (
      !Number.isFinite(measurements.weightLiters) || measurements.weightLiters <= 0 ||
      !Number.isFinite(measurements.fat) || measurements.fat <= 0 ||
      !Number.isFinite(measurements.snf) || measurements.snf <= 0 ||
      !Number.isFinite(ratePerLiter) || ratePerLiter <= 0 ||
      !Number.isFinite(totalAmount) || totalAmount <= 0
    ) {
      alert('Cannot save transaction: Financial or measurement readings are non-finite or invalid.')
      return
    }

    setIsSubmitting(true)
    try {
      const normalizedMethod: 'FACE_YUNET_SFACE' | 'RFID_TAG' | 'MANUAL_SEARCH' =
        identificationMethod === 'RFID_CARD' || identificationMethod === 'RFID_TAG'
          ? 'RFID_TAG'
          : identificationMethod === 'FACE_RECOGNITION' || identificationMethod === 'FACE_YUNET_SFACE'
          ? 'FACE_YUNET_SFACE'
          : 'MANUAL_SEARCH'

      // STEP 1 & 2: Generate Permanent RFC 4122 v4 UUID (Never re-generated on retry)
      const clientIntakeUuid = crypto.randomUUID()
      const transactionCode = `TXN-${clientIntakeUuid.substring(0, 8).toUpperCase()}`
      const idempotencyKey = `INTAKE-${clientIntakeUuid}`
      const nowIso = new Date().toISOString()

      // STEP 2.5: Attach signed offline session authorization token if available
      let offlineAuthToken: string | undefined
      if (activeSession) {
        try {
          const authRecord = await localDB.getActiveSessionOfflineAuth(activeSession.id)
          if (authRecord?.token) {
            offlineAuthToken = authRecord.token
          }
        } catch {
          // ignore offline auth retrieval issue
        }
      }

      // STEP 3: Complete Transaction Snapshot
      const localTxn: CollectionTransaction = {
        id: clientIntakeUuid,
        clientIntakeUuid,
        transactionCode,
        sessionId: activeSession ? activeSession.id : 'offline-session',
        dairyId: customer.dairyId || operator?.dairyId || activeSession?.dairyId || '',
        centerId: (activeSession as any)?.centerId || (operator as any)?.centerId,
        customerId: customer.id,
        customerCode: customer.customerCode,
        customerName: customer.fullName,
        timestamp: nowIso,
        date: activeSession?.date || nowIso.split('T')[0],
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
        deviceId: activeSession?.deviceId || 'KIOSK_MAIN',
        operatorName: operator?.fullName || 'Operator',
        idempotencyKey,
        offlineCreated: !isNetworkOnline,
        offlineAuthorizationToken: offlineAuthToken,
      }

      const queueItem = {
        eventId: `EVT-${clientIntakeUuid}`,
        transactionId: clientIntakeUuid,
        clientIntakeUuid,
        customerCode: customer.customerCode,
        customerName: customer.fullName,
        timestamp: nowIso,
        retryCount: 0,
        status: 'QUEUED' as const,
        errorReason: null,
        lastAttemptedAt: null,
        offlineAuthorizationToken: offlineAuthToken,
        transaction: localTxn,
      }

      // STEP 4: ATOMIC LOCAL SAVE TO INDEXEDDB
      // Writes to BOTH completed_transactions AND offline_queue in ONE transaction
      // Strictly awaits tx.oncomplete before reporting success or printing receipt
      await localDB.saveIntakeAtomically(localTxn, queueItem)

      // STEP 5: CONFIRM LOCAL COMMIT & ADVANCE KIOSK STATE
      commitCollectionAttempt(localTxn)

      setSuccessMessage(
        `Intake recorded locally! Txn #${localTxn.transactionCode} — ${localTxn.weightLiters}L of ${localTxn.milkCategory} milk for ₹${localTxn.totalAmount}`
      )

      // Automatically trigger thermal voucher / serial print immediately upon local commit
      try {
        await printReceipt(localTxn)
      } catch (printErr) {
        console.warn('Auto-print receipt warning:', printErr)
      }

      // Make entry immediately available to Recent Intake Table and update pending count
      await refreshOfflineCount()
      onTransactionSaved()

      // STEP 6: ONLINE API INTEGRATION (Opportunistic background sync)
      // When network is online, trigger single-flight bulk sync engine in background.
      // If offline or network deferred, the record is safely retained in offline_queue!
      triggerSync().catch((syncErr) => {
        console.warn('[LocalFirst] Opportunistic sync execution:', syncErr)
      })

      // Reset cycle for next customer after brief display
      setTimeout(() => {
        resetIntakeCycle()
        setSuccessMessage(null)
      }, 2500)
    } catch (err: any) {
      console.error('[LocalFirst] IndexedDB save failure:', err)
      const isQuota = storagePersistence.isQuotaExceededError(err)
      const msg = isQuota
        ? 'Local storage quota exceeded! Please connect to internet to sync and free disk space.'
        : `Could not commit milk intake to IndexedDB. ${err.message || 'Transaction aborted.'}`
      alert(`Local Persistence Failure: ${msg}`)
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
