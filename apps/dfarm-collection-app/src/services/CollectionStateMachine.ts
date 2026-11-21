// DFarm Collection App — Single Active Collection State Machine
// Coordinates Customer Match -> Voice Announcement -> FAT Beep -> SNF Beep -> Weight -> Deduplicated Save -> Face Clear

import type {
  CollectionWorkflowState,
  CollectionAttemptSession,
  CustomerIdentity,
  CollectionTransaction,
} from '@/types'
import { voiceAnnouncer, buzzerDriver } from '@/drivers'

export type StateChangeListener = (
  state: CollectionWorkflowState,
  attempt: CollectionAttemptSession | null
) => void

export class CollectionStateMachine {
  private state: CollectionWorkflowState = 'IDLE'
  private currentAttempt: CollectionAttemptSession | null = null
  private consecutiveNoFaceFrames: number = 0
  private readonly requiredClearFrames: number = 10
  private listeners: Set<StateChangeListener> = new Set()

  public getState(): CollectionWorkflowState {
    return this.state
  }

  public getCurrentAttempt(): CollectionAttemptSession | null {
    return this.currentAttempt ? { ...this.currentAttempt } : null
  }

  public isRecognitionLocked(): boolean {
    // Recognition/matching is locked during any active collection AND while waiting for previous face to clear
    return (
      this.state !== 'IDLE' &&
      this.state !== 'SCANNING'
    )
  }

  public isWaitingForFaceClear(): boolean {
    return this.state === 'WAITING_FOR_FACE_CLEAR'
  }

