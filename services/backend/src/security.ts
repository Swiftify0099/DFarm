import crypto from 'node:crypto';
import { verifyJwt, signJwt, type JwtPayload } from './jwt.js';
import { UnauthorizedError, ValidationError } from './shared/errors/app-error.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DeviceTokenInput {
  sub: string;
  organizationId: string;
  centerId: string;
  deviceIdentifier: string;
  deviceType?: string;
  jti?: string;
  expiresInSeconds?: number;
}

export interface VerifiedDeviceTokenClaims extends JwtPayload {
  sub: string;
  type: 'device';
  organizationId: string;
  centerId: string;
  deviceIdentifier: string;
  deviceType?: string;
  jti: string;
  iat: number;
  exp: number;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createDeviceToken(payload: DeviceTokenInput): { token: string; hashedToken: string } {
  if (!payload || typeof payload !== 'object') {
    throw new ValidationError('Device token payload object is required');
  }
  const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  const organizationId = typeof payload.organizationId === 'string' ? payload.organizationId.trim() : '';
  const centerId = typeof payload.centerId === 'string' ? payload.centerId.trim() : '';
  const deviceIdentifier = typeof payload.deviceIdentifier === 'string' ? payload.deviceIdentifier.trim() : '';

  if (!UUID_REGEX.test(sub)) {
    throw new ValidationError('Device token requires a valid UUID sub (deviceId)');
  }
  if (!UUID_REGEX.test(organizationId)) {
    throw new ValidationError('Device token requires a valid UUID organizationId');
  }
  if (!UUID_REGEX.test(centerId)) {
    throw new ValidationError('Device token requires a valid UUID centerId');
  }
  if (!deviceIdentifier) {
    throw new ValidationError('Device token requires a non-empty deviceIdentifier');
  }

  const expiresInSeconds =
    typeof payload.expiresInSeconds === 'number' && Number.isFinite(payload.expiresInSeconds) && payload.expiresInSeconds > 0
      ? Math.floor(payload.expiresInSeconds)
      : 30 * 86400;

  const token = signJwt(
    {
      sub,
      type: 'device',
      organizationId,
      centerId,
      deviceIdentifier,
      ...(payload.deviceType ? { deviceType: String(payload.deviceType) } : {}),
      jti: payload.jti || crypto.randomUUID(),
    },
    expiresInSeconds
  );
  const hashedToken = hashToken(token);
  return { token, hashedToken };
}

export function generateDeviceToken(
  deviceIdOrInput: string | DeviceTokenInput,
  organizationId?: string,
  centerId?: string,
  deviceIdentifier?: string,
  expiresInSeconds = 30 * 86400
): { token: string; hashedToken: string } {
  if (typeof deviceIdOrInput === 'object' && deviceIdOrInput !== null) {
    return createDeviceToken(deviceIdOrInput);
  }
  return createDeviceToken({
    sub: deviceIdOrInput,
    organizationId: organizationId || '',
    centerId: centerId || '',
    deviceIdentifier: deviceIdentifier || '',
    expiresInSeconds,
  });
}

export function verifyDeviceToken(token: string): VerifiedDeviceTokenClaims {
  if (typeof token !== 'string' || !token.trim()) {
    throw new UnauthorizedError('Device authentication token is required', 'UNAUTHORIZED_DEVICE');
  }

  const cleanToken = token.trim();
  const parts = cleanToken.split('.');
  // Strictly require a 3-part signed JWT; never allow raw UUID fallback even in NODE_ENV=test.
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new UnauthorizedError('Invalid device token format: signed JWT required', 'INVALID_DEVICE_TOKEN');
  }

  let decoded: JwtPayload;
  try {
    decoded = verifyJwt(cleanToken);
  } catch (err: any) {
    const msg = typeof err?.message === 'string' ? err.message : '';
    if (msg.toLowerCase().includes('expired')) {
      throw new UnauthorizedError('Device token has expired', 'DEVICE_TOKEN_EXPIRED');
    }
    throw new UnauthorizedError('Invalid device token signature or structure', 'INVALID_DEVICE_TOKEN');
  }

  if (typeof decoded.exp !== 'number' || !Number.isFinite(decoded.exp)) {
    throw new UnauthorizedError('Device token is missing mandatory expiration claim', 'INVALID_DEVICE_TOKEN');
  }

  if (decoded['type'] !== 'device' || decoded['actorType'] || decoded['tokenType'] === 'refresh') {
    throw new UnauthorizedError(
      'Invalid token type: a signed device token is required',
      'INVALID_DEVICE_TOKEN_TYPE'
    );
  }

  const sub = typeof decoded.sub === 'string' ? decoded.sub.trim() : '';
  if (!UUID_REGEX.test(sub)) {
    throw new UnauthorizedError('Device token has an invalid device subject claim', 'INVALID_DEVICE_TOKEN');
  }

  const orgId = typeof decoded['organizationId'] === 'string' ? decoded['organizationId'].trim() : '';
  const centerId = typeof decoded['centerId'] === 'string' ? decoded['centerId'].trim() : '';
  const deviceIdentifier = typeof decoded['deviceIdentifier'] === 'string' ? decoded['deviceIdentifier'].trim() : '';

  if (!UUID_REGEX.test(orgId) || !UUID_REGEX.test(centerId) || !deviceIdentifier) {
    throw new UnauthorizedError(
      'Device token lacks required tenant claims (organizationId, centerId, deviceIdentifier). Device re-registration is required.',
      'DEVICE_RE_REGISTRATION_REQUIRED'
    );
  }

  return {
    ...decoded,
    sub,
    type: 'device',
    organizationId: orgId,
    centerId,
    deviceIdentifier,
    jti: typeof decoded['jti'] === 'string' ? decoded['jti'] : '',
    iat: typeof decoded.iat === 'number' ? decoded.iat : 0,
    exp: decoded.exp,
  };
}
