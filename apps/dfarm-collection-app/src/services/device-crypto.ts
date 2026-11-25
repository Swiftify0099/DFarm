// DFarm Collection App — Browser W3C WebCrypto Device Proof Service
// Compliant with standard W3C Web Cryptography API (crypto.subtle)
// Zero-bearer proof-of-possession for registered kiosk collection terminals

const STORAGE_KEYS = {
  STATION_ID: 'dfarm_station_identifier',
  STATION_TOKEN: 'dfarm_station_token',
} as const;

/**
 * Converts an ArrayBuffer to a 64-character lowercase hexadecimal string.
 */
export function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Derives the symmetric HMAC proof key from a raw device token using W3C Web Crypto.
 * K_proof = SHA-256(deviceToken)
 * Returns a 64-character lowercase hexadecimal string matching server's devices.device_token_hash.
 */
export async function deriveProofKeyWebCrypto(deviceToken: string): Promise<string> {
  const cleanToken = deviceToken.trim();
  const enc = new TextEncoder();
  const data = enc.encode(cleanToken);

  const subtle = window.crypto?.subtle || (globalThis as any).crypto?.subtle;
  if (!subtle) {
    throw new Error('W3C Web Crypto API (crypto.subtle) is not available in this environment');
  }

  const digestBuffer = await subtle.digest('SHA-256', data);
  return bufferToHex(digestBuffer);
}

/**
 * Computes the HMAC-SHA256 challenge-response proof using W3C Web Crypto.
 * Proof = HMAC-SHA256(K_proof, deviceIdentifier + ":" + challenge)
 *
 * Exact byte & encoding parity with server:
 * - HMAC key: 64 UTF-8 bytes of the hexadecimal proofKey string.
 * - Message: UTF-8 bytes of `${deviceIdentifier.trim()}:${challenge.trim()}`.
 * - Output: 64-character lowercase hexadecimal string.
 */
export async function computeProofWebCrypto(
  challenge: string,
  proofKey: string,
  deviceIdentifier: string
): Promise<string> {
  const cleanChallenge = challenge.trim();
  const cleanKey = proofKey.trim();
  const cleanDevice = deviceIdentifier.trim();

  const enc = new TextEncoder();
  const keyBytes = enc.encode(cleanKey);
  const messageBytes = enc.encode(`${cleanDevice}:${cleanChallenge}`);

  const subtle = window.crypto?.subtle || (globalThis as any).crypto?.subtle;
  if (!subtle) {
    throw new Error('W3C Web Crypto API (crypto.subtle) is not available in this environment');
  }

  const cryptoKey = await subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await subtle.sign('HMAC', cryptoKey, messageBytes);
  return bufferToHex(signatureBuffer);
}

/**
 * Station Credential Store in Kiosk Browser Storage
 */
export const stationCredentialStore = {
  getCredentials(): { stationId: string | null; stationToken: string | null } {
    try {
      return {
        stationId: localStorage.getItem(STORAGE_KEYS.STATION_ID),
        stationToken: localStorage.getItem(STORAGE_KEYS.STATION_TOKEN),
      };
    } catch {
      return { stationId: null, stationToken: null };
    }
  },

  setCredentials(stationId: string, stationToken: string): void {
    localStorage.setItem(STORAGE_KEYS.STATION_ID, stationId.trim());
    localStorage.setItem(STORAGE_KEYS.STATION_TOKEN, stationToken.trim());
  },

  clearCredentials(): void {
    localStorage.removeItem(STORAGE_KEYS.STATION_ID);
    localStorage.removeItem(STORAGE_KEYS.STATION_TOKEN);
  },
};

/**
 * Generates single-use device proof parameters for operator login:
 * 1. Retrieves provisioned stationId & stationToken from browser storage.
 * 2. Fetches single-use nonce challenge from /auth/device/challenge.
 * 3. Derives proof key using crypto.subtle.digest.
 * 4. Signs challenge using crypto.subtle.sign.
 * 5. Returns { deviceIdentifier, challenge, deviceProof }.
 *
 * GUARANTEE: Raw stationToken is NEVER transmitted over the network!
 */
export async function generateStationLoginProof(
  apiBaseUrl: string
): Promise<{ deviceIdentifier: string; challenge: string; deviceProof: string } | null> {
  const { stationId, stationToken } = stationCredentialStore.getCredentials();
  if (!stationId || !stationToken) {
    return null; // Unprovisioned station
  }

  // 1. Request single-use challenge from backend
  const challengeRes = await fetch(`${apiBaseUrl}/auth/device/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceIdentifier: stationId }),
  });

  if (!challengeRes.ok) {
    const errText = await challengeRes.text();
    throw new Error(`Failed to obtain device challenge: ${errText}`);
  }

  const challengeData = await challengeRes.json();
  if (!challengeData.success || !challengeData.challenge) {
    throw new Error(challengeData.error || 'Server did not return a valid challenge token');
  }

  // 2. Derive proof key in browser via WebCrypto
  const proofKey = await deriveProofKeyWebCrypto(stationToken);

  // 3. Compute HMAC proof of possession
  const deviceProof = await computeProofWebCrypto(challengeData.challenge, proofKey, stationId);

  return {
    deviceIdentifier: stationId,
    challenge: challengeData.challenge,
    deviceProof,
  };
}