  public subscribe(listener: StateChangeListener): () => void {
    this.listeners.add(listener)
    listener(this.state, this.currentAttempt)
    return () => this.listeners.delete(listener)
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.state, this.currentAttempt ? { ...this.currentAttempt } : null)
      } catch (err) {
        console.error('[StateMachine] Listener error:', err)
      }
    }
  }

  /**
   * Transitions station to active scanning when camera or RFID is ready.
   */
  public startScanning(): void {
    if (this.state === 'IDLE') {
      this.state = 'SCANNING'
      this.notify()
    }
  }

  /**
   * Customer Match Event
   * Initiated from Face AI, RFID reader, or manual search.
   */
  public matchCustomer(
    customer: CustomerIdentity,
    method: 'FACE_YUNET_SFACE' | 'RFID_TAG' | 'MANUAL_SEARCH' = 'FACE_YUNET_SFACE'
  ): { success: boolean; attempt?: CollectionAttemptSession; error?: string } {
    // Reject if a collection is already locked
    if (this.currentAttempt !== null || (this.state !== 'IDLE' && this.state !== 'SCANNING')) {
      if (this.state === 'WAITING_FOR_FACE_CLEAR') {
        return {
          success: false,
          error: 'Camera area is not clear. Previous customer must step away before next match.',
        }
      }
      return {
        success: false,
        error: `Collection active for ${this.currentAttempt?.customer.fullName}. Cannot start second transaction.`,
      }
    }

    const attemptId = `ATT-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    const newAttempt: CollectionAttemptSession = {
      attemptId,
      customer,
      identificationMethod: method,
      state: 'CUSTOMER_MATCHED',
      matchedAt: new Date().toISOString(),
      announced: false,
      fat: null,
      fatCapturedAt: null,
      snf: null,
      snfCapturedAt: null,
      clrDensity: null,
      weightLiters: null,
      weightCapturedAt: null,
      scaleStable: false,
      appliedRatePerLiter: null,
      totalAmount: null,
      rateChartVersion: null,
      errorReason: null,
      transaction: null,
    }

    this.currentAttempt = newAttempt
    this.state = 'CUSTOMER_MATCHED'
    this.notify()

    // Immediate transition to ANNOUNCING
    this.state = 'ANNOUNCING'
    newAttempt.state = 'ANNOUNCING'
    this.notify()

    // Announce customer name exactly once
    voiceAnnouncer.speakCustomerIdentified(customer.fullName, attemptId)
    newAttempt.announced = true

    // Advance to WAITING_FOR_FAT
    this.state = 'WAITING_FOR_FAT'
    newAttempt.state = 'WAITING_FOR_FAT'
    this.notify()

    return { success: true, attempt: { ...newAttempt } }
  }

  /**
   * Analyzer Quality Event (FAT & SNF)
   * Enforces biological bounds and generates distinct beeps.
   */
  public async handleAnalyzerReading(
    fat: number,
    snf: number,
    clrDensity = 28.0
  ): Promise<boolean> {
    if (!this.currentAttempt) return false

    // Only accept analyzer telemetry in valid states
    if (
      this.state !== 'WAITING_FOR_FAT' &&
      this.state !== 'FAT_CAPTURED' &&
      this.state !== 'WAITING_FOR_SNF'
    ) {
      return false
    }

    // Biological validity check
    if (fat < 2.0 || fat > 15.0 || snf < 6.0 || snf > 12.0) {
      this.currentAttempt.errorReason = 'Analyzer readings outside biological bounds'
      this.notify()
      return false
    }

    // Step 1: Capture FAT & Play First Beep (880 Hz)
    this.currentAttempt.fat = fat
    this.currentAttempt.clrDensity = clrDensity
    this.currentAttempt.fatCapturedAt = new Date().toISOString()
    this.state = 'FAT_CAPTURED'
    this.currentAttempt.state = 'FAT_CAPTURED'
    buzzerDriver.playFatBeep()
    this.notify()

    // Acoustic separation between Beep 1 and Beep 2 (180ms)
    await new Promise((r) => setTimeout(r, 180))

    if (!this.currentAttempt) return false

    // Step 2: Capture SNF & Play Second Beep (1320 Hz)
    this.state = 'WAITING_FOR_SNF'
    this.currentAttempt.state = 'WAITING_FOR_SNF'

    this.currentAttempt.snf = snf
    this.currentAttempt.snfCapturedAt = new Date().toISOString()
    this.state = 'SNF_CAPTURED'
    this.currentAttempt.state = 'SNF_CAPTURED'
    buzzerDriver.playSnfBeep()
    this.notify()

    // Step 3: Advance to WAITING_FOR_WEIGHT
    this.state = 'WAITING_FOR_WEIGHT'
    this.currentAttempt.state = 'WAITING_FOR_WEIGHT'
    this.notify()

    return true
  }

  /**
   * Scale Weight Telemetry Event
   * Only advances when FAT and SNF are both captured and scale is stabilized.
   */
  public handleScaleReading(weight: number, isStable: boolean): boolean {
    if (!this.currentAttempt) return false

    // Reject weight advancement before FAT and SNF are captured
    if (
      this.state !== 'WAITING_FOR_WEIGHT' &&
      this.state !== 'WEIGHT_CAPTURED' &&
      this.state !== 'VALIDATING'
    ) {
      return false
    }

    this.currentAttempt.scaleStable = isStable
    if (weight > 0) {
      this.currentAttempt.weightLiters = weight
    }

    if (this.state === 'WAITING_FOR_WEIGHT' && isStable && weight > 0) {
      this.currentAttempt.weightCapturedAt = new Date().toISOString()
      this.state = 'WEIGHT_CAPTURED'
      this.currentAttempt.state = 'WEIGHT_CAPTURED'
      this.notify()

      // Advance to VALIDATING
      this.state = 'VALIDATING'
      this.currentAttempt.state = 'VALIDATING'
      this.notify()
      return true
    }

    if (this.state === 'VALIDATING') {
      this.notify()
      return true
    }

    return false
  }

  /**
   * Rate & Amount Association
   */
  public setRateCalculation(ratePerLiter: number, totalAmount: number, version = 1): void {
    if (!this.currentAttempt) return
    this.currentAttempt.appliedRatePerLiter = ratePerLiter
    this.currentAttempt.totalAmount = totalAmount
    this.currentAttempt.rateChartVersion = version
    this.notify()
  }

  /**
   * Transaction Submission Lock
   * Locks state to SAVING and returns active attemptId for backend idempotency.
   */
  public startSaving(): { success: boolean; attemptId?: string; error?: string } {
    if (!this.currentAttempt) {
      return { success: false, error: 'No active collection attempt' }
    }
    if (this.state !== 'VALIDATING' && this.state !== 'WEIGHT_CAPTURED') {
      return { success: false, error: `Cannot save in state ${this.state}` }
    }

    this.state = 'SAVING'
    this.currentAttempt.state = 'SAVING'
    this.notify()
    return { success: true, attemptId: this.currentAttempt.attemptId }
  }

  /**
   * Transaction Persistence Complete
   * Transitions to COMMITTED, then engages WAITING_FOR_FACE_CLEAR presence release gate.
   */
  public commitTransaction(txn: CollectionTransaction): boolean {
    if (!this.currentAttempt) return false

    this.currentAttempt.transaction = txn
    this.state = 'COMMITTED'
    this.currentAttempt.state = 'COMMITTED'
    this.notify()

    // Transition to WAITING_FOR_FACE_CLEAR to ensure patron exits before next intake
    this.consecutiveNoFaceFrames = 0
    this.state = 'WAITING_FOR_FACE_CLEAR'
    this.notify()
    return true
  }

  /**
   * Face-Presence Release Gate:
   * Called on every camera frame when state === 'WAITING_FOR_FACE_CLEAR'.
   * Requires consecutive no-face frames before releasing lock and returning to SCANNING.
   */
  public handleFacePresence(facesDetectedCount: number): boolean {
    if (this.state !== 'WAITING_FOR_FACE_CLEAR') return false

    if (facesDetectedCount === 0) {
      this.consecutiveNoFaceFrames++
      if (this.consecutiveNoFaceFrames >= this.requiredClearFrames) {
        // Person has left camera view — safely release lock for next customer
        this.consecutiveNoFaceFrames = 0
        this.currentAttempt = null
        this.state = 'SCANNING'
        this.notify()
        return true
      }
    } else {
      // Person is still in view — reset no-face counter
      this.consecutiveNoFaceFrames = 0
    }
    return false
  }

  /**
   * Supervisor Reset / Explicit Cancellation
   */
  public cancelCollection(reason = 'Operator reset'): void {
    voiceAnnouncer.resetAnnouncer()
    this.consecutiveNoFaceFrames = 0
    this.currentAttempt = null
    this.state = 'IDLE'
    this.notify()
  }

  /**
   * Manual Reset for Hardware Calibration
   */
  public resetToIdle(): void {
    this.cancelCollection('Station Reset')
  }
}

export const collectionStateMachine = new CollectionStateMachine()
