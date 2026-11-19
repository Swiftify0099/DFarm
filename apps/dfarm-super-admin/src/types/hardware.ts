export type HardwareDeviceCategory =
  | 'ANALYZER'
  | 'WEIGHING_SCALE'
  | 'RFID_READER'
  | 'COLLECTION_KIOSK'
  | 'CAMERA'
  | 'PRINTER'

export type HardwareDeviceStatus =
  | 'AVAILABLE'
  | 'ASSIGNED'
  | 'MAINTENANCE'
  | 'FAULTY'
  | 'RETIRED'

export interface HardwareDevice {
  id: string
  serialNumber: string
  deviceCategory: HardwareDeviceCategory
  manufacturer: string
  model: string
  status: HardwareDeviceStatus
  assignedDairyId?: string | null
  assignedDairyName?: string | null
  assignedAt?: string | null
  warrantyUntil?: string | null
  notes?: string | null
  createdAt: string
  updatedAt: string
}

export interface AmcPlan {
  id: string
  name: string
  durationMonths: number
  priceInr: number
  description?: string | null
  isActive: boolean
  createdAt: string
}

export type AmcSubscriptionStatus =
  | 'PENDING_PAYMENT'
  | 'ACTIVE'
  | 'RENEWAL_DUE'
  | 'EXPIRED'
  | 'REACTIVATED'
  | 'CANCELLED'

export interface AmcSubscription {
  id: string
  dairyId: string
  dairyName?: string | null
  dairyCode?: string | null
  planId: string
  planName?: string | null
  startDate: string
  expiryDate: string
  status: AmcSubscriptionStatus
  paymentStatus: 'UNPAID' | 'PAID' | 'REFUNDED'
  razorpayPaymentId?: string | null
  amountPaid?: number | null
  activatedAt?: string | null
  createdAt: string
}
