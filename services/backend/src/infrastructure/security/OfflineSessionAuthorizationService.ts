import crypto from 'node:crypto';
import { config, validateKeyEntropyAndByteLength } from '../../config/env.js';
import type {
  OfflineSessionAuthorizationPayload,
  OfflineSessionAuthorizationDTO,
} from '@dfarm/shared-types';

export interface VerifyAuthorizationResult {
  isValid: boolean;
  payload?: OfflineSessionAuthorizationPayload;
  errorCode?:
    | 'OFFLINE_AUTHORIZATION_MISSING'
    | 'OFFLINE_AUTHORIZATION_INVALID'
    | 'OFFLINE_AUTHORIZATION_EXPIRED'
    | 'OFFLINE_ORGANIZATION_MISMATCH'
    | 'OFFLINE_CENTER_MISMATCH'
    | 'OFFLINE_DEVICE_MISMATCH'
    | 'OFFLINE_DEVICE_AUTH_REQUIRED'
    | 'OFFLINE_SESSION_MISMATCH'
    | 'OFFLINE_BUSINESS_DATE_MISMATCH';
  errorMessage?: string;
}

export interface OfflineAuthorizationKeyOptions {
  activeKey?: string;
  activeKeyId?: string;
  previousKeys?: Record<string, string>;
  retiredKeys?: string[] | string;
}

export class OfflineSessionAuthorizationService {
  private readonly activeKey: string;
  private readonly activeKeyId: string;
  private readonly keyRing: Map<string, string>;
  private readonly retiredKeyIds: Set<string>;

  constructor(options?: string | OfflineAuthorizationKeyOptions) {
    this.retiredKeyIds = new Set<string>();

    if (typeof options === 'string') {
      validateKeyEntropyAndByteLength(options, 'offline lease key option');
      this.activeKey = options;
      this.activeKeyId = 'k1';
      this.keyRing = new Map([['k1', options]]);
    } else {
      const isProduction = process.env['NODE_ENV'] === 'production';
      const dedicatedKey =
        options?.activeKey ||
        process.env['OFFLINE_LEASE_SIGNING_KEY'] ||
        (config as any)?.OFFLINE_LEASE_SIGNING_KEY;

      if (isProduction) {
        if (!dedicatedKey) {
          throw new Error(
            'CRITICAL: Production startup failed: Dedicated OFFLINE_LEASE_SIGNING_KEY must be configured with at least 32 characters (256 bits). Fallback to JWT_SECRET in production is strictly prohibited.'
          );
        }
        validateKeyEntropyAndByteLength(dedicatedKey, 'OFFLINE_LEASE_SIGNING_KEY');
      }

      this.activeKey =
        dedicatedKey ||
        'dev-offline-lease-signing-key-32chars!'; // Scoped dev/test fallback ONLY (strictly independent of JWT_SECRET)

      if (this.activeKey.length < 32) {
        throw new Error('Key strength violation: OFFLINE_LEASE_SIGNING_KEY must be at least 32 characters long');
      }

      this.activeKeyId = options?.activeKeyId || (config as any)?.OFFLINE_LEASE_ACTIVE_KEY_ID || 'k1';
      this.keyRing = new Map([[this.activeKeyId, this.activeKey]]);

      // Load previous valid rotation keys from options or env
      let prevKeysMap: Record<string, string> = {};
      if (options?.previousKeys) {
        prevKeysMap = options.previousKeys;
      } else {
        const rawPrev = process.env['OFFLINE_LEASE_PREVIOUS_KEYS'] || (config as any)?.OFFLINE_LEASE_PREVIOUS_KEYS;
        if (rawPrev) {
          try {
            prevKeysMap = JSON.parse(rawPrev);
          } catch {
            // Support comma-separated format "k0:secret0,k-prev:secret-prev"
            for (const item of rawPrev.split(',')) {
              const [k, v] = item.split(':').map((s: string) => s.trim());
              if (k && v) prevKeysMap[k] = v;
            }
          }
        }
      }

      for (const [kid, secret] of Object.entries(prevKeysMap)) {
        if (secret && secret.length >= 32) {
          if (isProduction) {
            validateKeyEntropyAndByteLength(secret, `OFFLINE_LEASE_PREVIOUS_KEYS[${kid}]`);
          }
          this.keyRing.set(kid, secret);
        }
      }

      // Load retired keys from options or env
      const rawRetired =
        options?.retiredKeys ||
        process.env['OFFLINE_LEASE_RETIRED_KEYS'] ||
        (config as any)?.OFFLINE_LEASE_RETIRED_KEYS;
      if (rawRetired) {
        const retiredList = Array.isArray(rawRetired)
          ? rawRetired
          : String(rawRetired).split(',').map((k) => k.trim()).filter(Boolean);
        for (const k of retiredList) {
          this.retiredKeyIds.add(k);
        }
      }
    }
  }

