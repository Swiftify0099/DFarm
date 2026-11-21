import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CollectionStateMachine } from '../services/CollectionStateMachine'
import { buzzerDriver } from '../drivers/BuzzerDriver'
import { voiceAnnouncer } from '../drivers/VoiceAnnouncerDriver'
import type { CustomerIdentity, CollectionTransaction } from '../types'

describe('DFarm P0 Collection Single Active Transaction State Machine', () => {
  let fsm: CollectionStateMachine

  const mockCustomerA: CustomerIdentity = {
    id: 'cust-101',
    customerCode: 'C-101',
    farmerCode: 'FARM-101',
    fullName: 'Pankaj Popat Yewale',
    mobileNumber: '9876543210',
    village: 'Shirgaon',
    preferredCategory: 'COW',
    status: 'ACTIVE',
    balanceDue: 0,
  }

  const mockCustomerB: CustomerIdentity = {
    id: 'cust-102',
    customerCode: 'C-102',
    farmerCode: 'FARM-102',
    fullName: 'Sunita Tukaram Shinde',
    mobileNumber: '9876543211',
    village: 'Shirgaon',
    preferredCategory: 'BUFFALO',
    status: 'ACTIVE',
    balanceDue: 0,
  }

  beforeEach(() => {
    fsm = new CollectionStateMachine()
    voiceAnnouncer.resetAnnouncer()
    vi.clearAllMocks()
  })

  // ==========================================================================
  // 1. Face Event Locking & Single Customer Session
  // ==========================================================================
  describe('Face Event Locking & Duplicate Suppression', () => {
    it('1-5. Creates exactly one attempt and announces name once even if detector fires 100 times for 30s', () => {
      const speakSpy = vi.spyOn(voiceAnnouncer, 'speakCustomerIdentified')
      fsm.startScanning()
      expect(fsm.getState()).toBe('SCANNING')

      // Frame 1: First face match
      const firstResult = fsm.matchCustomer(mockCustomerA, 'FACE_YUNET_SFACE')
      expect(firstResult.success).toBe(true)
      expect(firstResult.attempt?.attemptId).toBeDefined()
      expect(firstResult.attempt?.customer.fullName).toBe('Pankaj Popat Yewale')
      expect(speakSpy).toHaveBeenCalledTimes(1)
      expect(speakSpy).toHaveBeenCalledWith('Pankaj Popat Yewale', firstResult.attempt?.attemptId)

      // Subsequent 99 frames for the same customer (e.g., standing in front of camera for 30s)
      for (let i = 2; i <= 100; i++) {
        const repeatResult = fsm.matchCustomer(mockCustomerA, 'FACE_YUNET_SFACE')
        expect(repeatResult.success).toBe(false)
        expect(repeatResult.error).toContain('Collection active for Pankaj Popat Yewale')
      }

      // Voice announcement must remain called EXACTLY once
      expect(speakSpy).toHaveBeenCalledTimes(1)

      // State machine must be in WAITING_FOR_FAT and locked
      expect(fsm.getState()).toBe('WAITING_FOR_FAT')
      expect(fsm.isRecognitionLocked()).toBe(true)

      // Attempt ID must remain identical
      expect(fsm.getCurrentAttempt()?.attemptId).toBe(firstResult.attempt?.attemptId)
    })

    it('blocks a different customer (Customer B) from usurping the active collection', () => {
      fsm.startScanning()
      const matchA = fsm.matchCustomer(mockCustomerA, 'FACE_YUNET_SFACE')
      expect(matchA.success).toBe(true)

      // Customer B arrives in frame while Customer A is still collecting
      const matchB = fsm.matchCustomer(mockCustomerB, 'FACE_YUNET_SFACE')
      expect(matchB.success).toBe(false)
      expect(matchB.error).toContain('Collection active for Pankaj Popat Yewale')
      expect(fsm.getCurrentAttempt()?.customer.id).toBe('cust-101')
    })
  })

  // ==========================================================================
  // 2. Hardware Measurement Sequencing (FAT -> SNF -> Weight)
  // ==========================================================================
  describe('Strict Hardware Measurement Sequencing & Audio Beeps', () => {
    it('6-7. FAT event moves state to FAT_CAPTURED and emits 1st beep (880 Hz)', async () => {
      const fatBeepSpy = vi.spyOn(buzzerDriver, 'playFatBeep')
      const snfBeepSpy = vi.spyOn(buzzerDriver, 'playSnfBeep')

      fsm.startScanning()
      fsm.matchCustomer(mockCustomerA, 'FACE_YUNET_SFACE')
      expect(fsm.getState()).toBe('WAITING_FOR_FAT')

      // Receive valid FAT (4.2%) and SNF (8.7%)
      const success = await fsm.handleAnalyzerReading(4.2, 8.7, 29.5)
      expect(success).toBe(true)

      // First beep must have fired
      expect(fatBeepSpy).toHaveBeenCalledTimes(1)
      // Second beep must have fired after the acoustic delay
      expect(snfBeepSpy).toHaveBeenCalledTimes(1)

      const attempt = fsm.getCurrentAttempt()
      expect(attempt?.fat).toBe(4.2)
      expect(attempt?.snf).toBe(8.7)
      expect(attempt?.clrDensity).toBe(29.5)

      // Advanced to WAITING_FOR_WEIGHT
      expect(fsm.getState()).toBe('WAITING_FOR_WEIGHT')
    })

    it('8-10. Rejects weight readings before FAT and SNF are captured', () => {
      fsm.startScanning()
      fsm.matchCustomer(mockCustomerA, 'FACE_YUNET_SFACE')
      expect(fsm.getState()).toBe('WAITING_FOR_FAT')

      // Scale transmits weight before analyzer finishes
      const scalePremature = fsm.handleScaleReading(15.5, true)
      expect(scalePremature).toBe(false)
      expect(fsm.getState()).toBe('WAITING_FOR_FAT')
      expect(fsm.getCurrentAttempt()?.weightLiters).toBeNull()
    })

    it('11-12. Advances to WEIGHT_CAPTURED only when FAT and SNF are present and scale is stable', async () => {
      fsm.startScanning()
      fsm.matchCustomer(mockCustomerA, 'FACE_YUNET_SFACE')
      await fsm.handleAnalyzerReading(4.2, 8.7, 29.5)
      expect(fsm.getState()).toBe('WAITING_FOR_WEIGHT')

      // Unstable weight reading -> ignored
      const unstable = fsm.handleScaleReading(15.5, false)
      expect(unstable).toBe(false)
      expect(fsm.getState()).toBe('WAITING_FOR_WEIGHT')

      // Stable zero weight -> ignored
      const zero = fsm.handleScaleReading(0.0, true)
      expect(zero).toBe(false)
      expect(fsm.getState()).toBe('WAITING_FOR_WEIGHT')

      // Valid stable weight -> accepted
      const stable = fsm.handleScaleReading(15.5, true)
      expect(stable).toBe(true)
      expect(fsm.getState()).toBe('VALIDATING')
      expect(fsm.getCurrentAttempt()?.weightLiters).toBe(15.5)
    })
  })

  // ==========================================================================
  // 3. Transaction Persistence & Deduplication
  // ==========================================================================
  describe('Transaction Submission & Idempotency Guarantee', () => {
    it('13-18. Binds attemptId for idempotency and commits exactly one transaction', async () => {
      fsm.startScanning()
      const initMatch = fsm.matchCustomer(mockCustomerA, 'FACE_YUNET_SFACE')
      const attemptId = initMatch.attempt?.attemptId!

      await fsm.handleAnalyzerReading(4.2, 8.7, 29.5)
      fsm.handleScaleReading(15.5, true)
      expect(fsm.getState()).toBe('VALIDATING')

      // Start saving
      const saveGate = fsm.startSaving()
      expect(saveGate.success).toBe(true)
      expect(saveGate.attemptId).toBe(attemptId)
      expect(fsm.getState()).toBe('SAVING')

      // Mock committed transaction
      const mockTxn: CollectionTransaction = {
        id: 'txn-uuid-001',
        transactionCode: 'TXN-001',
        sessionId: 'session-01',
        dairyId: 'dairy-01',
        customerId: mockCustomerA.id,
        customerCode: mockCustomerA.customerCode,
        customerName: mockCustomerA.fullName,
        timestamp: new Date().toISOString(),
        date: '2026-11-21',
        shift: 'MORNING',
        milkCategory: 'COW',
        weightLiters: 15.5,
        fatPercentage: 4.2,
        snfPercentage: 8.7,
        clrDensity: 29.5,
        appliedRatePerLiter: 41.5,
        rateChartVersion: 1,
        totalAmount: 643.25,
        identificationMethod: 'FACE_YUNET_SFACE',
        syncStatus: 'SYNCED_CLOUD',
        deviceId: 'KIOSK_MAIN',
        operatorName: 'Operator',
      }

      const commitSuccess = fsm.commitTransaction(mockTxn)
      expect(commitSuccess).toBe(true)
      expect(fsm.getState()).toBe('WAITING_FOR_FACE_CLEAR')
      expect(fsm.isRecognitionLocked()).toBe(true)
    })
  })

  // ==========================================================================
  // 4. Next Customer Lifecycle & Face-Presence Release Gate
  // ==========================================================================
  describe('Next Customer Lifecycle & Face Presence Release Gate', () => {
    it('19-23. Keeps recognition locked until patron leaves, then admits Customer B with fresh readings', async () => {
      fsm.startScanning()
      fsm.matchCustomer(mockCustomerA, 'FACE_YUNET_SFACE')
      await fsm.handleAnalyzerReading(4.2, 8.7, 29.5)
      fsm.handleScaleReading(15.5, true)
      fsm.startSaving()

      const mockTxnA: CollectionTransaction = {
        id: 'txn-001',
        transactionCode: 'TXN-001',
        sessionId: 'session-01',
        dairyId: 'dairy-01',
        customerId: mockCustomerA.id,
        customerCode: mockCustomerA.customerCode,
        customerName: mockCustomerA.fullName,
        timestamp: new Date().toISOString(),
        date: '2026-11-21',
        shift: 'MORNING',
        milkCategory: 'COW',
        weightLiters: 15.5,
        fatPercentage: 4.2,
        snfPercentage: 8.7,
        clrDensity: 29.5,
        appliedRatePerLiter: 41.5,
        rateChartVersion: 1,
        totalAmount: 643.25,
        identificationMethod: 'FACE_YUNET_SFACE',
        syncStatus: 'SYNCED_CLOUD',
        deviceId: 'KIOSK_MAIN',
        operatorName: 'Operator',
      }
      fsm.commitTransaction(mockTxnA)

      expect(fsm.getState()).toBe('WAITING_FOR_FACE_CLEAR')
      expect(fsm.isRecognitionLocked()).toBe(true)

      // Customer A is still standing at the platform for 20 frames
      for (let i = 0; i < 20; i++) {
        fsm.handleFacePresence(1) // 1 face detected
        expect(fsm.getState()).toBe('WAITING_FOR_FACE_CLEAR')
        expect(fsm.isRecognitionLocked()).toBe(true)

        // Attempting to match anyone must fail
        const prematureMatch = fsm.matchCustomer(mockCustomerA, 'FACE_YUNET_SFACE')
        expect(prematureMatch.success).toBe(false)
        expect(prematureMatch.error).toContain('Camera area is not clear')
      }

      // Customer A walks away (consecutive frames with 0 faces)
      for (let i = 1; i < 10; i++) {
        const released = fsm.handleFacePresence(0)
        expect(released).toBe(false)
        expect(fsm.getState()).toBe('WAITING_FOR_FACE_CLEAR')
      }

      // 10th consecutive clear frame triggers the release gate
      const fullyReleased = fsm.handleFacePresence(0)
      expect(fullyReleased).toBe(true)
      expect(fsm.getState()).toBe('SCANNING')
      expect(fsm.isRecognitionLocked()).toBe(false)
      expect(fsm.getCurrentAttempt()).toBeNull()

      // Customer B arrives!
      const matchB = fsm.matchCustomer(mockCustomerB, 'FACE_YUNET_SFACE')
      expect(matchB.success).toBe(true)
      expect(matchB.attempt?.customer.fullName).toBe('Sunita Tukaram Shinde')
      expect(matchB.attempt?.fat).toBeNull() // Fresh readings!
      expect(matchB.attempt?.snf).toBeNull()
      expect(matchB.attempt?.weightLiters).toBeNull()

      // Customer B readings are completely independent
      await fsm.handleAnalyzerReading(7.5, 9.2, 30.0)
      fsm.handleScaleReading(22.0, true)
      expect(fsm.getCurrentAttempt()?.fat).toBe(7.5)
      expect(fsm.getCurrentAttempt()?.snf).toBe(9.2)
      expect(fsm.getCurrentAttempt()?.weightLiters).toBe(22.0)
    })
  })

  // ==========================================================================
  // 5. Failure Recovery & Error Handling
  // ==========================================================================
  describe('Failure Recovery & Operator Interventions', () => {
    it('24-26. Rejects biologically impossible analyzer readings without corrupting state', async () => {
      fsm.startScanning()
      fsm.matchCustomer(mockCustomerA, 'FACE_YUNET_SFACE')

      // Impossible FAT: 1.2% (minimum is 2.0%)
      const invalidFat = await fsm.handleAnalyzerReading(1.2, 8.7)
      expect(invalidFat).toBe(false)
      expect(fsm.getState()).toBe('WAITING_FOR_FAT')
      expect(fsm.getCurrentAttempt()?.fat).toBeNull()

      // Impossible SNF: 15.0% (maximum is 12.0%)
      const invalidSnf = await fsm.handleAnalyzerReading(4.2, 15.0)
      expect(invalidSnf).toBe(false)
      expect(fsm.getState()).toBe('WAITING_FOR_FAT')
    })

    it('30. Handles explicit supervisor cancellation safely and unlocks station', () => {
      fsm.startScanning()
      fsm.matchCustomer(mockCustomerA, 'FACE_YUNET_SFACE')
      expect(fsm.isRecognitionLocked()).toBe(true)

      fsm.cancelCollection('Supervisor manual reset')
      expect(fsm.getState()).toBe('IDLE')
      expect(fsm.isRecognitionLocked()).toBe(false)
      expect(fsm.getCurrentAttempt()).toBeNull()
    })
  })
})
