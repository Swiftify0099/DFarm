import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import type {
  HardwareDevice,
  ActiveCollectionSession,
  FaceRecognitionState,
  RfidScanState,
  MilkMeasurements,
  CustomerIdentity,
  ShiftType,
} from '@/types'
import {
  sessionsApi,
  customersApi,
  identityApi,
  getStoredOperatorAuth,
} from '@/api/client'
import { localDB } from '@/services/local-storage'
import {
  voiceAnnouncer,
  rfidReaderDriver,
  scaleDriver,
  milkAnalyzerDriver,
  thermalPrinterDriver,
} from '@/drivers'
import {
  DairyFaceMatcher,
  CANONICAL_SFACE_128D_FIXTURE,
  type EnrolledFaceTemplate,
} from '@/face-ai'
import type { CollectionTransaction } from '@/types'

interface HardwareContextType {
  devices: HardwareDevice[]
  activeSession: ActiveCollectionSession | null
  faceState: FaceRecognitionState
  rfidState: RfidScanState
  measurements: MilkMeasurements
  offlineQueueCount: number
  isNetworkOnline: boolean
  hasIdentityConflict: boolean
  manualCustomer: CustomerIdentity | null
  setManualCustomer: (customer: CustomerIdentity | null) => void
  customersList: CustomerIdentity[]
  customersMap: Map<string, CustomerIdentity>
  enrolledTemplates: EnrolledFaceTemplate[]
  setNetworkOnline: (online: boolean) => void
  refreshDevices: () => Promise<void>
  refreshSession: () => Promise<void>
  openSession: (params?: { shift?: ShiftType; businessDate?: string }) => Promise<ActiveCollectionSession>
  closeSession: (sessionCode: string) => Promise<ActiveCollectionSession>
  refreshOfflineCount: () => Promise<void>
  refreshCustomersAndTemplates: () => Promise<void>
  simulateFaceDetection: (customerCode?: string) => Promise<CustomerIdentity | null>
  resetFaceState: () => void
  simulateRfidScan: (cardUid: string) => Promise<CustomerIdentity | null>
  resetRfidState: () => void
  updateMeasurements: (updates: Partial<MilkMeasurements>) => void
  tareScale: () => void
  resetIntakeCycle: () => void
  connectScale: (baudRate?: number) => Promise<boolean>
  disconnectScale: () => Promise<void>
  connectAnalyzer: (baudRate?: number) => Promise<boolean>
  disconnectAnalyzer: () => Promise<void>
  connectRfidSerial: (baudRate?: number) => Promise<boolean>
  disconnectRfidSerial: () => Promise<void>
  printReceipt: (txn: CollectionTransaction, options?: any) => Promise<boolean>
}

const defaultMeasurements: MilkMeasurements = {
  milkCategory: 'COW',
  fat: 0,
  snf: 0,
  clrDensity: 0,
  temperatureCelsius: 0,
  weightLiters: 0,
  analyzerConnected: false,
  scaleConnected: false,
  scaleStable: false,
  opticalLactometerOk: false,
  readingsValid: false,
  validationErrors: ['Scale not connected', 'Milk analyzer not connected'],
}

const defaultFaceState: FaceRecognitionState = {
  status: 'WAITING_FOR_FACE',
  boundingBox: null,
  confidenceScore: 0,
  matchedCustomer: null,
  unknownPersonAlert: false,
  modelLoaded: true,
  latencyMs: 14,
}

const defaultRfidState: RfidScanState = {
  status: 'IDLE',
  cardUid: null,
  matchedCustomer: null,
}

const HardwareContext = createContext<HardwareContextType | undefined>(undefined)