  /**
   * Generates a cryptographically signed Offline Session Authorization Token & Lease.
   * Issued when an authorized operator opens or accesses an active shift session while online.
   */
  public generateAuthorization(params: {
    organizationId: string;
    centerId: string;
    sessionId: string;
    sessionCode: string;
    businessDate: string;
    shift: 'MORNING' | 'EVENING';
    deviceIdentifier: string;
    operatorId: string;
    operatorName?: string;
    timezone?: string;
    validFrom?: string;
    validUntil?: string;
    maxReconciliationDays?: number;
  }): OfflineSessionAuthorizationDTO {
    const now = new Date();
    const validFrom = params.validFrom || now.toISOString();

    // Default shift lease: valid for 14 hours from session start (covers full shift + shift wrap-up)
    const defaultUntil = new Date(new Date(validFrom).getTime() + 14 * 60 * 60 * 1000).toISOString();
    const validUntil = params.validUntil || defaultUntil;

    const payload: OfflineSessionAuthorizationPayload = {
      authorizationId: crypto.randomUUID(),
      version: 1,
      organizationId: params.organizationId.trim(),
      centerId: params.centerId.trim(),
      sessionId: params.sessionId.trim(),
      sessionCode: params.sessionCode.trim(),
      businessDate: params.businessDate.trim(),
      shift: params.shift,
      deviceIdentifier: params.deviceIdentifier.trim(),
      operatorId: params.operatorId.trim(),
      operatorName: params.operatorName || 'Counter Operator',
      timezone: params.timezone || 'Asia/Kolkata',
      validFrom,
      validUntil,
      issuedAt: now.toISOString(),
      maxReconciliationDays: params.maxReconciliationDays || 30,
    };

    const header = {
      alg: 'HS256',
      typ: 'DFARM-OFFLINE-SESSION-AUTH',
      ver: 1,
      kid: this.activeKeyId,
    };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

    const signature = crypto
      .createHmac('sha256', this.activeKey)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    const token = `${headerB64}.${payloadB64}.${signature}`;

    return {
      token,
      payload,
    };
  }

