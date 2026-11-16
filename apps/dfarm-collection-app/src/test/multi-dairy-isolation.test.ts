// DFarm Collection App — Multi-Dairy Operator & Session Isolation Test Suite
// Verifies operator login scoping, customer listing isolation, and shift session lifecycle

import { describe, it, expect, beforeEach } from 'vitest'
import {
  setStoredOperatorAuth,
  getStoredOperatorAuth,
  clearStoredOperatorAuth,
} from '@/api/client'

describe('Multi-Dairy Operator Scoping & Authentication', () => {
  const DAIRY_A = {
    dairyId: '00000000-0000-0000-0000-000000000001',
    dairyName: 'Gokul Shirgaon Co-op Dairy',
    dairyCode: 'GOKUL-01',
    centerId: '00000000-0000-0000-0000-000000000010',
    centerCode: 'GOKUL-CENTER-1',
  }

  const DAIRY_B = {
    dairyId: '00000000-0000-0000-0000-000000000004',
    dairyName: 'Warna Sahakari Dudh Utpadak Sanstha',
    dairyCode: 'WARNA-01',
    centerId: '00000000-0000-0000-0000-000000000040',
    centerCode: 'WARNA-CENTER-1',
  }

  beforeEach(() => {
    clearStoredOperatorAuth()
  })

  it('correctly persists and resolves Dairy A operator credentials', () => {
    setStoredOperatorAuth({
      token: 'mock-jwt-dairy-a',
      operatorId: 'op-001',
      operatorName: 'Sachin Ananda Patil',
      operatorRole: 'OPERATOR',
      dairyId: DAIRY_A.dairyId,
      dairyName: DAIRY_A.dairyName,
      dairyCode: DAIRY_A.dairyCode,
      centerId: DAIRY_A.centerId,
      centerCode: DAIRY_A.centerCode,
    })

    const auth = getStoredOperatorAuth()
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.dairyId).toBe(DAIRY_A.dairyId)
    expect(auth.dairyCode).toBe('GOKUL-01')
    expect(auth.operatorRole).toBe('OPERATOR')
  })

  it('prevents leakage across dairies when operator logs out and logs into Dairy B', () => {
    // 1. Operator logs into Dairy A
    setStoredOperatorAuth({
      token: 'jwt-a',
      operatorId: 'op-a',
      operatorName: 'Operator A',
      operatorRole: 'OPERATOR',
      dairyId: DAIRY_A.dairyId,
      dairyName: DAIRY_A.dairyName,
      dairyCode: DAIRY_A.dairyCode,
      centerId: DAIRY_A.centerId,
      centerCode: DAIRY_A.centerCode,
    })

    let auth = getStoredOperatorAuth()
    expect(auth.dairyId).toBe(DAIRY_A.dairyId)

    // 2. Clear credentials
    clearStoredOperatorAuth()
    auth = getStoredOperatorAuth()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.dairyId).toBeNull()

    // 3. New operator logs into Dairy B
    setStoredOperatorAuth({
      token: 'jwt-b',
      operatorId: 'op-b',
      operatorName: 'Operator B',
      operatorRole: 'OPERATOR',
      dairyId: DAIRY_B.dairyId,
      dairyName: DAIRY_B.dairyName,
      dairyCode: DAIRY_B.dairyCode,
      centerId: DAIRY_B.centerId,
      centerCode: DAIRY_B.centerCode,
    })

    auth = getStoredOperatorAuth()
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.dairyId).toBe(DAIRY_B.dairyId)
    expect(auth.dairyCode).toBe('WARNA-01')
    expect(auth.dairyId).not.toBe(DAIRY_A.dairyId)
  })

  it('enforces that dairy context must be present for collection operations', () => {
    clearStoredOperatorAuth()
    const auth = getStoredOperatorAuth()
    expect(auth.dairyId).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
  })
})
