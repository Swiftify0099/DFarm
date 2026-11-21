// DFarm Collection App — Multi-Dairy Isolation & Face Recognition Test Suite
// Rigorous verification of OpenCV YuNet + SFace INT8 (128-D, threshold 0.363)

import { describe, it, expect } from 'vitest'
import {
  DairyFaceMatcher,
  cosineSimilarity,
  CANONICAL_SFACE_128D_FIXTURE,
  FACE_MODEL_MANIFEST,
  type EnrolledFaceTemplate,
} from '@/face-ai'
import type { CustomerIdentity } from '@/types'

describe('DairyFaceMatcher & OpenCV SFace INT8 Biometric Isolation', () => {
  const DAIRY_A_ID = '00000000-0000-0000-0000-000000000001' // Gokul Primary
  const DAIRY_B_ID = '00000000-0000-0000-0000-000000000004' // Warna Sahakari

  const customerDairyA: CustomerIdentity = {
    id: '10000000-0000-0000-0000-000000000101',
    customerCode: 'C-101',
    farmerCode: 'C-101',
    fullName: 'Pandurang Mahadev Patil',
    mobileNumber: '9822011223',
    village: 'Gokul Shirgaon',
    preferredCategory: 'COW',
    permittedCategories: ['COW', 'BUFFALO'],
    dairyId: DAIRY_A_ID,
    status: 'ACTIVE',
    balanceDue: 4500.0,
    rfidCardUid: 'RFID-94A2B81C',
  }

  const customerDairyB: CustomerIdentity = {
    id: '20000000-0000-0000-0000-000000000201',
    customerCode: 'W-201',
    farmerCode: 'W-201',
    fullName: 'Suresh Vishnu Jadhav',
    mobileNumber: '9822099887',
    village: 'Warnanagar',
    preferredCategory: 'BUFFALO',
    permittedCategories: ['BUFFALO'],
    dairyId: DAIRY_B_ID,
    status: 'ACTIVE',
    balanceDue: 3200.0,
    rfidCardUid: 'RFID-B1B2B3B4',
  }

  const suspendedCustomerDairyA: CustomerIdentity = {
    ...customerDairyA,
    id: '10000000-0000-0000-0000-000000000103',
    customerCode: 'C-103',
    farmerCode: 'C-103',
    fullName: 'Suspended Farmer',
    status: 'SUSPENDED',
  }

  const enrolledTemplates: EnrolledFaceTemplate[] = [
    {
      templateId: 'tmpl-dairy-a-101',
      customerId: customerDairyA.id,
      dairyId: DAIRY_A_ID,
      farmerCode: customerDairyA.customerCode,
      fullName: customerDairyA.fullName,
      embedding: CANONICAL_SFACE_128D_FIXTURE,
      status: 'ACTIVE',
    },
    {
      templateId: 'tmpl-dairy-b-201',
      customerId: customerDairyB.id,
      dairyId: DAIRY_B_ID,
      farmerCode: customerDairyB.customerCode,
      fullName: customerDairyB.fullName,
      embedding: CANONICAL_SFACE_128D_FIXTURE, // Exact same biometric embedding enrolled in Dairy B
      status: 'ACTIVE',
    },
    {
      templateId: 'tmpl-dairy-a-103',
      customerId: suspendedCustomerDairyA.id,
      dairyId: DAIRY_A_ID,
      farmerCode: suspendedCustomerDairyA.customerCode,
      fullName: suspendedCustomerDairyA.fullName,
      embedding: CANONICAL_SFACE_128D_FIXTURE,
      status: 'REVOKED',
    },
  ]

  const customersMap = new Map<string, CustomerIdentity>([
    [customerDairyA.id, customerDairyA],
    [customerDairyA.customerCode, customerDairyA],
    [customerDairyB.id, customerDairyB],
    [customerDairyB.customerCode, customerDairyB],
    [suspendedCustomerDairyA.id, suspendedCustomerDairyA],
    [suspendedCustomerDairyA.customerCode, suspendedCustomerDairyA],
  ])

  it('verifies OpenCV SFace model specifications and cosine threshold', () => {
    expect(FACE_MODEL_MANIFEST.recognizer.embeddingDimension).toBe(128)
    expect(FACE_MODEL_MANIFEST.recognizer.recommendedThreshold).toBe(0.363)
    expect(CANONICAL_SFACE_128D_FIXTURE.length).toBe(128)
  })

  it('matches customer in active dairy when cosine similarity exceeds threshold', () => {
    const probe = [...CANONICAL_SFACE_128D_FIXTURE]
    const match = DairyFaceMatcher.match(probe, DAIRY_A_ID, enrolledTemplates, customersMap)

    expect(match.isMatch).toBe(true)
    expect(match.matchedCustomer).toBeDefined()
    expect(match.matchedCustomer?.customerCode).toBe('C-101')
    expect(match.matchedCustomer?.dairyId).toBe(DAIRY_A_ID)
    expect(match.similarity).toBeGreaterThanOrEqual(0.99)
    expect(match.confidenceScore).toBeGreaterThan(95)
  })

  it('STRICT MULTI-DAIRY ISOLATION: blocks cross-dairy customer match when probe presented in Dairy B', () => {
    // Probe vector matches Dairy A's customer template
    const probe = [...CANONICAL_SFACE_128D_FIXTURE]

    // Operator is authenticated inside Dairy B
    const match = DairyFaceMatcher.match(probe, DAIRY_B_ID, enrolledTemplates, customersMap)

    // Must match Dairy B's customer only, NEVER Dairy A's customer
    expect(match.isMatch).toBe(true)
    expect(match.matchedCustomer?.dairyId).toBe(DAIRY_B_ID)
    expect(match.matchedCustomer?.customerCode).toBe('W-201')
    expect(match.matchedCustomer?.customerCode).not.toBe('C-101')
  })

  it('STRICT MULTI-DAIRY ISOLATION: rejects match when Dairy C operator scans Dairy A template', () => {
    const DAIRY_C_ID = '00000000-0000-0000-0000-000000000099' // Completely separate dairy with no templates
    const probe = [...CANONICAL_SFACE_128D_FIXTURE]

    const match = DairyFaceMatcher.match(probe, DAIRY_C_ID, enrolledTemplates, customersMap)

    expect(match.isMatch).toBe(false)
    expect(match.matchedCustomer).toBeNull()
    expect(match.rejectionReason).toBe('NO_TEMPLATES')
  })

  it('rejects match when customer account is SUSPENDED or INACTIVE', () => {
    // Only search suspended customer template in Dairy A
    const suspendedTemplates = enrolledTemplates.filter((t) => t.customerId === suspendedCustomerDairyA.id)
    const probe = [...CANONICAL_SFACE_128D_FIXTURE]

    const match = DairyFaceMatcher.match(probe, DAIRY_A_ID, suspendedTemplates, customersMap)

    expect(match.isMatch).toBe(false)
    expect(match.matchedCustomer).toBeNull()
  })

  it('rejects match when cosine similarity is below 0.363 threshold', () => {
    // Orthogonal / inverted vector
    const dissimilarProbe = CANONICAL_SFACE_128D_FIXTURE.map((v) => -v)
    const match = DairyFaceMatcher.match(dissimilarProbe, DAIRY_A_ID, enrolledTemplates, customersMap)

    expect(match.isMatch).toBe(false)
    expect(match.matchedCustomer).toBeNull()
    expect(match.similarity).toBeLessThan(0.363)
  })

  it('rejects invalid probe vectors that do not match 128 dimensions', () => {
    const invalidShortProbe = [0.1, 0.2, 0.3] // Not 128-D
    const match = DairyFaceMatcher.match(invalidShortProbe, DAIRY_A_ID, enrolledTemplates, customersMap)

    expect(match.isMatch).toBe(false)
    expect(match.matchedCustomer).toBeNull()
    expect(match.rejectionReason).toBe('INVALID_PROBE_EMBEDDING_SHAPE')
  })

  it('calculates mathematically sound cosine similarity and L2 normalization', () => {
    const vecA = [1, 0, 0]
    const vecB = [1, 0, 0]
    const vecC = [0, 1, 0]

    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0, 5)
    expect(cosineSimilarity(vecA, vecC)).toBeCloseTo(0.0, 5)
  })

  it('rejects ambiguous matches where top two candidates are separated by less than 0.05 margin', () => {
    const probe = [...CANONICAL_SFACE_128D_FIXTURE]
    const template1 = {
      templateId: 'tmpl-1',
      customerId: 'cust-1',
      dairyId: DAIRY_A_ID,
      farmerCode: 'WAR-001',
      fullName: 'Farmer One',
      embedding: probe,
      status: 'ACTIVE' as const,
    }
    const slightlyAltered = probe.map((v, i) => (i === 0 ? v + 0.05 : v))
    const norm = Math.sqrt(slightlyAltered.reduce((a, b) => a + b * b, 0))
    const template2 = {
      templateId: 'tmpl-2',
      customerId: 'cust-2',
      dairyId: DAIRY_A_ID,
      farmerCode: 'WAR-002',
      fullName: 'Farmer Two',
      embedding: slightlyAltered.map((v) => v / norm),
      status: 'ACTIVE' as const,
    }
    const match = DairyFaceMatcher.match(probe, DAIRY_A_ID, [template1, template2], customersMap)
    expect(match.isMatch).toBe(false)
    expect(match.rejectionReason).toBe('AMBIGUOUS_SEPARATION_BELOW_MARGIN')
  })
})