  /**
   * Cryptographically verifies the server-issued offline authorization token.
   * Performs timing-safe HMAC validation, key ID resolution, JSON parsing, and payload schema integrity checks.
   */
  public verifyToken(token: string): VerifyAuthorizationResult {
    if (!token || !token.trim()) {
      return {
        isValid: false,
        errorCode: 'OFFLINE_AUTHORIZATION_MISSING',
        errorMessage: 'Offline session authorization token is missing',
      };
    }

    const cleanToken = token.trim();
    const parts = cleanToken.split('.');
    if (parts.length !== 3) {
      return {
        isValid: false,
        errorCode: 'OFFLINE_AUTHORIZATION_INVALID',
        errorMessage: 'Malformed offline session authorization token structure',
      };
    }

    const [headerB64, payloadB64, signature] = parts;
    if (!headerB64 || !payloadB64 || !signature) {
      return {
        isValid: false,
        errorCode: 'OFFLINE_AUTHORIZATION_INVALID',
        errorMessage: 'Malformed offline session authorization token components',
      };
    }

    let header: { alg?: string; typ?: string; ver?: number; kid?: string } = {};
    try {
      header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    } catch {
      return {
        isValid: false,
        errorCode: 'OFFLINE_AUTHORIZATION_INVALID',
        errorMessage: 'Malformed offline session authorization token header',
      };
    }

    const kid = header.kid || this.activeKeyId;

    if (this.retiredKeyIds.has(kid)) {
      return {
        isValid: false,
        errorCode: 'OFFLINE_AUTHORIZATION_INVALID',
        errorMessage: `Offline session authorization signed with retired key identifier '${kid}'`,
      };
    }

    const signingSecret = this.keyRing.get(kid);

    if (!signingSecret) {
      return {
        isValid: false,
        errorCode: 'OFFLINE_AUTHORIZATION_INVALID',
        errorMessage: `Offline session authorization signed with unknown key identifier '${kid}'`,
      };
    }

    const expectedSignature = crypto
      .createHmac('sha256', signingSecret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return {
        isValid: false,
        errorCode: 'OFFLINE_AUTHORIZATION_INVALID',
        errorMessage: 'Offline session authorization signature is invalid or tampered',
      };
    }

    try {
      const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
      const payload = JSON.parse(payloadJson) as OfflineSessionAuthorizationPayload;

      // Validate mandatory fields
      if (
        !payload.authorizationId ||
        payload.version !== 1 ||
        !payload.organizationId ||
        !payload.centerId ||
        !payload.sessionId ||
        !payload.sessionCode ||
        !payload.businessDate ||
        !payload.deviceIdentifier ||
        !payload.validFrom ||
        !payload.validUntil
      ) {
        return {
          isValid: false,
          errorCode: 'OFFLINE_AUTHORIZATION_INVALID',
          errorMessage: 'Offline session authorization token payload is missing required scope bindings',
        };
      }

      return {
        isValid: true,
        payload,
      };
    } catch {
      return {
        isValid: false,
        errorCode: 'OFFLINE_AUTHORIZATION_INVALID',
        errorMessage: 'Failed to decode offline session authorization payload',
      };
    }
  }

