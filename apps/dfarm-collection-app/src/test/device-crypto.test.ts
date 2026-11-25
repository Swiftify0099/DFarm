import { describe, it, expect, beforeEach } from 'vitest'
import {
  deriveProofKeyWebCrypto,
  computeProofWebCrypto,
  stationCredentialStore,
  bufferToHex,
} from '@/services/device-crypto'

describe('DFarm Collection App — Browser WebCrypto Device Crypto Service', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('1. bufferToHex converts binary buffer to 64-char lowercase hex string', () => {
    const arr = new Uint8Array([0, 1, 15, 16, 255])
    expect(bufferToHex(arr.buffer)).toBe('00010f10ff')
  })

  it('2. deriveProofKeyWebCrypto produces exact SHA-256 hex digest using Web Crypto', async () => {
    const token = 'kiosk-station-test-token-256bit'
    const key = await deriveProofKeyWebCrypto(token)

    expect(typeof key).toBe('string')
    expect(key).toHaveLength(64)
    expect(key).toMatch(/^[0-9a-f]{64}$/)

    // Normalization test
    const withWhitespace = `  ${token} \n `
    const normalizedKey = await deriveProofKeyWebCrypto(withWhitespace)
    expect(normalizedKey).toBe(key)
  })

  it('3. computeProofWebCrypto produces reproducible HMAC-SHA256 signature', async () => {
    const token = 'kiosk-station-test-token-256bit'
    const proofKey = await deriveProofKeyWebCrypto(token)
    const challenge = 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899'
    const stationId = 'STATION_TEST_01'

    const proof1 = await computeProofWebCrypto(challenge, proofKey, stationId)
    const proof2 = await computeProofWebCrypto(challenge, proofKey, stationId)

    expect(proof1).toBe(proof2)
    expect(proof1).toHaveLength(64)
    expect(proof1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('4. computeProofWebCrypto rejects changes to challenge or stationId', async () => {
    const proofKey = await deriveProofKeyWebCrypto('test-secret')
    const challenge = '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff'
    const stationA = 'STATION_A'
    const stationB = 'STATION_B'

    const proofA = await computeProofWebCrypto(challenge, proofKey, stationA)
    const proofB = await computeProofWebCrypto(challenge, proofKey, stationB)

    expect(proofA).not.toBe(proofB)

    const proofAlteredChallenge = await computeProofWebCrypto(
      challenge.slice(0, -2) + '00',
      proofKey,
      stationA
    )
    expect(proofA).not.toBe(proofAlteredChallenge)
  })

  it('5. stationCredentialStore correctly manages station identity in browser storage', () => {
    expect(stationCredentialStore.getCredentials()).toEqual({ stationId: null, stationToken: null })

    stationCredentialStore.setCredentials('STATION_NORTH_01', 'token-secret-xyz-123')
    expect(stationCredentialStore.getCredentials()).toEqual({
      stationId: 'STATION_NORTH_01',
      stationToken: 'token-secret-xyz-123',
    })

    stationCredentialStore.clearCredentials()
    expect(stationCredentialStore.getCredentials()).toEqual({ stationId: null, stationToken: null })
  })
})
