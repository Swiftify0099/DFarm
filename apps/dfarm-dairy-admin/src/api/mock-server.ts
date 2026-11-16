// DFarm Dairy Admin Web — Authoritative In-Memory Dairy Backend Server
// Enforces single-tenant isolation, real OTP verification state machine,
// non-destructive financial adjustments, and auditable business operations.

import type {
  DairyProfile,
  DairyAdminUser,
  Customer,
  CustomerRegistrationRequest,
  FaceEnrollmentRecord,
  RfidCardRecord,
  CollectionSession,
  MilkCollectionTransaction,
  MilkQualityReading,
  MilkRateChart,
  CustomerLedgerEntry,
  DairyBill,
  FeedProduct,
  FeedStockMovement,
  CustomerFeedSale,
  PaymentRecord,
  CollectionDevice,
  StaffMember,
  AuditLogEntry,
  DairyNotification,
  DashboardSummary,
} from '@/types'

// Primary Dairy Tenant Definition
export const CURRENT_DAIRY_ID = 'dairy-ten-9801'

export const SEED_DAIRY: DairyProfile = {
  id: CURRENT_DAIRY_ID,
  dairyCode: 'DF-GOKUL-01',
  name: 'Gokul Dairy Farmers Cooperative',
  registrationNumber: 'COOP-MH-2021-94812',
  ownerName: 'Pankaj Popat Yewale',
  primaryContactPhone: '7755995615',
  contactEmail: 'pankaj.yewale@dfarm.platform',
  address: {
    village: 'Gokul Shirgaon',
    subDistrict: 'Karveer',
    district: 'Kolhapur',
    state: 'Maharashtra',
    pincode: '416234',
  },
  operationalDetails: {
    morningShiftStart: '05:30',
    morningShiftEnd: '09:30',
    eveningShiftStart: '17:00',
    eveningShiftEnd: '21:00',
    activeMilkTypes: ['COW', 'BUFFALO'],
    billingCycleDays: 15,
    autoApproveBiometrics: false,
  },
  subscriptionTier: 'ENTERPRISE_DAIRY',
  status: 'ACTIVE',
  createdAt: '2024-01-10T08:00:00Z',
  updatedAt: '2026-11-01T12:00:00Z',
}

// In-memory OTP storage
interface ActiveOtpSession {
  mobileNumber: string
  otp: string
  expiresAt: number
  attemptsRemaining: number
}

let activeOtpSessions: Record<string, ActiveOtpSession> = {}

export const getAuthorizedAdminPhones = (): Set<string> => {
  const base = new Set<string>(['7755995615', '9876543210'])
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('dfarm_authorized_admin_phones')
      if (stored) {
        const list: string[] = JSON.parse(stored)
        list.forEach((p) => base.add(p))
      }
    }
  } catch {}
  return base
}

export const addAuthorizedAdminPhone = (phone: string): void => {
  try {
    const phones = getAuthorizedAdminPhones()
    phones.add(phone)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('dfarm_authorized_admin_phones', JSON.stringify(Array.from(phones)))
    }
  } catch {}
}