  /**
   * Comprehensive validation of the authorization against the targeted session,
   * authenticated organization, collection center, device, and business date.
   */
  public validateSessionScope(params: {
    token: string;
    organizationId: string;
    session: {
      id: string;
      sessionCode: string;
      organizationId: string;
      centerId: string;
      businessDate: string;
      deviceIdentifier: string;
      openedAt?: string;
      closedAt?: string | null;
    };
    authenticatedDeviceId?: string;
    deviceId?: string;
    businessDate?: string;
    collectionTimestamp?: string;
  }): VerifyAuthorizationResult {
    const tokenResult = this.verifyToken(params.token);
    if (!tokenResult.isValid || !tokenResult.payload) {
      return tokenResult;
    }

    const auth = tokenResult.payload;

    // 1. Organization binding
    if (auth.organizationId !== params.organizationId || auth.organizationId !== params.session.organizationId) {
      return {
        isValid: false,
        errorCode: 'OFFLINE_ORGANIZATION_MISMATCH',
        errorMessage: `Offline authorization organization (${auth.organizationId}) does not match authenticated organization (${params.organizationId})`,
      };
    }

    // 2. Collection Center binding
    if (params.session.centerId && auth.centerId !== params.session.centerId) {
      return {
        isValid: false,
        errorCode: 'OFFLINE_CENTER_MISMATCH',
        errorMessage: `Offline authorization center (${auth.centerId}) does not match session center (${params.session.centerId})`,
      };
    }

    // 3. Device binding against session and server-authenticated station identity
    // 3a. Target session device binding
    if (params.session.deviceIdentifier && auth.deviceIdentifier !== params.session.deviceIdentifier) {
      return {
        isValid: false,
        errorCode: 'OFFLINE_DEVICE_MISMATCH',
        errorMessage: `Offline authorization device (${auth.deviceIdentifier}) does not match session device (${params.session.deviceIdentifier})`,
      };
    }

    // 3b. Server-authenticated station identity verification
    if (params.authenticatedDeviceId) {
      if (auth.deviceIdentifier !== params.authenticatedDeviceId) {
        return {
          isValid: false,
          errorCode: 'OFFLINE_DEVICE_MISMATCH',
          errorMessage: `Offline authorization device (${auth.deviceIdentifier}) does not match server-authenticated station identity (${params.authenticatedDeviceId})`,
        };
      }
    } else {
      // Reconciling offline collections authorized by lease strictly requires an authenticated station device identity
      return {
        isValid: false,
        errorCode: 'OFFLINE_DEVICE_AUTH_REQUIRED',
        errorMessage: 'Offline session authorization reconciliation strictly requires a server-authenticated station device identity',
      };
    }

    // 3c. Client-supplied device ID verification
    if (params.deviceId && auth.deviceIdentifier !== params.deviceId) {
      return {
        isValid: false,
        errorCode: 'OFFLINE_DEVICE_MISMATCH',
        errorMessage: `Transaction device (${params.deviceId}) does not match offline authorization device (${auth.deviceIdentifier})`,
      };
    }

    // 4. Session ID / Code binding
    if (auth.sessionId !== params.session.id && auth.sessionCode !== params.session.sessionCode) {
      return {
        isValid: false,
        errorCode: 'OFFLINE_SESSION_MISMATCH',
        errorMessage: `Offline authorization session (${auth.sessionCode || auth.sessionId}) does not match session (${params.session.sessionCode})`,
      };
    }

    // 5. Business date binding
    if (auth.businessDate !== params.session.businessDate || (params.businessDate && auth.businessDate !== params.businessDate)) {
      return {
        isValid: false,
        errorCode: 'OFFLINE_BUSINESS_DATE_MISMATCH',
        errorMessage: `Offline authorization date (${auth.businessDate}) does not match session date (${params.session.businessDate})`,
      };
    }

    // 6. Max reconciliation retention check (e.g. 30 days)
    const maxDays = auth.maxReconciliationDays || 30;
    const validUntilTime = new Date(auth.validUntil).getTime();
    const ageDays = (Date.now() - validUntilTime) / (1000 * 60 * 60 * 24);
    if (ageDays > maxDays) {
      return {
        isValid: false,
        errorCode: 'OFFLINE_AUTHORIZATION_EXPIRED',
        errorMessage: `Offline session authorization is expired for sync (${Math.round(ageDays)} days since expiry, max allowed is ${maxDays} days)`,
      };
    }

    // 7. Operational collection window validation against signed lease
    if (params.collectionTimestamp) {
      const collectionTime = new Date(params.collectionTimestamp).getTime();
      const validFromTime = new Date(auth.validFrom).getTime();
      const ALLOWABLE_CLOCK_SKEW_MS = 15 * 60 * 1000; // 15 mins clock skew before validFrom
      const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000; // Max 5 mins allowable client forward skew relative to server

      // Reject impossible collection timestamps in the future relative to server time
      if (collectionTime > Date.now() + MAX_FUTURE_SKEW_MS) {
        return {
          isValid: false,
          errorCode: 'OFFLINE_AUTHORIZATION_EXPIRED',
          errorMessage: `Collection timestamp (${params.collectionTimestamp}) is in the future relative to server current time`,
        };
      }

      // Strict enforcement of the 14-hour collection lease window [validFrom, validUntil]
      if (collectionTime < validFromTime - ALLOWABLE_CLOCK_SKEW_MS || collectionTime > validUntilTime) {
        return {
          isValid: false,
          errorCode: 'OFFLINE_AUTHORIZATION_EXPIRED',
          errorMessage: `Collection timestamp (${params.collectionTimestamp}) is outside permitted offline authorization window [${auth.validFrom} - ${auth.validUntil}]`,
        };
      }
    }

    return {
      isValid: true,
      payload: auth,
    };
  }
}

export const offlineSessionAuthService = new OfflineSessionAuthorizationService();