export const HardwareProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [devices, setDevices] = useState<HardwareDevice[]>([])
  const [activeSession, setActiveSession] = useState<ActiveCollectionSession | null>(null)
  const [manualCustomer, setManualCustomer] = useState<CustomerIdentity | null>(null)
  const [faceState, setFaceState] = useState<FaceRecognitionState>(defaultFaceState)
  const [rfidState, setRfidState] = useState<RfidScanState>(defaultRfidState)
  const [measurements, setMeasurements] = useState<MilkMeasurements>(defaultMeasurements)
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(0)
  const [isNetworkOnline, setIsNetworkOnline] = useState<boolean>(navigator.onLine)
  const [customersList, setCustomersList] = useState<CustomerIdentity[]>([])
  const [enrolledTemplates, setEnrolledTemplates] = useState<EnrolledFaceTemplate[]>([])

  const customersMap = useMemo(() => {
    const map = new Map<string, CustomerIdentity>()
    for (const c of customersList) {
      map.set(c.id, c)
      if (c.customerCode) map.set(c.customerCode, c)
      if (c.farmerCode) map.set(c.farmerCode, c)
    }
    return map
  }, [customersList])

  const hasIdentityConflict = useMemo(() => {
    return Boolean(
      faceState.matchedCustomer &&
      rfidState.matchedCustomer &&
      faceState.matchedCustomer.id !== rfidState.matchedCustomer.id
    )
  }, [faceState.matchedCustomer, rfidState.matchedCustomer])

  const refreshDevices = useCallback(async () => {
    // In genuine operation, devices telemetry is managed via hardware drivers & API
    setDevices([
      {
        id: 'DF-KIOSK-001',
        name: 'Intake Weighing Station',
        category: 'DIGITAL_SCALE',
        connectionType: 'WEB_SERIAL',
        status: 'CONNECTED',
        portOrEndpoint: 'COM3',
        lastPing: new Date().toISOString(),
        errorMessage: null,
      },
      {
        id: 'DF-ANALYZER-001',
        name: 'Optical Milk Analyzer (Fat/SNF)',
        category: 'MILK_ANALYZER',
        connectionType: 'WEB_SERIAL',
        status: 'CONNECTED',
        portOrEndpoint: 'COM4',
        lastPing: new Date().toISOString(),
        errorMessage: null,
      },
    ])
  }, [])

  const refreshSession = useCallback(async () => {
    try {
      const session = await sessionsApi.getActiveSession()
      setActiveSession(session)
    } catch (err) {
      console.error('Failed to get active session:', err)
      setActiveSession(null)
    }
  }, [])

  const openSession = useCallback(async (params?: { shift?: ShiftType; businessDate?: string }): Promise<ActiveCollectionSession> => {
    const newSession = await sessionsApi.openSession(params)
    setActiveSession(newSession)
    return newSession
  }, [])

  const closeSession = useCallback(async (sessionCode: string): Promise<ActiveCollectionSession> => {
    const closed = await sessionsApi.closeSession(sessionCode)
    setActiveSession(closed)
    return closed
  }, [])

  const refreshOfflineCount = useCallback(async () => {
    try {
      const queue = await localDB.getOfflineQueue()
      setOfflineQueueCount(queue.length)
    } catch (err) {
      console.error('Failed to get offline queue count:', err)
    }
  }, [])

  const refreshCustomersAndTemplates = useCallback(async () => {
    try {
      const custList = await customersApi.list()
      setCustomersList(custList || [])
    } catch {
      setCustomersList([])
    }

    try {
      const rawTemplates = await identityApi.getFaceTemplates()
      if (rawTemplates && rawTemplates.length > 0) {
        const validTemplates: EnrolledFaceTemplate[] = rawTemplates
          .filter((t: any) => t.embedding && Array.isArray(t.embedding) && t.embedding.length === 128)
          .map((t: any) => ({
            templateId: t.templateId || t.id,
            customerId: t.customerId || t.customer_id,
            dairyId: t.dairyId || t.organization_id,
            farmerCode: t.farmerCode || t.farmer_code,
            fullName: t.fullName || t.full_name,
            embedding: t.embedding,
            status: t.status || 'ACTIVE',
          }))
        setEnrolledTemplates(validTemplates)
      } else {
        setEnrolledTemplates([])
      }
    } catch {
      setEnrolledTemplates([])
    }
  }, [])

  useEffect(() => {
    refreshDevices()
    refreshSession()
    refreshOfflineCount()
    refreshCustomersAndTemplates()

    const handleOnline = () => setIsNetworkOnline(true)
    const handleOffline = () => setIsNetworkOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Connect hardware event listeners
    rfidReaderDriver.startKeyboardListener()
    const unsubRfid = rfidReaderDriver.onScan(async (evt) => {
      setRfidState({
        status: 'READING',
        cardUid: evt.cardUid,
        matchedCustomer: null,
      })
      const target = await customersApi.getByRfid(evt.cardUid)
      const { dairyId } = getStoredOperatorAuth()
      if (target && (!target.dairyId || !dairyId || target.dairyId === dairyId)) {
        setRfidState({
          status: 'MATCHED',
          cardUid: evt.cardUid,
          matchedCustomer: target,
        })
        voiceAnnouncer.speakCustomerIdentified(target.fullName)
        setMeasurements((prev) => ({
          ...prev,
          milkCategory: target.preferredCategory,
        }))
      } else {
        setRfidState({
          status: 'UNASSIGNED_CARD',
          cardUid: evt.cardUid,
          matchedCustomer: null,
        })
      }
    })

    const unsubScale = scaleDriver.onReading((reading) => {
      setMeasurements((prev) => {
        const merged = {
          ...prev,
          weightLiters: reading.weight,
          scaleStable: reading.isStable,
          scaleConnected: true,
        }
        const errors: string[] = []
        if (merged.fat < 2.0 || merged.fat > 15.0) errors.push('Fat out of biological bounds (2.0% - 15.0%)')
        if (merged.snf < 6.0 || merged.snf > 12.0) errors.push('SNF out of biological bounds (6.0% - 12.0%)')
        if (merged.weightLiters <= 0) errors.push('Milk volume must be greater than 0 L')
        if (!merged.scaleStable) errors.push('Waiting for scale stabilization')
        merged.readingsValid = errors.length === 0
        merged.validationErrors = errors
        return merged
      })
    })

    const unsubAnalyzer = milkAnalyzerDriver.onReading((reading) => {
      setMeasurements((prev) => {
        const merged = {
          ...prev,
          fat: reading.fat,
          snf: reading.snf,
          clrDensity: reading.clrDensity,
          temperatureCelsius: reading.temperatureCelsius || prev.temperatureCelsius,
          analyzerConnected: true,
        }
        const errors: string[] = []
        if (merged.fat < 2.0 || merged.fat > 15.0) errors.push('Fat out of biological bounds (2.0% - 15.0%)')
        if (merged.snf < 6.0 || merged.snf > 12.0) errors.push('SNF out of biological bounds (6.0% - 12.0%)')
        if (merged.weightLiters <= 0) errors.push('Milk volume must be greater than 0 L')
        if (!merged.scaleStable) errors.push('Waiting for scale stabilization')
        merged.readingsValid = errors.length === 0
        merged.validationErrors = errors
        return merged
      })
    })

    return () => {
      rfidReaderDriver.stopKeyboardListener()
      unsubRfid()
      unsubScale()
      unsubAnalyzer()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [refreshDevices, refreshSession, refreshOfflineCount, refreshCustomersAndTemplates])

  // Face Recognition Matching with OpenCV YuNet + SFace INT8 and Dairy-Scope Validation
  const simulateFaceDetection = async (customerCode?: string): Promise<CustomerIdentity | null> => {
    const { dairyId } = getStoredOperatorAuth()
    const activeDairy = dairyId || '00000000-0000-0000-0000-000000000001'

    // 1. FACE_DETECTED
    setFaceState((prev) => ({
      ...prev,
      status: 'FACE_DETECTED',
      boundingBox: {
        x: 120,
        y: 80,
        width: 180,
        height: 220,
        confidence: 0.98,
        landmarks: [
          [160, 150],
          [240, 150],
          [200, 195],
          [170, 240],
          [230, 240],
        ],
      },
      latencyMs: 12,
    }))

    await new Promise((resolve) => setTimeout(resolve, 150))

    setFaceState((prev) => ({
      ...prev,
      status: 'EMBEDDING_GENERATED',
      latencyMs: 14,
    }))

    // Build probe embedding vector
    let probe = [...CANONICAL_SFACE_128D_FIXTURE]
    if (customerCode === 'UNKNOWN') {
      // Generate orthogonal/unmatched vector
      probe = probe.map((v) => -v)
    }

    // Run dairy-scoped match
    const matchRes = DairyFaceMatcher.match(
      probe,
      activeDairy,
      enrolledTemplates,
      customersMap
    )

    let target: CustomerIdentity | null = null
    if (customerCode && customerCode !== 'UNKNOWN') {
      const specific = customersList.find((c) => c.customerCode === customerCode || c.farmerCode === customerCode)
      if (specific && (!specific.dairyId || specific.dairyId === activeDairy)) {
        target = specific
      }
    } else if (matchRes.isMatch && matchRes.matchedCustomer) {
      target = matchRes.matchedCustomer
    }

    if (target && (!target.dairyId || target.dairyId === activeDairy)) {
      setFaceState((prev) => ({
        ...prev,
        status: 'CUSTOMER_MATCHED',
        confidenceScore: 98.4,
        matchedCustomer: target,
        unknownPersonAlert: false,
      }))
      voiceAnnouncer.speakCustomerIdentified(target.fullName)
      setMeasurements((prev) => ({
        ...prev,
        milkCategory: target!.preferredCategory,
      }))
      return target
    } else {
      setFaceState((prev) => ({
        ...prev,
        status: 'UNKNOWN_PERSON',
        confidenceScore: 32.1,
        matchedCustomer: null,
        unknownPersonAlert: true,
      }))
      return null
    }
  }

  const resetFaceState = () => {
    setFaceState(defaultFaceState)
  }

  // RFID Contactless Reader Simulation
  const simulateRfidScan = async (cardUid: string): Promise<CustomerIdentity | null> => {
    setRfidState({
      status: 'READING',
      cardUid,
      matchedCustomer: null,
    })

    const target = await customersApi.getByRfid(cardUid)
    if (target) {
      setRfidState({
        status: 'MATCHED',
        cardUid,
        matchedCustomer: target,
      })
      voiceAnnouncer.speakCustomerIdentified(target.fullName)
      setMeasurements((prev) => ({
        ...prev,
        milkCategory: target.preferredCategory,
      }))
      return target
    } else {
      setRfidState({
        status: 'UNASSIGNED_CARD',
        cardUid,
        matchedCustomer: null,
      })
      return null
    }
  }

  const resetRfidState = () => {
    setRfidState(defaultRfidState)
  }

  // Measurement updates with strict biological boundaries
  const updateMeasurements = (updates: Partial<MilkMeasurements>) => {
    setMeasurements((prev) => {
      const merged = { ...prev, ...updates }
      const errors: string[] = []

      if (merged.fat < 2.0 || merged.fat > 15.0) {
        errors.push('Fat out of biological bounds (2.0% - 15.0%)')
      }
      if (merged.snf < 6.0 || merged.snf > 12.0) {
        errors.push('SNF out of biological bounds (6.0% - 12.0%)')
      }
      if (merged.weightLiters <= 0) {
        errors.push('Milk volume must be greater than 0 L')
      }
      if (!merged.scaleStable) {
        errors.push('Waiting for scale stabilization')
      }

      merged.readingsValid = errors.length === 0
      merged.validationErrors = errors
      return merged
    })
  }

  const tareScale = () => {
    setMeasurements((prev) => ({
      ...prev,
      weightLiters: 0.0,
      scaleStable: true,
    }))
  }

  const resetIntakeCycle = () => {
    setManualCustomer(null)
    resetFaceState()
    resetRfidState()
    milkAnalyzerDriver.clearLastReading()
    voiceAnnouncer.resetAnnouncer()
    setMeasurements((prev) => ({
      ...prev,
      weightLiters: 0.0,
      scaleStable: true,
      readingsValid: false,
      validationErrors: ['Awaiting weight reading'],
    }))
  }

  // Hardware connection methods
  const connectScale = async (baudRate = 4800): Promise<boolean> => {
    const success = await scaleDriver.connect(baudRate)
    if (success) {
      setMeasurements((prev) => ({ ...prev, scaleConnected: true }))
    }
    return success
  }

  const disconnectScale = async (): Promise<void> => {
    await scaleDriver.disconnect()
    setMeasurements((prev) => ({ ...prev, scaleConnected: false }))
  }

  const connectAnalyzer = async (baudRate = 19200): Promise<boolean> => {
    const success = await milkAnalyzerDriver.connect(baudRate)
    if (success) {
      setMeasurements((prev) => ({ ...prev, analyzerConnected: true }))
    }
    return success
  }

  const disconnectAnalyzer = async (): Promise<void> => {
    await milkAnalyzerDriver.disconnect()
    setMeasurements((prev) => ({ ...prev, analyzerConnected: false }))
  }

  const connectRfidSerial = async (baudRate = 9600): Promise<boolean> => {
    return rfidReaderDriver.connectSerial(baudRate)
  }

  const disconnectRfidSerial = async (): Promise<void> => {
    await rfidReaderDriver.disconnectSerial()
  }

  const printReceipt = async (txn: CollectionTransaction, options: any = {}): Promise<boolean> => {
    const { dairyCode, dairyId } = getStoredOperatorAuth()
    const mergedOpts = {
      dairyName: dairyCode ? `DFarm - ${dairyCode}` : 'DFarm Dairy Cooperative',
      centerName: 'Collection Center',
      ...options,
    }
    return thermalPrinterDriver.printToSerial(txn, mergedOpts)
  }

  return (
    <HardwareContext.Provider
      value={{
        devices,
        activeSession,
        faceState,
        rfidState,
        measurements,
        offlineQueueCount,
        isNetworkOnline,
        hasIdentityConflict,
        manualCustomer,
        setManualCustomer,
        customersList,
        customersMap,
        enrolledTemplates,
        setNetworkOnline: setIsNetworkOnline,
        refreshDevices,
        refreshSession,
        openSession,
        closeSession,
        refreshOfflineCount,
        refreshCustomersAndTemplates,
        simulateFaceDetection,
        resetFaceState,
        simulateRfidScan,
        resetRfidState,
        updateMeasurements,
        tareScale,
        resetIntakeCycle,
        connectScale,
        disconnectScale,
        connectAnalyzer,
        disconnectAnalyzer,
        connectRfidSerial,
        disconnectRfidSerial,
        printReceipt,
      }}
    >
      {children}
    </HardwareContext.Provider>
  )
}

export const useHardware = () => {
  const context = useContext(HardwareContext)
  if (!context) {
    throw new Error('useHardware must be used within a HardwareProvider')
  }
  return context
}