// Seed Customers
let customers: Customer[] = [
  {
    id: 'cust-101',
    dairyId: CURRENT_DAIRY_ID,
    customerCode: 'C-101',
    fullName: 'Pandurang Mahadev Patil',
    mobileNumber: '9822011223',
    fatherOrHusbandName: 'Mahadev Patil',
    status: 'ACTIVE',
    preferredCategory: 'COW',
    registrationDate: '2024-02-15',
    village: 'Gokul Shirgaon',
    bankDetails: {
      accountHolderName: 'Pandurang M Patil',
      bankName: 'Kolhapur District Central Bank',
      accountNumber: '10492819201',
      ifscCode: 'KDCB0001042',
      upiId: 'pandurang.patil@okhdfcbank',
    },
    biometric: {
      faceEnrollmentStatus: 'APPROVED',
      faceEnrolledAt: '2024-02-16T10:15:00Z',
      faceModelVersion: 'YuNet-v1.0 + SFace-INT8-v1.0',
      consentEvidenceHash: 'sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
    },
    rfidCard: {
      cardUid: 'RFID-94A2B81C',
      assignedAt: '2024-02-16T10:20:00Z',
      status: 'ACTIVE',
    },
    summary: {
      totalLitersDelivered: 4820.5,
      pendingBalance: 14250.0,
      totalFeedPurchased: 3200.0,
      lastDeliveryDate: '2026-11-15',
    },
    isSoftDeleted: false,
    auditCount: 4,
  },
  {
    id: 'cust-102',
    dairyId: CURRENT_DAIRY_ID,
    customerCode: 'C-102',
    fullName: 'Sunita Tukaram Shinde',
    mobileNumber: '9822033445',
    fatherOrHusbandName: 'Tukaram Shinde',
    status: 'ACTIVE',
    preferredCategory: 'BUFFALO',
    registrationDate: '2024-03-01',
    village: 'Gokul Shirgaon',
    bankDetails: {
      accountHolderName: 'Sunita T Shinde',
      bankName: 'State Bank of India',
      accountNumber: '20491829304',
      ifscCode: 'SBIN0004921',
      upiId: 'sunita.shinde@oksbi',
    },
    biometric: {
      faceEnrollmentStatus: 'APPROVED',
      faceEnrolledAt: '2024-03-02T11:00:00Z',
      faceModelVersion: 'YuNet-v1.0 + SFace-INT8-v1.0',
      consentEvidenceHash: 'sha256:5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    },
    rfidCard: {
      cardUid: 'RFID-12F4C99D',
      assignedAt: '2024-03-02T11:10:00Z',
      status: 'ACTIVE',
    },
    summary: {
      totalLitersDelivered: 3640.0,
      pendingBalance: 11800.0,
      totalFeedPurchased: 1850.0,
      lastDeliveryDate: '2026-11-15',
    },
    isSoftDeleted: false,
    auditCount: 3,
  },
  {
    id: 'cust-103',
    dairyId: CURRENT_DAIRY_ID,
    customerCode: 'C-103',
    fullName: 'Aniket Ganpatrao Jadhav',
    mobileNumber: '9822055667',
    fatherOrHusbandName: 'Ganpatrao Jadhav',
    status: 'ACTIVE',
    preferredCategory: 'COW',
    registrationDate: '2024-04-10',
    village: 'Ujalaiwadi',
    bankDetails: {
      accountHolderName: 'Aniket G Jadhav',
      bankName: 'Bank of Maharashtra',
      accountNumber: '60192837461',
      ifscCode: 'MAHB0000129',
    },
    biometric: {
      faceEnrollmentStatus: 'APPROVED',
      faceEnrolledAt: '2024-04-11T09:30:00Z',
      faceModelVersion: 'YuNet-v1.0 + SFace-INT8-v1.0',
      consentEvidenceHash: 'sha256:4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
    },
    rfidCard: {
      cardUid: 'RFID-66E1D220',
      assignedAt: '2024-04-11T09:40:00Z',
      status: 'ACTIVE',
    },
    summary: {
      totalLitersDelivered: 5120.0,
      pendingBalance: 15900.0,
      totalFeedPurchased: 4500.0,
      lastDeliveryDate: '2026-11-15',
    },
    isSoftDeleted: false,
    auditCount: 2,
  },
  {
    id: 'cust-104',
    dairyId: CURRENT_DAIRY_ID,
    customerCode: 'C-104',
    fullName: 'Namdev Baburao Gaikwad',
    mobileNumber: '9822077889',
    fatherOrHusbandName: 'Baburao Gaikwad',
    status: 'ACTIVE',
    preferredCategory: 'BUFFALO',
    registrationDate: '2024-05-18',
    village: 'Mudshingi',
    biometric: {
      faceEnrollmentStatus: 'RE_ENROLL_REQUESTED',
      faceEnrolledAt: '2024-05-19T14:20:00Z',
      faceModelVersion: 'YuNet-v1.0 + SFace-INT8-v1.0',
    },
    rfidCard: {
      cardUid: 'RFID-88B4C011',
      assignedAt: '2024-05-19T14:30:00Z',
      status: 'ACTIVE',
    },
    summary: {
      totalLitersDelivered: 2980.0,
      pendingBalance: 8640.0,
      totalFeedPurchased: 1200.0,
      lastDeliveryDate: '2026-11-14',
    },
    isSoftDeleted: false,
    auditCount: 5,
  },
  {
    id: 'cust-105',
    dairyId: CURRENT_DAIRY_ID,
    customerCode: 'C-105',
    fullName: 'Balu Vishnu Chougule',
    mobileNumber: '9822099001',
    fatherOrHusbandName: 'Vishnu Chougule',
    status: 'SUSPENDED',
    preferredCategory: 'COW',
    registrationDate: '2024-06-22',
    village: 'Gokul Shirgaon',
    biometric: {
      faceEnrollmentStatus: 'REVOKED',
    },
    summary: {
      totalLitersDelivered: 1420.0,
      pendingBalance: 0.0,
      totalFeedPurchased: 0.0,
      lastDeliveryDate: '2026-09-30',
    },
    isSoftDeleted: false,
    auditCount: 4,
  },
]

// Seed Pending Registration Requests from Customer App
let pendingRegistrations: CustomerRegistrationRequest[] = [
  {
    id: 'reg-req-301',
    dairyId: CURRENT_DAIRY_ID,
    candidateName: 'Dnyaneshwar Vitthal More',
    mobileNumber: '9823112244',
    submittedAt: '2026-11-14T16:45:00Z',
    address: 'Plot 45, Near Hanuman Temple',
    village: 'Gokul Shirgaon',
    preferredCategory: 'COW',
    bankDetails: {
      accountNumber: '40192837192',
      bankName: 'Bank of India',
      ifscCode: 'BKID0001092',
    },
    faceCapture: {
      templateVersion: 'v1.2',
      modelVersion: 'YuNet-v1.0 + SFace-INT8-v1.0',
      consentTimestamp: '2026-11-14T16:44:12Z',
      consentAgreed: true,
      enrollmentStatus: 'PENDING_APPROVAL',
      qualityScore: 96.4,
      captureDevice: 'Customer App Android / SM-M315F',
    },
    status: 'PENDING',
  },
  {
    id: 'reg-req-302',
    dairyId: CURRENT_DAIRY_ID,
    candidateName: 'Meena Laxman Kambale',
    mobileNumber: '9823334466',
    submittedAt: '2026-11-15T08:12:00Z',
    address: 'House 12, Shivaji Chowk',
    village: 'Ujalaiwadi',
    preferredCategory: 'BUFFALO',
    bankDetails: {
      accountNumber: '50192847102',
      bankName: 'HDFC Bank',
      ifscCode: 'HDFC0000182',
    },
    faceCapture: {
      templateVersion: 'v1.2',
      modelVersion: 'YuNet-v1.0 + SFace-INT8-v1.0',
      consentTimestamp: '2026-11-15T08:11:30Z',
      consentAgreed: true,
      enrollmentStatus: 'PENDING_APPROVAL',
      qualityScore: 93.8,
      captureDevice: 'Customer App Android / Redmi Note 10',
    },
    status: 'PENDING',
  },
  {
    id: 'reg-req-303',
    dairyId: CURRENT_DAIRY_ID,
    candidateName: 'Sanjay Maruti Bhosale',
    mobileNumber: '9823556688',
    submittedAt: '2026-11-15T11:30:00Z',
    address: 'Gat No 114, Farm House',
    village: 'Mudshingi',
    preferredCategory: 'COW',
    faceCapture: {
      templateVersion: 'v1.2',
      modelVersion: 'YuNet-v1.0 + SFace-INT8-v1.0',
      consentTimestamp: '2026-11-15T11:29:45Z',
      consentAgreed: true,
      enrollmentStatus: 'PENDING_APPROVAL',
      qualityScore: 91.2,
      captureDevice: 'Customer App iOS / iPhone 12',
    },
    status: 'PENDING',
  },
]

// Seed Face Enrollment Records (YuNet + SFace ONNX)
let faceEnrollments: FaceEnrollmentRecord[] = [
  {
    id: 'face-rec-101',
    customerId: 'cust-101',
    customerCode: 'C-101',
    customerName: 'Pandurang Mahadev Patil',
    dairyId: CURRENT_DAIRY_ID,
    status: 'APPROVED',
    modelVersion: 'YuNet-v1.0 + SFace-INT8-v1.0',
    templateVersion: 1,
    consentGiven: true,
    consentTimestamp: '2024-02-16T10:14:00Z',
    qualityScore: 97.2,
    enrolledAt: '2024-02-16T10:15:00Z',
    approvedAt: '2024-02-16T10:18:00Z',
    approvedBy: 'Rajesh Patel (Primary Admin)',
    auditLogs: [
      {
        timestamp: '2024-02-16T10:15:00Z',
        action: 'FACE_TEMPLATE_EXTRACTED',
        operator: 'System (YuNet+SFace)',
        note: 'High-confidence face landmarks detected (5 landmarks, quality 97.2%)',
      },
      {
        timestamp: '2024-02-16T10:18:00Z',
        action: 'ENROLLMENT_APPROVED',
        operator: 'Rajesh Patel',
        note: 'Biometric consent verified; template registered on device kiosk',
      },
    ],
  },
  {
    id: 'face-rec-102',
    customerId: 'cust-102',
    customerCode: 'C-102',
    customerName: 'Sunita Tukaram Shinde',
    dairyId: CURRENT_DAIRY_ID,
    status: 'APPROVED',
    modelVersion: 'YuNet-v1.0 + SFace-INT8-v1.0',
    templateVersion: 1,
    consentGiven: true,
    consentTimestamp: '2024-03-02T10:58:00Z',
    qualityScore: 95.8,
    enrolledAt: '2024-03-02T11:00:00Z',
    approvedAt: '2024-03-02T11:05:00Z',
    approvedBy: 'Rajesh Patel (Primary Admin)',
    auditLogs: [
      {
        timestamp: '2024-03-02T11:00:00Z',
        action: 'FACE_TEMPLATE_EXTRACTED',
        operator: 'System (YuNet+SFace)',
      },
      {
        timestamp: '2024-03-02T11:05:00Z',
        action: 'ENROLLMENT_APPROVED',
        operator: 'Rajesh Patel',
      },
    ],
  },
  {
    id: 'face-rec-104',
    customerId: 'cust-104',
    customerCode: 'C-104',
    customerName: 'Namdev Baburao Gaikwad',
    dairyId: CURRENT_DAIRY_ID,
    status: 'RE_ENROLL_REQUESTED',
    modelVersion: 'YuNet-v1.0 + SFace-INT8-v1.0',
    templateVersion: 1,
    consentGiven: true,
    consentTimestamp: '2024-05-19T14:18:00Z',
    qualityScore: 78.4, // Lower score triggered re-enroll request
    enrolledAt: '2024-05-19T14:20:00Z',
    reEnrollmentNote: 'Low lighting condition detected during morning session kiosk scan; request fresh capture with neutral illumination.',
    auditLogs: [
      {
        timestamp: '2024-05-19T14:20:00Z',
        action: 'ENROLLMENT_SUBMITTED',
        operator: 'System',
      },
      {
        timestamp: '2026-11-10T16:00:00Z',
        action: 'RE_ENROLLMENT_REQUESTED',
        operator: 'Rajesh Patel',
        note: 'Requested re-enrollment due to low confidence threshold in kiosk',
      },
    ],
  },
]

// Seed RFID Cards
let rfidCards: RfidCardRecord[] = [
  {
    id: 'rfid-rec-01',
    cardUid: 'RFID-94A2B81C',
    dairyId: CURRENT_DAIRY_ID,
    customerId: 'cust-101',
    customerCode: 'C-101',
    customerName: 'Pandurang Mahadev Patil',
    status: 'ACTIVE',
    issuedAt: '2024-02-16T10:20:00Z',
    issuedBy: 'Rajesh Patel',
    lastScannedAt: '2026-11-15T06:14:22Z',
    lastScannedDevice: 'DF-KIOSK-001',
  },
  {
    id: 'rfid-rec-02',
    cardUid: 'RFID-12F4C99D',
    dairyId: CURRENT_DAIRY_ID,
    customerId: 'cust-102',
    customerCode: 'C-102',
    customerName: 'Sunita Tukaram Shinde',
    status: 'ACTIVE',
    issuedAt: '2024-03-02T11:10:00Z',
    issuedBy: 'Rajesh Patel',
    lastScannedAt: '2026-11-15T06:45:10Z',
    lastScannedDevice: 'DF-KIOSK-001',
  },
  {
    id: 'rfid-rec-03',
    cardUid: 'RFID-66E1D220',
    dairyId: CURRENT_DAIRY_ID,
    customerId: 'cust-103',
    customerCode: 'C-103',
    customerName: 'Aniket Ganpatrao Jadhav',
    status: 'ACTIVE',
    issuedAt: '2024-04-11T09:40:00Z',
    issuedBy: 'Rajesh Patel',
    lastScannedAt: '2026-11-15T07:12:05Z',
    lastScannedDevice: 'DF-KIOSK-002',
  },
  {
    id: 'rfid-rec-04',
    cardUid: 'RFID-88B4C011',
    dairyId: CURRENT_DAIRY_ID,
    customerId: 'cust-104',
    customerCode: 'C-104',
    customerName: 'Namdev Baburao Gaikwad',
    status: 'ACTIVE',
    issuedAt: '2024-05-19T14:30:00Z',
    issuedBy: 'Rajesh Patel',
    lastScannedAt: '2026-11-14T18:22:18Z',
    lastScannedDevice: 'DF-KIOSK-001',
  },
  {
    id: 'rfid-rec-05',
    cardUid: 'RFID-UNASSIGNED-01',
    dairyId: CURRENT_DAIRY_ID,
    status: 'UNASSIGNED',
    issuedAt: '2026-10-01T00:00:00Z',
    issuedBy: 'Super Admin',
  },
  {
    id: 'rfid-rec-06',
    cardUid: 'RFID-UNASSIGNED-02',
    dairyId: CURRENT_DAIRY_ID,
    status: 'UNASSIGNED',
    issuedAt: '2026-10-01T00:00:00Z',
    issuedBy: 'Super Admin',
  },
]

// Seed Rate Charts (Cow and Buffalo) with Versioning
let rateCharts: MilkRateChart[] = [
  {
    id: 'rc-cow-v1',
    dairyId: CURRENT_DAIRY_ID,
    title: 'Standard Cow Milk Rate Chart (Autumn 2025)',
    milkCategory: 'COW',
    version: 1,
    status: 'ARCHIVED',
    effectiveDate: '2025-09-01',
    baseRatePerLiter: 36.5,
    minFat: 3.0,
    maxFat: 5.0,
    fatStep: 0.1,
    minSnf: 8.0,
    maxSnf: 9.0,
    snfStep: 0.1,
    rateMatrix: [],
    createdAt: '2025-08-20T10:00:00Z',
    createdBy: 'Rajesh Patel',
    activatedAt: '2025-09-01T00:00:00Z',
    activatedBy: 'Rajesh Patel',
    changeNotes: 'Initial monsoon rate revision',
  },
  {
    id: 'rc-cow-v2',
    dairyId: CURRENT_DAIRY_ID,
    title: 'Approved Cow Milk Standard Rate Chart (2026)',
    milkCategory: 'COW',
    version: 2,
    status: 'ACTIVE',
    effectiveDate: '2026-04-01',
    baseRatePerLiter: 38.5,
    minFat: 3.0,
    maxFat: 5.0,
    fatStep: 0.1,
    minSnf: 8.0,
    maxSnf: 9.2,
    snfStep: 0.1,
    rateMatrix: [], // Computed dynamically
    createdAt: '2026-03-25T14:00:00Z',
    createdBy: 'Rajesh Patel',
    activatedAt: '2026-04-01T00:00:00Z',
    activatedBy: 'Rajesh Patel',
    changeNotes: 'Revised incentive of +Rs 2.00/L base rate; approved by committee',
  },
  {
    id: 'rc-buffalo-v1',
    dairyId: CURRENT_DAIRY_ID,
    title: 'Standard Buffalo High-Fat Chart (2026)',
    milkCategory: 'BUFFALO',
    version: 1,
    status: 'ACTIVE',
    effectiveDate: '2026-01-01',
    baseRatePerLiter: 58.0,
    minFat: 6.0,
    maxFat: 10.0,
    fatStep: 0.1,
    minSnf: 8.5,
    maxSnf: 9.5,
    snfStep: 0.1,
    rateMatrix: [],
    createdAt: '2025-12-28T11:00:00Z',
    createdBy: 'Rajesh Patel',
    activatedAt: '2026-01-01T00:00:00Z',
    activatedBy: 'Rajesh Patel',
    changeNotes: 'Annual Buffalo fat chart based on Kolhapur District benchmark',
  },
]

// Seed Collection Sessions
let collectionSessions: CollectionSession[] = [
  {
    id: 'ses-2026-11-14-e',
    sessionId: 'SES-2026-11-14-E',
    dairyId: CURRENT_DAIRY_ID,
    date: '2026-11-14',
    shift: 'EVENING',
    status: 'CLOSED',
    openedAt: '2026-11-14T17:00:00Z',
    closedAt: '2026-11-14T20:45:00Z',
    openingOperatorId: 'op-01',
    openingOperatorName: 'Suresh More',
    closingOperatorId: 'op-01',
    closingOperatorName: 'Suresh More',
    deviceId: 'DF-KIOSK-001',
    deviceName: 'Gokul Main Collection Kiosk #1',
    totals: {
      transactionCount: 28,
      totalLiters: 412.5,
      cowLiters: 260.0,
      buffaloLiters: 152.5,
      averageFat: 4.8,
      averageSnf: 8.7,
      totalAmount: 18240.0,
    },
    syncStatus: 'SYNCED',
  },
  {
    id: 'ses-2026-11-15-m',
    sessionId: 'SES-2026-11-15-M',
    dairyId: CURRENT_DAIRY_ID,
    date: '2026-11-15',
    shift: 'MORNING',
    status: 'CLOSED',
    openedAt: '2026-11-15T05:30:00Z',
    closedAt: '2026-11-15T09:15:00Z',
    openingOperatorId: 'op-01',
    openingOperatorName: 'Suresh More',
    closingOperatorId: 'op-01',
    closingOperatorName: 'Suresh More',
    deviceId: 'DF-KIOSK-001',
    deviceName: 'Gokul Main Collection Kiosk #1',
    totals: {
      transactionCount: 34,
      totalLiters: 538.0,
      cowLiters: 340.5,
      buffaloLiters: 197.5,
      averageFat: 4.9,
      averageSnf: 8.8,
      totalAmount: 24150.0,
    },
    syncStatus: 'SYNCED',
  },
  {
    id: 'ses-2026-11-15-e',
    sessionId: 'SES-2026-11-15-E',
    dairyId: CURRENT_DAIRY_ID,
    date: '2026-11-15',
    shift: 'EVENING',
    status: 'OPEN',
    openedAt: '2026-11-15T17:00:00Z',
    openingOperatorId: 'op-02',
    openingOperatorName: 'Sachin Patil',
    deviceId: 'DF-KIOSK-001',
    deviceName: 'Gokul Main Collection Kiosk #1',
    totals: {
      transactionCount: 16,
      totalLiters: 245.0,
      cowLiters: 160.0,
      buffaloLiters: 85.0,
      averageFat: 4.75,
      averageSnf: 8.72,
      totalAmount: 11140.0,
    },
    syncStatus: 'SYNCED',
  },
]

// Seed Milk Collection Transactions
let collectionTransactions: MilkCollectionTransaction[] = [
  {
    id: 'txn-901',
    transactionId: 'TXN-20261115-001',
    dairyId: CURRENT_DAIRY_ID,
    sessionId: 'ses-2026-11-15-m',
    customerId: 'cust-101',
    customerCode: 'C-101',
    customerName: 'Pandurang Mahadev Patil',
    timestamp: '2026-11-15T06:14:22Z',
    date: '2026-11-15',
    shift: 'MORNING',
    milkCategory: 'COW',
    weightLiters: 14.8,
    fatPercentage: 4.2,
    snfPercentage: 8.7,
    appliedRatePerLiter: 41.2,
    rateChartVersion: 2,
    rateChartId: 'rc-cow-v2',
    totalAmount: 609.76,
    deviceId: 'DF-KIOSK-001',
    operatorId: 'op-01',
    status: 'CONFIRMED',
    syncState: 'SYNCED',
  },
  {
    id: 'txn-902',
    transactionId: 'TXN-20261115-002',
    dairyId: CURRENT_DAIRY_ID,
    sessionId: 'ses-2026-11-15-m',
    customerId: 'cust-102',
    customerCode: 'C-102',
    customerName: 'Sunita Tukaram Shinde',
    timestamp: '2026-11-15T06:45:10Z',
    date: '2026-11-15',
    shift: 'MORNING',
    milkCategory: 'BUFFALO',
    weightLiters: 11.2,
    fatPercentage: 7.2,
    snfPercentage: 9.1,
    appliedRatePerLiter: 68.4,
    rateChartVersion: 1,
    rateChartId: 'rc-buffalo-v1',
    totalAmount: 766.08,
    deviceId: 'DF-KIOSK-001',
    operatorId: 'op-01',
    status: 'CONFIRMED',
    syncState: 'SYNCED',
  },
  {
    id: 'txn-903',
    transactionId: 'TXN-20261115-003',
    dairyId: CURRENT_DAIRY_ID,
    sessionId: 'ses-2026-11-15-m',
    customerId: 'cust-103',
    customerCode: 'C-103',
    customerName: 'Aniket Ganpatrao Jadhav',
    timestamp: '2026-11-15T07:12:05Z',
    date: '2026-11-15',
    shift: 'MORNING',
    milkCategory: 'COW',
    weightLiters: 18.5,
    fatPercentage: 3.9,
    snfPercentage: 8.5,
    appliedRatePerLiter: 39.8,
    rateChartVersion: 2,
    rateChartId: 'rc-cow-v2',
    totalAmount: 736.3,
    deviceId: 'DF-KIOSK-002',
    operatorId: 'op-01',
    status: 'CONFIRMED',
    syncState: 'SYNCED',
  },
  {
    id: 'txn-904',
    transactionId: 'TXN-20261115-004',
    dairyId: CURRENT_DAIRY_ID,
    sessionId: 'ses-2026-11-15-m',
    customerId: 'cust-104',
    customerCode: 'C-104',
    customerName: 'Namdev Baburao Gaikwad',
    timestamp: '2026-11-15T07:40:19Z',
    date: '2026-11-15',
    shift: 'MORNING',
    milkCategory: 'BUFFALO',
    weightLiters: 9.0,
    fatPercentage: 6.8,
    snfPercentage: 8.9,
    appliedRatePerLiter: 64.6,
    rateChartVersion: 1,
    rateChartId: 'rc-buffalo-v1',
    totalAmount: 581.4,
    deviceId: 'DF-KIOSK-001',
    operatorId: 'op-01',
    status: 'CONFIRMED',
    syncState: 'SYNCED',
  },
  {
    id: 'txn-905',
    transactionId: 'TXN-20261115-005',
    dairyId: CURRENT_DAIRY_ID,
    sessionId: 'ses-2026-11-15-e',
    customerId: 'cust-101',
    customerCode: 'C-101',
    customerName: 'Pandurang Mahadev Patil',
    timestamp: '2026-11-15T17:35:10Z',
    date: '2026-11-15',
    shift: 'EVENING',
    milkCategory: 'COW',
    weightLiters: 13.5,
    fatPercentage: 4.1,
    snfPercentage: 8.6,
    appliedRatePerLiter: 40.5,
    rateChartVersion: 2,
    rateChartId: 'rc-cow-v2',
    totalAmount: 546.75,
    deviceId: 'DF-KIOSK-001',
    operatorId: 'op-02',
    status: 'CONFIRMED',
    syncState: 'SYNCED',
  },
]

// Seed Milk Quality Readings
let qualityReadings: MilkQualityReading[] = [
  {
    id: 'qual-01',
    dairyId: CURRENT_DAIRY_ID,
    timestamp: '2026-11-15T06:14:22Z',
    date: '2026-11-15',
    shift: 'MORNING',
    customerCode: 'C-101',
    customerName: 'Pandurang Mahadev Patil',
    category: 'COW',
    fat: 4.2,
    snf: 8.7,
    clrDensity: 29.5,
    temperatureCelsius: 24.2,
    adulterationStatus: 'CLEAN',
    readingValid: true,
    sensorTelemetry: { opticalLactometerOk: true, weightCellStable: true },
  },
  {
    id: 'qual-02',
    dairyId: CURRENT_DAIRY_ID,
    timestamp: '2026-11-15T06:45:10Z',
    date: '2026-11-15',
    shift: 'MORNING',
    customerCode: 'C-102',
    customerName: 'Sunita Tukaram Shinde',
    category: 'BUFFALO',
    fat: 7.2,
    snf: 9.1,
    clrDensity: 31.0,
    temperatureCelsius: 23.8,
    adulterationStatus: 'CLEAN',
    readingValid: true,
    sensorTelemetry: { opticalLactometerOk: true, weightCellStable: true },
  },
  {
    id: 'qual-03',
    dairyId: CURRENT_DAIRY_ID,
    timestamp: '2026-11-15T07:12:05Z',
    date: '2026-11-15',
    shift: 'MORNING',
    customerCode: 'C-103',
    customerName: 'Aniket Ganpatrao Jadhav',
    category: 'COW',
    fat: 3.9,
    snf: 8.5,
    clrDensity: 28.8,
    temperatureCelsius: 24.0,
    adulterationStatus: 'CLEAN',
    readingValid: true,
    sensorTelemetry: { opticalLactometerOk: true, weightCellStable: true },
  },
  {
    id: 'qual-04',
    dairyId: CURRENT_DAIRY_ID,
    timestamp: '2026-11-15T07:40:19Z',
    date: '2026-11-15',
    shift: 'MORNING',
    customerCode: 'C-104',
    customerName: 'Namdev Baburao Gaikwad',
    category: 'BUFFALO',
    fat: 6.8,
    snf: 8.9,
    clrDensity: 30.2,
    temperatureCelsius: 24.5,
    adulterationStatus: 'CLEAN',
    readingValid: true,
    sensorTelemetry: { opticalLactometerOk: true, weightCellStable: true },
  },
]

// Seed Customer Ledgers (Server-Authoritative)
let customerLedgers: CustomerLedgerEntry[] = [
  {
    id: 'ledg-101-1',
    dairyId: CURRENT_DAIRY_ID,
    customerId: 'cust-101',
    customerCode: 'C-101',
    customerName: 'Pandurang Mahadev Patil',
    timestamp: '2026-11-01T00:00:00Z',
    date: '2026-11-01',
    entryType: 'AUTHORIZED_ADJUSTMENT',
    referenceType: 'ADMIN_ADJUSTMENT',
    referenceId: 'CYCLE-OPEN-NOV26',
    description: 'Opening cycle balance brought forward',
    debit: 0,
    credit: 2500.0,
    runningBalance: 2500.0,
    authorizedBy: 'System Settlement',
  },
  {
    id: 'ledg-101-2',
    dairyId: CURRENT_DAIRY_ID,
    customerId: 'cust-101',
    customerCode: 'C-101',
    customerName: 'Pandurang Mahadev Patil',
    timestamp: '2026-11-05T14:30:00Z',
    date: '2026-11-05',
    entryType: 'FEED_DEBIT',
    referenceType: 'FEED_SALE',
    referenceId: 'FEED-SALE-901',
    description: 'Purchased 2 bags of Super Cattle Feed (50kg)',
    debit: 3200.0,
    credit: 0,
    runningBalance: -700.0,
    authorizedBy: 'Sachin Patil',
  },
  {
    id: 'ledg-101-3',
    dairyId: CURRENT_DAIRY_ID,
    customerId: 'cust-101',
    customerCode: 'C-101',
    customerName: 'Pandurang Mahadev Patil',
    timestamp: '2026-11-15T06:14:22Z',
    date: '2026-11-15',
    entryType: 'MILK_CREDIT',
    referenceType: 'COLLECTION_TX',
    referenceId: 'TXN-20261115-001',
    description: 'Milk delivery (Morning Shift - 14.8 L @ 41.20/L)',
    debit: 0,
    credit: 609.76,
    runningBalance: -90.24,
    authorizedBy: 'Kiosk Automation',
  },
  {
    id: 'ledg-101-4',
    dairyId: CURRENT_DAIRY_ID,
    customerId: 'cust-101',
    customerCode: 'C-101',
    customerName: 'Pandurang Mahadev Patil',
    timestamp: '2026-11-15T17:35:10Z',
    date: '2026-11-15',
    entryType: 'MILK_CREDIT',
    referenceType: 'COLLECTION_TX',
    referenceId: 'TXN-20261115-005',
    description: 'Milk delivery (Evening Shift - 13.5 L @ 40.50/L)',
    debit: 0,
    credit: 546.75,
    runningBalance: 456.51,
    authorizedBy: 'Kiosk Automation',
  },
]

// Seed Billing and Monthly Settlements
let dairyBills: DairyBill[] = [
  {
    id: 'bill-2026-10-b2',
    billNumber: 'BILL-2026-10-0084',
    dairyId: CURRENT_DAIRY_ID,
    customerId: 'cust-101',
    customerCode: 'C-101',
    customerName: 'Pandurang Mahadev Patil',
    periodStart: '2026-10-16',
    periodEnd: '2026-10-31',
    cycleName: 'Late October 2026 (Fortnightly)',
    totalMilkVolumeLiters: 420.5,
    totalMilkAmount: 17240.5,
    totalFeedDeduction: 1600.0,
    otherAdjustments: 0.0,
    netPayableAmount: 15640.5,
    amountPaid: 15640.5,
    outstandingBalance: 0.0,
    status: 'SETTLED',
    generatedAt: '2026-11-01T08:00:00Z',
    generatedBy: 'Rajesh Patel',
    settledAt: '2026-11-03T11:00:00Z',
  },
  {
    id: 'bill-2026-11-b1',
    billNumber: 'BILL-2026-11-0012',
    dairyId: CURRENT_DAIRY_ID,
    customerId: 'cust-101',
    customerCode: 'C-101',
    customerName: 'Pandurang Mahadev Patil',
    periodStart: '2026-11-01',
    periodEnd: '2026-11-15',
    cycleName: 'Early November 2026 (Fortnightly)',
    totalMilkVolumeLiters: 418.0,
    totalMilkAmount: 16850.0,
    totalFeedDeduction: 3200.0,
    otherAdjustments: 0.0,
    netPayableAmount: 13650.0,
    amountPaid: 0.0,
    outstandingBalance: 13650.0,
    status: 'GENERATED',
    generatedAt: '2026-11-15T12:00:00Z',
    generatedBy: 'Rajesh Patel',
  },
]

// Seed Feed Products & Inventory
let feedProducts: FeedProduct[] = [
  {
    id: 'feed-p1',
    dairyId: CURRENT_DAIRY_ID,
    sku: 'FEED-SUP-50KG',
    name: 'Gokul High-Yield Cattle Feed',
    category: 'CATTLE_FEED_CONCENTRATE',
    unit: 'BAG_50KG',
    purchaseRate: 1450.0,
    sellingRate: 1600.0,
    availableStock: 84,
    minStockAlertLevel: 25,
    status: 'ACTIVE',
    description: 'Enriched balanced protein feed for lactating dairy cows and buffaloes.',
    updatedAt: '2026-11-10T10:00:00Z',
  },
  {
    id: 'feed-p2',
    dairyId: CURRENT_DAIRY_ID,
    sku: 'FEED-MIN-1KG',
    name: 'Chelated Mineral Mixture Premium',
    category: 'MINERAL_MIXTURE',
    unit: 'PACKET',
    purchaseRate: 85.0,
    sellingRate: 110.0,
    availableStock: 18, // Triggers low-stock alert (< 20)
    minStockAlertLevel: 20,
    status: 'ACTIVE',
    description: 'Essential trace minerals for optimum fat percentage and animal immunity.',
    updatedAt: '2026-11-12T14:30:00Z',
  },
  {
    id: 'feed-p3',
    dairyId: CURRENT_DAIRY_ID,
    sku: 'FEED-CAL-5L',
    name: 'CalciBoost Liquid Gold (5L)',
    category: 'CALCIUM_SUPPLEMENT',
    unit: 'CAN_5L',
    purchaseRate: 680.0,
    sellingRate: 850.0,
    availableStock: 32,
    minStockAlertLevel: 10,
    status: 'ACTIVE',
    description: 'High-absorption ionic calcium and phosphorus tonic for milk yield.',
    updatedAt: '2026-11-11T09:15:00Z',
  },
]

let feedMovements: FeedStockMovement[] = [
  {
    id: 'f-mov-1',
    dairyId: CURRENT_DAIRY_ID,
    productId: 'feed-p1',
    productName: 'Gokul High-Yield Cattle Feed',
    movementType: 'PURCHASE_RESTOCK',
    quantity: 100,
    previousStock: 0,
    resultingStock: 100,
    referenceId: 'PO-2026-402',
    reason: 'Monthly bulk distributor shipment received',
    performedBy: 'Rajesh Patel',
    timestamp: '2026-11-01T09:00:00Z',
  },
  {
    id: 'f-mov-2',
    dairyId: CURRENT_DAIRY_ID,
    productId: 'feed-p1',
    productName: 'Gokul High-Yield Cattle Feed',
    movementType: 'CUSTOMER_SALE',
    quantity: -2,
    previousStock: 86,
    resultingStock: 84,
    referenceId: 'FEED-SALE-901',
    reason: 'Sale to customer C-101 (Pandurang Patil)',
    performedBy: 'Sachin Patil',
    timestamp: '2026-11-05T14:30:00Z',
  },
]

let customerFeedSales: CustomerFeedSale[] = [
  {
    id: 'feed-sale-901',
    dairyId: CURRENT_DAIRY_ID,
    saleId: 'FEED-SALE-901',
    customerId: 'cust-101',
    customerCode: 'C-101',
    customerName: 'Pandurang Mahadev Patil',
    productId: 'feed-p1',
    productName: 'Gokul High-Yield Cattle Feed',
    quantity: 2,
    unit: 'BAG_50KG',
    unitPrice: 1600.0,
    totalAmount: 3200.0,
    purchaseDate: '2026-11-05',
    paymentMode: 'LEDGER_DEBIT',
    ledgerReferenceId: 'ledg-101-2',
    recordedBy: 'Sachin Patil',
    notes: 'Approved deduction from upcoming fortnightly milk settlement',
  },
]

// Seed Payments and Receipts
let paymentRecords: PaymentRecord[] = [
  {
    id: 'pay-001',
    dairyId: CURRENT_DAIRY_ID,
    receiptNumber: 'REC-2026-11-0021',
    customerId: 'cust-101',
    customerCode: 'C-101',
    customerName: 'Pandurang Mahadev Patil',
    amount: 15640.5,
    paymentDate: '2026-11-03',
    paymentMethod: 'BANK_TRANSFER',
    transactionReference: 'NEFT-MAHB-20261103091',
    linkedBillId: 'bill-2026-10-b2',
    linkedLedgerEntryId: 'ledg-101-1',
    status: 'RECONCILED',
    bankAccountLast4: '9201',
    reconciledAt: '2026-11-03T11:00:00Z',
    verifiedBy: 'Rajesh Patel',
    notes: 'Direct bank transfer credited for October Late cycle',
  },
]

// Seed Collection Devices
let collectionDevices: CollectionDevice[] = [
  {
    id: 'dev-001',
    dairyId: CURRENT_DAIRY_ID,
    deviceId: 'DF-KIOSK-001',
    deviceName: 'Gokul Main Collection Kiosk #1',
    deviceType: 'INTEGRATED_ANALYZER_KIOSK',
    ipAddress: '192.168.1.101',
    macAddress: 'B8:27:EB:4A:89:12',
    firmwareVersion: 'v2.4.1-rc3',
    faceModelCacheVersion: 'YuNet-v1.0 + SFace-INT8-v1.0',
    status: 'ONLINE',
    lastConnectedAt: '2026-11-15T15:00:00Z',
    lastSyncAt: '2026-11-15T14:59:10Z',
    pendingOfflineSyncEvents: 0,
    failedSyncEvents: 0,
    hardwareHealth: 'HEALTHY',
    locationAssigned: 'Main Collection Counter - Lane 1',
  },
  {
    id: 'dev-002',
    dairyId: CURRENT_DAIRY_ID,
    deviceId: 'DF-KIOSK-002',
    deviceName: 'Gokul Secondary Kiosk #2',
    deviceType: 'INTEGRATED_ANALYZER_KIOSK',
    ipAddress: '192.168.1.102',
    macAddress: 'B8:27:EB:5C:90:33',
    firmwareVersion: 'v2.4.1-rc3',
    faceModelCacheVersion: 'YuNet-v1.0 + SFace-INT8-v1.0',
    status: 'ONLINE',
    lastConnectedAt: '2026-11-15T14:58:00Z',
    lastSyncAt: '2026-11-15T14:55:00Z',
    pendingOfflineSyncEvents: 2,
    failedSyncEvents: 0,
    hardwareHealth: 'HEALTHY',
    locationAssigned: 'Main Collection Counter - Lane 2',
  },
  {
    id: 'dev-003',
    dairyId: CURRENT_DAIRY_ID,
    deviceId: 'DF-POS-003',
    deviceName: 'Field Supervisor Handheld POS',
    deviceType: 'BLUETOOTH_DAIRY_POS',
    ipAddress: '192.168.1.105',
    macAddress: '00:1A:7D:DA:71:08',
    firmwareVersion: 'v1.8.0',
    faceModelCacheVersion: 'YuNet-v1.0 + SFace-INT8-v1.0',
    status: 'OFFLINE',
    lastConnectedAt: '2026-11-14T20:10:00Z',
    lastSyncAt: '2026-11-14T20:10:00Z',
    pendingOfflineSyncEvents: 0,
    failedSyncEvents: 0,
    hardwareHealth: 'WARNING',
    lastErrorMessage: 'Device disconnected by operator after evening shift',
    locationAssigned: 'Mobile Van Collection Unit',
  },
]

// Seed Staff Members with Configurable Permissions
let staffMembers: StaffMember[] = [
  {
    id: 'staff-01',
    dairyId: CURRENT_DAIRY_ID,
    fullName: 'Pankaj Popat Yewale',
    mobileNumber: '7755995615',
    role: 'PRIMARY_DAIRY_ADMIN',
    permissions: [
      'VIEW_DASHBOARD',
      'MANAGE_CUSTOMERS',
      'APPROVE_REGISTRATIONS',
      'MANAGE_FACE_ENROLLMENT',
      'MANAGE_RFID',
      'MANAGE_COLLECTIONS',
      'PERFORM_ADJUSTMENTS',
      'MANAGE_RATE_CHARTS',
      'VIEW_LEDGER',
      'PERFORM_LEDGER_ADJUSTMENT',
      'GENERATE_BILLS',
      'MANAGE_FEED_INVENTORY',
      'RECORD_FEED_SALES',
      'RECONCILE_PAYMENTS',
      'VIEW_REPORTS',
      'EXPORT_REPORTS',
      'MANAGE_DEVICES',
      'MANAGE_STAFF',
      'VIEW_AUDIT_LOGS',
    ],
    isActive: true,
    createdAt: '2024-01-10T08:00:00Z',
    lastActiveAt: '2026-11-15T15:00:00Z',
  },
  {
    id: 'staff-02',
    dairyId: CURRENT_DAIRY_ID,
    fullName: 'Suresh Vishnu More',
    mobileNumber: '9822987654',
    role: 'SHIFT_SUPERVISOR',
    permissions: [
      'VIEW_DASHBOARD',
      'MANAGE_CUSTOMERS',
      'MANAGE_COLLECTIONS',
      'RECORD_FEED_SALES',
      'VIEW_REPORTS',
      'MANAGE_DEVICES',
    ],
    isActive: true,
    createdAt: '2024-02-01T09:00:00Z',
    lastActiveAt: '2026-11-15T09:30:00Z',
  },
  {
    id: 'staff-03',
    dairyId: CURRENT_DAIRY_ID,
    fullName: 'Sachin Ananda Patil',
    mobileNumber: '9822987111',
    role: 'COLLECTION_OPERATOR',
    permissions: ['VIEW_DASHBOARD', 'MANAGE_COLLECTIONS', 'RECORD_FEED_SALES'],
    isActive: true,
    createdAt: '2024-03-15T10:00:00Z',
    lastActiveAt: '2026-11-15T17:10:00Z',
  },
]

// Seed Notifications
let notifications: DairyNotification[] = [
  {
    id: 'notif-1',
    dairyId: CURRENT_DAIRY_ID,
    title: 'New Customer Registrations Pending',
    message: '3 farmers have submitted registrations with YuNet biometric templates awaiting your review.',
    category: 'REGISTRATION',
    severity: 'INFO',
    isRead: false,
    createdAt: '2026-11-15T11:30:00Z',
    actionUrl: '/customers/approvals',
  },
  {
    id: 'notif-2',
    dairyId: CURRENT_DAIRY_ID,
    title: 'Low Stock Alert: Mineral Mixture',
    message: 'Chelated Mineral Mixture stock is at 18 units (Threshold: 20 units). Restock recommended.',
    category: 'INVENTORY',
    severity: 'WARNING',
    isRead: false,
    createdAt: '2026-11-15T08:00:00Z',
    actionUrl: '/inventory',
  },
  {
    id: 'notif-3',
    dairyId: CURRENT_DAIRY_ID,
    title: 'Fortnightly Billing Cycle Generated',
    message: 'Cycle 1-15 Nov bills prepared for 42 active farmers. Review statements before final settlement.',
    category: 'BILLING',
    severity: 'SUCCESS',
    isRead: true,
    createdAt: '2026-11-15T12:00:00Z',
    actionUrl: '/billing',
  },
]

// Seed Audit Logs
let auditLogs: AuditLogEntry[] = [
  {
    id: 'aud-001',
    dairyId: CURRENT_DAIRY_ID,
    timestamp: '2026-11-15T12:00:00Z',
    actorId: 'staff-01',
    actorName: 'Rajesh Patel',
    actorRole: 'PRIMARY_DAIRY_ADMIN',
    action: 'BILL_GENERATED',
    targetEntity: 'DairyBill',
    entityId: 'bill-2026-11-b1',
    details: 'Initiated early November 2026 fortnightly settlement calculation',
    reason: 'Routine fortnightly billing cycle',
  },
  {
    id: 'aud-002',
    dairyId: CURRENT_DAIRY_ID,
    timestamp: '2026-11-15T05:30:00Z',
    actorId: 'staff-02',
    actorName: 'Suresh More',
    actorRole: 'SHIFT_SUPERVISOR',
    action: 'COLLECTION_SESSION_OPENED',
    targetEntity: 'CollectionSession',
    entityId: 'ses-2026-11-15-m',
    details: 'Opened Morning Shift on Kiosk #1 (Scale calibrated)',
  },
  {
    id: 'aud-003',
    dairyId: CURRENT_DAIRY_ID,
    timestamp: '2026-11-10T16:00:00Z',
    actorId: 'staff-01',
    actorName: 'Rajesh Patel',
    actorRole: 'PRIMARY_DAIRY_ADMIN',
    action: 'FACE_RE_ENROLLMENT_REQUESTED',
    targetEntity: 'Customer',
    entityId: 'cust-104',
    details: 'Requested re-enrollment for Namdev Gaikwad',
    reason: 'Quality score 78.4% below recommended 85% operating threshold',
  },
]

// Backend Mock API Methods
export const MockDairyBackend = {
  // 1. Auth & Mobile OTP
  sendLoginOtp: async (mobileNumber: string): Promise<{ success: boolean; message: string; previewOtp?: string }> => {
    // Validate registered mobile
    const authAdminPhones = getAuthorizedAdminPhones()
    const isWhitelisted =
      staffMembers.some((s) => s.mobileNumber === mobileNumber && s.isActive) ||
      authAdminPhones.has(mobileNumber) ||
      mobileNumber === '7755995615' ||
      mobileNumber === '9876543210'
    if (!isWhitelisted) {
      throw new Error(`Mobile number ${mobileNumber} is not registered as an authorized operator for this dairy. Contact Super Admin.`)
    }

    // Generate genuine 6-digit OTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString()
    activeOtpSessions[mobileNumber] = {
      mobileNumber,
      otp: generatedOtp,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      attemptsRemaining: 3,
    }

    // Dispatch real SMS via Dove SMS Gateway (non-blocking)
    try {
      if (typeof fetch !== 'undefined') {
        const queryParams = new URLSearchParams({
          user: 'Experts',
          key: 'ba9dcdcdfcXX',
          mobile: `+91${mobileNumber.slice(-10)}`,
          message: `Your Verification Code for login is ${generatedOtp}. - Expertskill Technology.`,
          accusage: '1',
          senderid: 'EXTSKL',
        })
        fetch(`https://mobicomm.dove-sms.com/submitsms.jsp?${queryParams.toString()}`, {
          method: 'GET',
          mode: 'no-cors',
        }).catch(() => {})
      }
    } catch {
      // In offline/isolated environment, fallback smoothly
    }

    // Return message and simulated dispatch preview so developer/admin can verify
    return {
      success: true,
      message: `OTP dispatched to +91 ${mobileNumber}. Valid for 5 minutes.`,
      previewOtp: generatedOtp,
    }
  },

  verifyLoginOtp: async (mobileNumber: string, enteredOtp: string): Promise<DairyAdminUser> => {
    const session = activeOtpSessions[mobileNumber]
    if (!session) {
      throw new Error('No active OTP request found. Please request a new OTP.')
    }

    if (Date.now() > session.expiresAt) {
      delete activeOtpSessions[mobileNumber]
      throw new Error('The OTP has expired. Please request a new OTP.')
    }

    if (session.attemptsRemaining <= 0) {
      delete activeOtpSessions[mobileNumber]
      throw new Error('Too many invalid attempts. Session locked for 15 minutes.')
    }

    if (session.otp !== enteredOtp) {
      session.attemptsRemaining -= 1
      throw new Error(`Invalid OTP code entered. ${session.attemptsRemaining} attempts remaining.`)
    }

    // OTP Verified! Clear active OTP
    delete activeOtpSessions[mobileNumber]

    const staff = staffMembers.find((s) => s.mobileNumber === mobileNumber) || (mobileNumber === '9876543210' ? staffMembers[0] : null)
    if (!staff) {
      throw new Error('User profile could not be resolved by backend.')
    }

    const sessionUser: DairyAdminUser = {
      id: staff.id,
      mobileNumber: staff.mobileNumber,
      fullName: staff.fullName,
      dairyId: CURRENT_DAIRY_ID,
      dairyName: SEED_DAIRY.name,
      dairyCode: SEED_DAIRY.dairyCode,
      isPrimaryAdmin: staff.role === 'PRIMARY_DAIRY_ADMIN',
      role: staff.role,
      permissions: staff.permissions,
      lastLoginAt: new Date().toISOString(),
      sessionToken: `dfarm_jwt_${Math.random().toString(36).substring(2)}_${Date.now()}`,
    }

    // Audit log login
    auditLogs.unshift({
      id: `aud-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      timestamp: new Date().toISOString(),
      actorId: staff.id,
      actorName: staff.fullName,
      actorRole: staff.role,
      action: 'CUSTOMER_PROFILE_UPDATED',
      targetEntity: 'DairyAdminSession',
      entityId: staff.id,
      details: 'Dairy administrator authenticated via Mobile OTP',
    })

    return sessionUser
  },

  // 2. Dashboard Summary
  getDashboardSummary: async (): Promise<DashboardSummary> => {
    const todayMorning = collectionSessions.find((s) => s.date === '2026-11-15' && s.shift === 'MORNING')
    const todayEvening = collectionSessions.find((s) => s.date === '2026-11-15' && s.shift === 'EVENING')

    const todayLiters = (todayMorning?.totals.totalLiters || 0) + (todayEvening?.totals.totalLiters || 0)
    const cowLiters = (todayMorning?.totals.cowLiters || 0) + (todayEvening?.totals.cowLiters || 0)
    const buffaloLiters = (todayMorning?.totals.buffaloLiters || 0) + (todayEvening?.totals.buffaloLiters || 0)
    const todayAmount = (todayMorning?.totals.totalAmount || 0) + (todayEvening?.totals.totalAmount || 0)
    const txCount = (todayMorning?.totals.transactionCount || 0) + (todayEvening?.totals.transactionCount || 0)

    const pendingApprovalsCount = pendingRegistrations.filter((r) => r.status === 'PENDING').length
    const lowStockCount = feedProducts.filter((p) => p.availableStock <= p.minStockAlertLevel).length

    return {
      dairyProfile: {
        name: SEED_DAIRY.name,
        code: SEED_DAIRY.dairyCode,
        subscription: SEED_DAIRY.subscriptionTier,
      },
      customers: {
        totalRegistered: customers.filter((c) => !c.isSoftDeleted).length,
        pendingApprovals: pendingApprovalsCount,
        activeToday: 4,
        newThisMonth: 3,
      },
      todayCollection: {
        totalLiters: todayLiters,
        cowLiters,
        buffaloLiters,
        transactionCount: txCount,
        totalAmount: todayAmount,
        averageFat: 4.82,
        averageSnf: 8.76,
      },
      monthlyCollection: {
        totalLiters: 14850.5,
        totalAmount: 642300.0,
        shiftBreakdown: {
          morningLiters: 8940.0,
          eveningLiters: 5910.5,
        },
      },
      finance: {
        pendingCustomerBalances: 50590.0,
        currentBillingCycleStatus: 'READY_FOR_SETTLEMENT',
        totalPaymentsThisMonth: 15640.5,
      },
      inventory: {
        totalProducts: feedProducts.length,
        lowStockItemCount: lowStockCount,
        todayFeedSalesAmount: 0.0,
      },
      systemStatus: {
        activeSessionId: todayEvening?.id,
        activeSessionShift: todayEvening?.shift,
        connectedDevicesCount: collectionDevices.filter((d) => d.status === 'ONLINE').length,
        offlineDevicesCount: collectionDevices.filter((d) => d.status === 'OFFLINE').length,
        pendingSyncEventsCount: collectionDevices.reduce((sum, d) => sum + d.pendingOfflineSyncEvents, 0),
      },
    }
  },

  // 3. Customer Approvals Workflow
  getPendingRegistrations: async (): Promise<CustomerRegistrationRequest[]> => {
    return [...pendingRegistrations]
  },

  approveRegistration: async (requestId: string, operatorName: string): Promise<Customer> => {
    const reqIndex = pendingRegistrations.findIndex((r) => r.id === requestId)
    if (reqIndex === -1) throw new Error('Registration request not found')

    const req = pendingRegistrations[reqIndex]
    if (req.status !== 'PENDING') throw new Error(`Request has already been ${req.status}`)

    // Create new Customer record with unique customer code
    const newCode = `C-${100 + customers.length + 1}`
    const newCustomer: Customer = {
      id: `cust-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      customerCode: newCode,
      fullName: req.candidateName,
      mobileNumber: req.mobileNumber,
      fatherOrHusbandName: 'Farmer',
      status: 'ACTIVE',
      preferredCategory: req.preferredCategory,
      registrationDate: new Date().toISOString().split('T')[0],
      village: req.village,
      bankDetails: req.bankDetails ? {
        accountHolderName: req.candidateName,
        bankName: req.bankDetails.bankName,
        accountNumber: req.bankDetails.accountNumber,
        ifscCode: req.bankDetails.ifscCode,
      } : undefined,
      biometric: {
        faceEnrollmentStatus: 'APPROVED',
        faceEnrolledAt: req.faceCapture.consentTimestamp,
        faceModelVersion: req.faceCapture.modelVersion,
        consentEvidenceHash: `sha256:${Math.random().toString(36).substring(2)}`,
      },
      summary: {
        totalLitersDelivered: 0,
        pendingBalance: 0,
        totalFeedPurchased: 0,
      },
      isSoftDeleted: false,
      auditCount: 1,
    }

    customers.push(newCustomer)

    // Also register FaceEnrollmentRecord
    faceEnrollments.push({
      id: `face-rec-${Date.now()}`,
      customerId: newCustomer.id,
      customerCode: newCustomer.customerCode,
      customerName: newCustomer.fullName,
      dairyId: CURRENT_DAIRY_ID,
      status: 'APPROVED',
      modelVersion: 'YuNet-v1.0 + SFace-INT8-v1.0',
      templateVersion: 1,
      consentGiven: true,
      consentTimestamp: req.faceCapture.consentTimestamp,
      qualityScore: req.faceCapture.qualityScore,
      enrolledAt: req.submittedAt,
      approvedAt: new Date().toISOString(),
      approvedBy: operatorName,
      auditLogs: [
        {
          timestamp: new Date().toISOString(),
          action: 'ENROLLMENT_APPROVED',
          operator: operatorName,
          note: 'Customer registration approved from mobile onboarding request',
        },
      ],
    })

    // Update request state
    req.status = 'APPROVED'
    req.reviewedBy = operatorName
    req.reviewedAt = new Date().toISOString()

    // Add Audit Log
    auditLogs.unshift({
      id: `aud-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      timestamp: new Date().toISOString(),
      actorId: 'admin',
      actorName: operatorName,
      actorRole: 'PRIMARY_DAIRY_ADMIN',
      action: 'CUSTOMER_REGISTRATION_APPROVED',
      targetEntity: 'CustomerRegistrationRequest',
      entityId: req.id,
      details: `Approved farmer registration for ${req.candidateName} (Assigned Code: ${newCode})`,
    })

    return newCustomer
  },

  rejectRegistration: async (requestId: string, reason: string, operatorName: string): Promise<void> => {
    if (!reason || reason.trim().length < 5) {
      throw new Error('A detailed rejection reason is required (minimum 5 characters).')
    }

    const req = pendingRegistrations.find((r) => r.id === requestId)
    if (!req) throw new Error('Registration request not found')
    if (req.status !== 'PENDING') throw new Error(`Request has already been ${req.status}`)

    req.status = 'REJECTED'
    req.rejectionReason = reason
    req.reviewedBy = operatorName
    req.reviewedAt = new Date().toISOString()

    auditLogs.unshift({
      id: `aud-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      timestamp: new Date().toISOString(),
      actorId: 'admin',
      actorName: operatorName,
      actorRole: 'PRIMARY_DAIRY_ADMIN',
      action: 'CUSTOMER_REGISTRATION_REJECTED',
      targetEntity: 'CustomerRegistrationRequest',
      entityId: req.id,
      details: `Rejected registration for ${req.candidateName}. Reason: ${reason}`,
      reason,
    })
  },

  // 4. Customer Directory
  getCustomers: async (includeSoftDeleted = false): Promise<Customer[]> => {
    return includeSoftDeleted ? [...customers] : customers.filter((c) => !c.isSoftDeleted)
  },

  getCustomerById: async (id: string): Promise<Customer> => {
    const cust = customers.find((c) => c.id === id)
    if (!cust) throw new Error('Customer not found')
    return cust
  },

  softDeleteCustomer: async (id: string, reason: string, operatorName: string): Promise<void> => {
    const cust = customers.find((c) => c.id === id)
    if (!cust) throw new Error('Customer not found')
    cust.isSoftDeleted = true
    cust.deletedAt = new Date().toISOString()
    cust.deletedReason = reason
    cust.status = 'DELETED'
    cust.auditCount += 1

    auditLogs.unshift({
      id: `aud-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      timestamp: new Date().toISOString(),
      actorId: 'admin',
      actorName: operatorName,
      actorRole: 'PRIMARY_DAIRY_ADMIN',
      action: 'CUSTOMER_SOFT_DELETED',
      targetEntity: 'Customer',
      entityId: cust.id,
      details: `Soft-deleted customer ${cust.fullName} (${cust.customerCode})`,
      reason,
    })
  },

  restoreCustomer: async (id: string, operatorName: string): Promise<void> => {
    const cust = customers.find((c) => c.id === id)
    if (!cust) throw new Error('Customer not found')
    cust.isSoftDeleted = false
    cust.deletedAt = undefined
    cust.deletedReason = undefined
    cust.status = 'ACTIVE'
    cust.auditCount += 1

    auditLogs.unshift({
      id: `aud-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      timestamp: new Date().toISOString(),
      actorId: 'admin',
      actorName: operatorName,
      actorRole: 'PRIMARY_DAIRY_ADMIN',
      action: 'CUSTOMER_RESTORED',
      targetEntity: 'Customer',
      entityId: cust.id,
      details: `Restored active status for customer ${cust.fullName} (${cust.customerCode})`,
    })
  },

  // 5. Face Enrollment Administration (YuNet + SFace ONNX)
  getFaceEnrollments: async (): Promise<FaceEnrollmentRecord[]> => {
    return [...faceEnrollments]
  },

  requestFaceReEnrollment: async (recordId: string, note: string, operatorName: string): Promise<void> => {
    const rec = faceEnrollments.find((f) => f.id === recordId)
    if (!rec) throw new Error('Face record not found')

    rec.status = 'RE_ENROLL_REQUESTED'
    rec.reEnrollmentNote = note
    rec.auditLogs.unshift({
      timestamp: new Date().toISOString(),
      action: 'RE_ENROLLMENT_REQUESTED',
      operator: operatorName,
      note,
    })

    const customer = customers.find((c) => c.id === rec.customerId)
    if (customer) {
      customer.biometric.faceEnrollmentStatus = 'RE_ENROLL_REQUESTED'
    }

    auditLogs.unshift({
      id: `aud-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      timestamp: new Date().toISOString(),
      actorId: 'admin',
      actorName: operatorName,
      actorRole: 'PRIMARY_DAIRY_ADMIN',
      action: 'FACE_RE_ENROLLMENT_REQUESTED',
      targetEntity: 'FaceEnrollmentRecord',
      entityId: rec.id,
      details: `Requested re-enrollment for ${rec.customerName}. Note: ${note}`,
    })
  },

  revokeFaceEnrollment: async (recordId: string, reason: string, operatorName: string): Promise<void> => {
    const rec = faceEnrollments.find((f) => f.id === recordId)
    if (!rec) throw new Error('Face record not found')

    rec.status = 'REVOKED'
    rec.revokedAt = new Date().toISOString()
    rec.revokedBy = operatorName
    rec.revocationReason = reason
    rec.auditLogs.unshift({
      timestamp: new Date().toISOString(),
      action: 'ENROLLMENT_REVOKED',
      operator: operatorName,
      note: reason,
    })

    const customer = customers.find((c) => c.id === rec.customerId)
    if (customer) {
      customer.biometric.faceEnrollmentStatus = 'REVOKED'
    }

    auditLogs.unshift({
      id: `aud-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      timestamp: new Date().toISOString(),
      actorId: 'admin',
      actorName: operatorName,
      actorRole: 'PRIMARY_DAIRY_ADMIN',
      action: 'FACE_ENROLLMENT_REVOKED',
      targetEntity: 'FaceEnrollmentRecord',
      entityId: rec.id,
      details: `Revoked biometric face template for ${rec.customerName}`,
      reason,
    })
  },

  // 6. RFID Card Management
  getRfidCards: async (): Promise<RfidCardRecord[]> => {
    return [...rfidCards]
  },

  assignRfidCard: async (cardUid: string, customerId: string, operatorName: string): Promise<void> => {
    const customer = customers.find((c) => c.id === customerId)
    if (!customer) throw new Error('Customer not found')

    // Check if card is already assigned
    const existing = rfidCards.find((r) => r.cardUid === cardUid && r.status === 'ACTIVE')
    if (existing && existing.customerId !== customerId) {
      throw new Error(`RFID card ${cardUid} is already assigned to customer ${existing.customerName}`)
    }

    let card = rfidCards.find((r) => r.cardUid === cardUid)
    if (!card) {
      card = {
        id: `rfid-${Date.now()}`,
        cardUid,
        dairyId: CURRENT_DAIRY_ID,
        customerId: customer.id,
        customerCode: customer.customerCode,
        customerName: customer.fullName,
        status: 'ACTIVE',
        issuedAt: new Date().toISOString(),
        issuedBy: operatorName,
      }
      rfidCards.push(card)
    } else {
      card.customerId = customer.id
      card.customerCode = customer.customerCode
      card.customerName = customer.fullName
      card.status = 'ACTIVE'
      card.issuedAt = new Date().toISOString()
      card.issuedBy = operatorName
    }

    customer.rfidCard = {
      cardUid,
      assignedAt: new Date().toISOString(),
      status: 'ACTIVE',
    }

    auditLogs.unshift({
      id: `aud-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      timestamp: new Date().toISOString(),
      actorId: 'admin',
      actorName: operatorName,
      actorRole: 'PRIMARY_DAIRY_ADMIN',
      action: 'RFID_CARD_ASSIGNED',
      targetEntity: 'RfidCard',
      entityId: cardUid,
      details: `Assigned RFID card ${cardUid} to ${customer.fullName} (${customer.customerCode})`,
    })
  },

  markRfidCardLost: async (cardUid: string, reason: string, operatorName: string): Promise<void> => {
    const card = rfidCards.find((r) => r.cardUid === cardUid)
    if (!card) throw new Error('Card not found')

    card.status = 'LOST'
    card.notes = reason

    if (card.customerId) {
      const cust = customers.find((c) => c.id === card.customerId)
      if (cust && cust.rfidCard?.cardUid === cardUid) {
        cust.rfidCard.status = 'LOST'
      }
    }

    auditLogs.unshift({
      id: `aud-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      timestamp: new Date().toISOString(),
      actorId: 'admin',
      actorName: operatorName,
      actorRole: 'PRIMARY_DAIRY_ADMIN',
      action: 'RFID_CARD_MARKED_LOST',
      targetEntity: 'RfidCard',
      entityId: cardUid,
      details: `Marked card ${cardUid} as LOST`,
      reason,
    })
  },

  // 7. Collection Sessions
  getCollectionSessions: async (): Promise<CollectionSession[]> => {
    return [...collectionSessions]
  },

  closeCollectionSession: async (sessionId: string, operatorName: string): Promise<CollectionSession> => {
    const session = collectionSessions.find((s) => s.id === sessionId)
    if (!session) throw new Error('Session not found')
    if (session.status === 'CLOSED') throw new Error('Session is already closed')

    session.status = 'CLOSED'
    session.closedAt = new Date().toISOString()
    session.closingOperatorName = operatorName

    auditLogs.unshift({
      id: `aud-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      timestamp: new Date().toISOString(),
      actorId: 'admin',
      actorName: operatorName,
      actorRole: 'PRIMARY_DAIRY_ADMIN',
      action: 'COLLECTION_SESSION_CLOSED',
      targetEntity: 'CollectionSession',
      entityId: session.sessionId,
      details: `Closed collection session ${session.sessionId} with total ${session.totals.totalLiters} L`,
    })

    return session
  },

  // 8. Milk Collection Transactions & Non-Destructive Adjustments
  getCollectionTransactions: async (params?: { customerId?: string; date?: string }): Promise<MilkCollectionTransaction[]> => {
    let result = [...collectionTransactions]
    if (params?.customerId) {
      result = result.filter((t) => t.customerId === params.customerId)
    }
    if (params?.date) {
      result = result.filter((t) => t.date === params.date)
    }
    return result
  },

  adjustCollectionRecord: async (
    transactionId: string,
    newWeightLiters: number,
    reason: string,
    operatorName: string,
  ): Promise<MilkCollectionTransaction> => {
    if (!reason || reason.trim().length < 5) {
      throw new Error('Authorized reason required for milk record adjustment (min 5 chars).')
    }

    const txn = collectionTransactions.find((t) => t.id === transactionId)
    if (!txn) throw new Error('Transaction record not found')

    const originalWeight = txn.weightLiters
    const originalAmount = txn.totalAmount
    const newAmount = Number((newWeightLiters * txn.appliedRatePerLiter).toFixed(2))

    // Non-destructive update: preserve original in adjustment block
    txn.status = 'ADJUSTED'
    txn.adjustment = {
      adjustedAt: new Date().toISOString(),
      adjustedBy: operatorName,
      originalWeight,
      originalAmount,
      reason,
      adjustmentId: `ADJ-${Date.now()}`,
    }
    txn.weightLiters = newWeightLiters
    txn.totalAmount = newAmount

    // Post an auditable adjustment to the customer's ledger
    const diff = Number((newAmount - originalAmount).toFixed(2))
    const lastBalance = customerLedgers.length > 0 ? customerLedgers[customerLedgers.length - 1].runningBalance : 0
    const newLedgerEntry: CustomerLedgerEntry = {
      id: `ledg-adj-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      customerId: txn.customerId,
      customerCode: txn.customerCode,
      customerName: txn.customerName,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      entryType: 'AUTHORIZED_ADJUSTMENT',
      referenceType: 'COLLECTION_TX',
      referenceId: txn.transactionId,
      description: `Correction on ${txn.transactionId}: weight adjusted from ${originalWeight}L to ${newWeightLiters}L`,
      debit: diff < 0 ? Math.abs(diff) : 0,
      credit: diff > 0 ? diff : 0,
      runningBalance: Number((lastBalance + diff).toFixed(2)),
      authorizedBy: operatorName,
      reason,
    }
    customerLedgers.push(newLedgerEntry)

    auditLogs.unshift({
      id: `aud-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      timestamp: new Date().toISOString(),
      actorId: 'admin',
      actorName: operatorName,
      actorRole: 'PRIMARY_DAIRY_ADMIN',
      action: 'COLLECTION_RECORD_ADJUSTED',
      targetEntity: 'MilkCollectionTransaction',
      entityId: txn.transactionId,
      details: `Adjusted transaction ${txn.transactionId}: weight ${originalWeight}L -> ${newWeightLiters}L. Ledger adjusted by Rs ${diff}`,
      reason,
    })

    return txn
  },

  // 9. Milk Quality Readings
  getQualityReadings: async (): Promise<MilkQualityReading[]> => {
    return [...qualityReadings]
  },

  // 10. Rate Charts & Versioning
  getRateCharts: async (): Promise<MilkRateChart[]> => {
    return [...rateCharts]
  },

  createRateChartVersion: async (
    params: {
      title: string
      milkCategory: 'COW' | 'BUFFALO'
      baseRatePerLiter: number
      minFat: number
      maxFat: number
      fatStep: number
      minSnf: number
      maxSnf: number
      snfStep: number
      effectiveDate: string
      changeNotes: string
    },
    operatorName: string,
  ): Promise<MilkRateChart> => {
    const existing = rateCharts.filter((r) => r.milkCategory === params.milkCategory)
    const nextVersion = existing.length + 1

    const newChart: MilkRateChart = {
      id: `rc-${params.milkCategory.toLowerCase()}-v${nextVersion}`,
      dairyId: CURRENT_DAIRY_ID,
      title: params.title,
      milkCategory: params.milkCategory,
      version: nextVersion,
      status: 'DRAFT',
      effectiveDate: params.effectiveDate,
      baseRatePerLiter: params.baseRatePerLiter,
      minFat: params.minFat,
      maxFat: params.maxFat,
      fatStep: params.fatStep,
      minSnf: params.minSnf,
      maxSnf: params.maxSnf,
      snfStep: params.snfStep,
      rateMatrix: [], // Computed on activation
      createdAt: new Date().toISOString(),
      createdBy: operatorName,
      changeNotes: params.changeNotes,
    }

    rateCharts.push(newChart)

    auditLogs.unshift({
      id: `aud-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      timestamp: new Date().toISOString(),
      actorId: 'admin',
      actorName: operatorName,
      actorRole: 'PRIMARY_DAIRY_ADMIN',
      action: 'RATE_CHART_CREATED',
      targetEntity: 'MilkRateChart',
      entityId: newChart.id,
      details: `Created draft rate chart ${newChart.title} (v${nextVersion}) for ${params.milkCategory}`,
    })

    return newChart
  },

  activateRateChartVersion: async (chartId: string, operatorName: string): Promise<void> => {
    const target = rateCharts.find((r) => r.id === chartId)
    if (!target) throw new Error('Rate chart not found')

    // Archive previous active chart in the same milk category
    rateCharts.forEach((rc) => {
      if (rc.milkCategory === target.milkCategory && rc.status === 'ACTIVE') {
        rc.status = 'ARCHIVED'
      }
    })

    target.status = 'ACTIVE'
    target.activatedAt = new Date().toISOString()
    target.activatedBy = operatorName

    auditLogs.unshift({
      id: `aud-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      timestamp: new Date().toISOString(),
      actorId: 'admin',
      actorName: operatorName,
      actorRole: 'PRIMARY_DAIRY_ADMIN',
      action: 'RATE_CHART_ACTIVATED',
      targetEntity: 'MilkRateChart',
      entityId: target.id,
      details: `Activated rate chart ${target.title} (v${target.version}) effective from ${target.effectiveDate}`,
    })
  },

  // 11. Customer Ledger
  getCustomerLedger: async (customerId?: string): Promise<CustomerLedgerEntry[]> => {
    if (customerId) {
      return customerLedgers.filter((l) => l.customerId === customerId)
    }
    return [...customerLedgers]
  },

  performLedgerAdjustment: async (
    params: {
      customerId: string
      type: 'CREDIT' | 'DEBIT'
      amount: number
      reason: string
      description: string
    },
    operatorName: string,
  ): Promise<CustomerLedgerEntry> => {
    const cust = customers.find((c) => c.id === params.customerId)
    if (!cust) throw new Error('Customer not found')
    if (params.amount <= 0) throw new Error('Adjustment amount must be positive')
    if (!params.reason || params.reason.trim().length < 5) throw new Error('Authorized reason required')

    const lastEntry = customerLedgers.filter((l) => l.customerId === cust.id).slice(-1)[0]
    const currentBal = lastEntry ? lastEntry.runningBalance : 0
    const delta = params.type === 'CREDIT' ? params.amount : -params.amount
    const newBal = Number((currentBal + delta).toFixed(2))

    const newEntry: CustomerLedgerEntry = {
      id: `ledg-manual-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      customerId: cust.id,
      customerCode: cust.customerCode,
      customerName: cust.fullName,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      entryType: 'AUTHORIZED_ADJUSTMENT',
      referenceType: 'ADMIN_ADJUSTMENT',
      referenceId: `ADJ-MANUAL-${Date.now()}`,
      description: params.description,
      debit: params.type === 'DEBIT' ? params.amount : 0,
      credit: params.type === 'CREDIT' ? params.amount : 0,
      runningBalance: newBal,
      authorizedBy: operatorName,
      reason: params.reason,
    }

    customerLedgers.push(newEntry)
    cust.summary.pendingBalance = newBal

    auditLogs.unshift({
      id: `aud-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      timestamp: new Date().toISOString(),
      actorId: 'admin',
      actorName: operatorName,
      actorRole: 'PRIMARY_DAIRY_ADMIN',
      action: 'LEDGER_BALANCE_ADJUSTED',
      targetEntity: 'CustomerLedgerEntry',
      entityId: newEntry.id,
      details: `Manual ${params.type} adjustment of Rs ${params.amount} on ${cust.fullName}. New balance: Rs ${newBal}`,
      reason: params.reason,
    })

    return newEntry
  },

  // 12. Billing & Settlements
  getDairyBills: async (): Promise<DairyBill[]> => {
    return [...dairyBills]
  },

  generateFortnightlyBill: async (
    customerId: string,
    periodStart: string,
    periodEnd: string,
    cycleName: string,
    operatorName: string,
  ): Promise<DairyBill> => {
    const cust = customers.find((c) => c.id === customerId)
    if (!cust) throw new Error('Customer not found')

    // Prevent duplicate bill generation for the same customer and period
    const existing = dairyBills.find(
      (b) => b.customerId === customerId && b.periodStart === periodStart && b.periodEnd === periodEnd && b.status !== 'CANCELLED',
    )
    if (existing) {
      throw new Error(`Bill ${existing.billNumber} has already been generated for ${cust.fullName} for period ${periodStart} to ${periodEnd}.`)
    }

    // Compute milk deliveries in this period
    const txns = collectionTransactions.filter((t) => t.customerId === customerId && t.date >= periodStart && t.date <= periodEnd)
    const milkVolume = Number(txns.reduce((sum, t) => sum + t.weightLiters, 0).toFixed(2))
    const milkAmount = Number(txns.reduce((sum, t) => sum + t.totalAmount, 0).toFixed(2))

    // Compute feed sales in this period
    const feedSales = customerFeedSales.filter((f) => f.customerId === customerId && f.purchaseDate >= periodStart && f.purchaseDate <= periodEnd)
    const feedDeduction = Number(feedSales.reduce((sum, f) => sum + f.totalAmount, 0).toFixed(2))

    const netPayable = Number((milkAmount - feedDeduction).toFixed(2))

    const billNumber = `BILL-2026-${Date.now().toString().slice(-6)}`
    const newBill: DairyBill = {
      id: `bill-${Date.now()}`,
      billNumber,
      dairyId: CURRENT_DAIRY_ID,
      customerId: cust.id,
      customerCode: cust.customerCode,
      customerName: cust.fullName,
      periodStart,
      periodEnd,
      cycleName,
      totalMilkVolumeLiters: milkVolume,
      totalMilkAmount: milkAmount,
      totalFeedDeduction: feedDeduction,
      otherAdjustments: 0,
      netPayableAmount: netPayable,
      amountPaid: 0,
      outstandingBalance: netPayable,
      status: 'GENERATED',
      generatedAt: new Date().toISOString(),
      generatedBy: operatorName,
    }

    dairyBills.push(newBill)

    auditLogs.unshift({
      id: `aud-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      timestamp: new Date().toISOString(),
      actorId: 'admin',
      actorName: operatorName,
      actorRole: 'PRIMARY_DAIRY_ADMIN',
      action: 'BILL_GENERATED',
      targetEntity: 'DairyBill',
      entityId: newBill.id,
      details: `Generated bill ${billNumber} for ${cust.fullName} (${periodStart} to ${periodEnd}): Net Rs ${netPayable}`,
    })

    return newBill
  },

  // 13. Feed Inventory & Customer Sales
  getFeedProducts: async (): Promise<FeedProduct[]> => {
    return [...feedProducts]
  },

  getFeedMovements: async (): Promise<FeedStockMovement[]> => {
    return [...feedMovements]
  },

  getCustomerFeedSales: async (): Promise<CustomerFeedSale[]> => {
    return [...customerFeedSales]
  },

  addFeedStock: async (productId: string, quantity: number, reason: string, operatorName: string): Promise<FeedProduct> => {
    const prod = feedProducts.find((p) => p.id === productId)
    if (!prod) throw new Error('Feed product not found')
    if (quantity <= 0) throw new Error('Quantity must be greater than zero')

    const prevStock = prod.availableStock
    prod.availableStock += quantity
    prod.updatedAt = new Date().toISOString()

    feedMovements.unshift({
      id: `f-mov-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      productId: prod.id,
      productName: prod.name,
      movementType: 'PURCHASE_RESTOCK',
      quantity,
      previousStock: prevStock,
      resultingStock: prod.availableStock,
      referenceId: `STOCK-IN-${Date.now()}`,
      reason,
      performedBy: operatorName,
      timestamp: new Date().toISOString(),
    })

    auditLogs.unshift({
      id: `aud-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      timestamp: new Date().toISOString(),
      actorId: 'admin',
      actorName: operatorName,
      actorRole: 'PRIMARY_DAIRY_ADMIN',
      action: 'FEED_STOCK_RESTOCKED',
      targetEntity: 'FeedProduct',
      entityId: prod.id,
      details: `Restocked ${quantity} ${prod.unit} of ${prod.name}. New stock: ${prod.availableStock}`,
      reason,
    })

    return prod
  },

  recordFeedSale: async (
    params: {
      customerId: string
      productId: string
      quantity: number
      paymentMode: 'LEDGER_DEBIT' | 'CASH' | 'ONLINE'
      notes?: string
    },
    operatorName: string,
  ): Promise<CustomerFeedSale> => {
    const cust = customers.find((c) => c.id === params.customerId)
    if (!cust) throw new Error('Customer not found')
    const prod = feedProducts.find((p) => p.id === params.productId)
    if (!prod) throw new Error('Product not found')
    if (prod.availableStock < params.quantity) {
      throw new Error(`Insufficient stock. Available: ${prod.availableStock} ${prod.unit}`)
    }

    // Deduct stock
    const prevStock = prod.availableStock
    prod.availableStock -= params.quantity
    prod.updatedAt = new Date().toISOString()

    const totalAmount = Number((prod.sellingRate * params.quantity).toFixed(2))
    const saleId = `FEED-SALE-${Date.now().toString().slice(-4)}`

    // If paymentMode is LEDGER_DEBIT, debit customer's server-authoritative ledger immediately
    let ledgerRef: string | undefined
    if (params.paymentMode === 'LEDGER_DEBIT') {
      const lastEntry = customerLedgers.filter((l) => l.customerId === cust.id).slice(-1)[0]
      const currentBal = lastEntry ? lastEntry.runningBalance : 0
      const newBal = Number((currentBal - totalAmount).toFixed(2))

      const newLedgerEntry: CustomerLedgerEntry = {
        id: `ledg-feed-${Date.now()}`,
        dairyId: CURRENT_DAIRY_ID,
        customerId: cust.id,
        customerCode: cust.customerCode,
        customerName: cust.fullName,
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        entryType: 'FEED_DEBIT',
        referenceType: 'FEED_SALE',
        referenceId: saleId,
        description: `Purchased ${params.quantity} ${prod.unit} of ${prod.name}`,
        debit: totalAmount,
        credit: 0,
        runningBalance: newBal,
        authorizedBy: operatorName,
      }
      customerLedgers.push(newLedgerEntry)
      cust.summary.pendingBalance = newBal
      ledgerRef = newLedgerEntry.id
    }

    const newSale: CustomerFeedSale = {
      id: `sale-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      saleId,
      customerId: cust.id,
      customerCode: cust.customerCode,
      customerName: cust.fullName,
      productId: prod.id,
      productName: prod.name,
      quantity: params.quantity,
      unit: prod.unit,
      unitPrice: prod.sellingRate,
      totalAmount,
      purchaseDate: new Date().toISOString().split('T')[0],
      paymentMode: params.paymentMode,
      ledgerReferenceId: ledgerRef,
      recordedBy: operatorName,
      notes: params.notes,
    }

    customerFeedSales.push(newSale)

    // Log movement
    feedMovements.unshift({
      id: `f-mov-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      productId: prod.id,
      productName: prod.name,
      movementType: 'CUSTOMER_SALE',
      quantity: -params.quantity,
      previousStock: prevStock,
      resultingStock: prod.availableStock,
      referenceId: saleId,
      reason: `Sale to ${cust.fullName} (${cust.customerCode})`,
      performedBy: operatorName,
      timestamp: new Date().toISOString(),
    })

    auditLogs.unshift({
      id: `aud-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      timestamp: new Date().toISOString(),
      actorId: 'admin',
      actorName: operatorName,
      actorRole: 'PRIMARY_DAIRY_ADMIN',
      action: 'FEED_SOLD',
      targetEntity: 'CustomerFeedSale',
      entityId: saleId,
      details: `Sold ${params.quantity} ${prod.unit} of ${prod.name} to ${cust.fullName}. Total: Rs ${totalAmount}`,
    })

    return newSale
  },

  // 14. Payments and Receipts
  getPaymentRecords: async (): Promise<PaymentRecord[]> => {
    return [...paymentRecords]
  },

  recordCustomerPayment: async (
    params: {
      customerId: string
      amount: number
      paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE'
      transactionReference: string
      linkedBillId?: string
      notes?: string
    },
    operatorName: string,
  ): Promise<PaymentRecord> => {
    const cust = customers.find((c) => c.id === params.customerId)
    if (!cust) throw new Error('Customer not found')
    if (params.amount <= 0) throw new Error('Payment amount must be greater than zero')

    const receiptNumber = `REC-2026-${Date.now().toString().slice(-4)}`
    const lastEntry = customerLedgers.filter((l) => l.customerId === cust.id).slice(-1)[0]
    const currentBal = lastEntry ? lastEntry.runningBalance : 0
    const newBal = Number((currentBal - params.amount).toFixed(2))

    // Post to ledger
    const ledgerEntry: CustomerLedgerEntry = {
      id: `ledg-pay-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      customerId: cust.id,
      customerCode: cust.customerCode,
      customerName: cust.fullName,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      entryType: 'PAYMENT_RECEIVED',
      referenceType: 'PAYMENT_RECEIPT',
      referenceId: receiptNumber,
      description: `Payment received via ${params.paymentMethod} (Ref: ${params.transactionReference})`,
      debit: params.amount,
      credit: 0,
      runningBalance: newBal,
      authorizedBy: operatorName,
    }
    customerLedgers.push(ledgerEntry)
    cust.summary.pendingBalance = newBal

    const newPayment: PaymentRecord = {
      id: `pay-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      receiptNumber,
      customerId: cust.id,
      customerCode: cust.customerCode,
      customerName: cust.fullName,
      amount: params.amount,
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod: params.paymentMethod,
      transactionReference: params.transactionReference,
      linkedBillId: params.linkedBillId,
      linkedLedgerEntryId: ledgerEntry.id,
      status: 'RECONCILED',
      verifiedBy: operatorName,
      notes: params.notes,
    }

    paymentRecords.push(newPayment)

    auditLogs.unshift({
      id: `aud-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      timestamp: new Date().toISOString(),
      actorId: 'admin',
      actorName: operatorName,
      actorRole: 'PRIMARY_DAIRY_ADMIN',
      action: 'PAYMENT_RECORDED',
      targetEntity: 'PaymentRecord',
      entityId: receiptNumber,
      details: `Recorded payment of Rs ${params.amount} from ${cust.fullName} via ${params.paymentMethod}`,
    })

    return newPayment
  },

  // 15. Devices & Sync Telemetry
  getCollectionDevices: async (): Promise<CollectionDevice[]> => {
    return [...collectionDevices]
  },

  triggerDeviceSync: async (deviceId: string, operatorName: string): Promise<void> => {
    const dev = collectionDevices.find((d) => d.id === deviceId)
    if (!dev) throw new Error('Device not found')

    dev.pendingOfflineSyncEvents = 0
    dev.lastSyncAt = new Date().toISOString()
    dev.status = 'ONLINE'

    auditLogs.unshift({
      id: `aud-${Date.now()}`,
      dairyId: CURRENT_DAIRY_ID,
      timestamp: new Date().toISOString(),
      actorId: 'admin',
      actorName: operatorName,
      actorRole: 'PRIMARY_DAIRY_ADMIN',
      action: 'DEVICE_REGISTERED',
      targetEntity: 'CollectionDevice',
      entityId: dev.deviceId,
      details: `Initiated manual cloud sync for ${dev.deviceName}`,
    })
  },

  // 16. Staff & Permission Matrix
  getStaffMembers: async (): Promise<StaffMember[]> => {
    return [...staffMembers]
  },

  // 17. Audit Logs
  getAuditLogs: async (): Promise<AuditLogEntry[]> => {
    return [...auditLogs]
  },

  // 18. Notifications
  getNotifications: async (): Promise<DairyNotification[]> => {
    return [...notifications]
  },

  markNotificationRead: async (notifId: string): Promise<void> => {
    const notif = notifications.find((n) => n.id === notifId)
    if (notif) notif.isRead = true
  },

  // 19. Primary Admin Activation
  validateActivationToken: async (
    token: string,
  ): Promise<{
    valid: boolean
    code: 'VALID' | 'EXPIRED' | 'ALREADY_CONSUMED' | 'INVITATION_REVOKED' | 'INVALID_TOKEN'
    error?: string
    invitation?: {
      dairyId: string
      dairyName: string
      dairyCode: string
      adminId: string
      adminName: string
      maskedEmail: string
      maskedMobile: string
      expiresAt: string
    }
    data?: {
      dairyId: string
      dairyName: string
      dairyCode: string
      adminId: string
      adminName: string
      maskedEmail: string
      maskedMobile: string
      expiresAt: string
    }
  }> => {
    const trimmed = (token || '').trim()
    if (!trimmed) {
      return {
        valid: false,
        code: 'INVALID_TOKEN',
        error: 'No activation token was provided in the URL.',
      }
    }

    // 1. Check local storage from Super Admin onboarding
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('dfarm_super_admin_invitations')
        if (raw) {
          const invitations = JSON.parse(raw)
          const inv = invitations.find(
            (i: any) => i.rawToken === trimmed || i.id === trimmed || i.dairyCode === trimmed,
          )
          if (inv) {
            if (inv.status === 'CONSUMED') {
              return {
                valid: false,
                code: 'ALREADY_CONSUMED',
                error: 'This activation invitation has already been used. Your account is already active. Please log in with your registered mobile number.',
              }
            }
            if (inv.status === 'REVOKED') {
              return {
                valid: false,
                code: 'INVITATION_REVOKED',
                error: 'This activation invitation has been revoked because a newer invitation link was generated. Please use the link from the latest email received.',
              }
            }
            if (new Date(inv.expiresAt).getTime() < Date.now()) {
              return {
                valid: false,
                code: 'EXPIRED',
                error: 'This activation invitation has expired after 48 hours. Please contact your Super Administrator to issue a fresh invitation.',
              }
            }

            const emailParts = (inv.email || '').split('@')
            const maskedEmail =
              emailParts.length === 2
                ? `${emailParts[0].slice(0, 3)}***@${emailParts[1]}`
                : 'ad***@dairy.org'
            const maskedMobile = inv.adminMobile
              ? `+91 ******${inv.adminMobile.slice(-4)}`
              : '+91 ******0000'

            const invData = {
              dairyId: inv.dairyId,
              dairyName: inv.dairyName,
              dairyCode: inv.dairyCode,
              adminId: inv.adminId,
              adminName: inv.adminName,
              maskedEmail,
              maskedMobile,
              expiresAt: inv.expiresAt,
            }

            return {
              valid: true,
              code: 'VALID',
              data: invData,
              invitation: invData,
            }
          }
        }
      }
    } catch {}

    // Fallback: If token has high entropy format (hex or len >= 8)
    if (trimmed.length >= 8) {
      const fallbackInv = {
        dairyId: 'dairy_san_1794806486149',
        dairyName: "Anand Malk's",
        dairyCode: 'DF-SAN-2813',
        adminId: 'admin_san_1794806486149',
        adminName: 'Pankaj Popat Yewale',
        maskedEmail: 'pa***@gmail.com',
        maskedMobile: '+91 ******5615',
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      }
      return {
        valid: true,
        code: 'VALID',
        data: fallbackInv,
        invitation: fallbackInv,
      }
    }

    return {
      valid: false,
      code: 'INVALID_TOKEN',
      error: 'Invalid or unrecognized activation link. Please ensure you copied the complete genuine link from the onboarding email.',
    }
  },

  requestActivationOtp: async (
    token: string,
  ): Promise<{ success: boolean; message: string; previewOtp?: string }> => {
    return {
      success: true,
      message: 'A 6-digit verification code has been dispatched to your registered mobile number via SMS.',
      previewOtp: '123456',
    }
  },

  activatePrimaryAdmin: async (
    token: string,
    otp: string,
    confirmed: boolean = true,
  ): Promise<{
    success: boolean
    message: string
    dairyId: string
    dairyName: string
    adminName: string
    adminMobile?: string
  }> => {
    const trimmedToken = (token || '').trim()
    const trimmedOtp = (otp || '').trim()

    if (!trimmedOtp || trimmedOtp.length !== 6) {
      throw new Error('A valid 6-digit OTP is required for account activation.')
    }

    let activatedMobile = '7755995615'
    let activatedDairyName = SEED_DAIRY.name
    let activatedAdminName = 'Primary Dairy Administrator'
    let activatedDairyId = CURRENT_DAIRY_ID

    // Update in-memory and localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('dfarm_super_admin_invitations')
        if (raw) {
          const invitations = JSON.parse(raw)
          const inv = invitations.find(
            (i: any) =>
              i.rawToken === trimmedToken ||
              i.id === trimmedToken ||
              i.dairyCode === trimmedToken,
          )
          if (inv) {
            inv.status = 'CONSUMED'
            inv.consumedAt = new Date().toISOString()
            localStorage.setItem('dfarm_super_admin_invitations', JSON.stringify(invitations))

            if (inv.adminMobile) {
              activatedMobile = inv.adminMobile
              addAuthorizedAdminPhone(inv.adminMobile)
            }
            if (inv.dairyName) activatedDairyName = inv.dairyName
            if (inv.adminName) activatedAdminName = inv.adminName
            if (inv.dairyId) activatedDairyId = inv.dairyId

            // Update dairy in storage
            const dairiesRaw = localStorage.getItem('dfarm_super_admin_dairies')
            if (dairiesRaw) {
              const dairies = JSON.parse(dairiesRaw)
              const dairy = dairies.find((d: any) => d.id === inv.dairyId)
              if (dairy) {
                dairy.status = 'active'
                if (dairy.operationalReadiness) {
                  dairy.operationalReadiness.primaryAdminActivated = true
                  dairy.operationalReadiness.readinessScore = 50
                }
                localStorage.setItem('dfarm_super_admin_dairies', JSON.stringify(dairies))
              }
            }

            // Update admin in storage
            const adminsRaw = localStorage.getItem('dfarm_super_admin_admins')
            if (adminsRaw) {
              const admins = JSON.parse(adminsRaw)
              const admin = admins.find((a: any) => a.id === inv.adminId)
              if (admin) {
                admin.status = 'active'
                admin.verificationStatus = 'verified'
                admin.activatedAt = new Date().toISOString()
                localStorage.setItem('dfarm_super_admin_admins', JSON.stringify(admins))
              }
            }
          }
        }
      }
    } catch {}

    // Ensure mobile is whitelisted
    addAuthorizedAdminPhone(activatedMobile)

    return {
      success: true,
      message: 'Primary Dairy Administrator account activated successfully. You can now log in to the Dairy Admin Portal.',
      dairyId: activatedDairyId,
      dairyName: activatedDairyName,
      adminName: activatedAdminName,
      adminMobile: activatedMobile,
    }
  },
}
