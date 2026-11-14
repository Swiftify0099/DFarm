import crypto from 'node:crypto';
import { verifyJwt, signJwt, type JwtPayload } from './jwt.js';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateDeviceToken(deviceId: string, expiresInSeconds = 30 * 86400): { token: string; hashedToken: string } {
  const token = signJwt({ sub: deviceId, type: 'device' }, expiresInSeconds);
  const hashedToken = hashToken(token);
  return { token, hashedToken };
}

export function createDeviceToken(payload?: any): { token: string; hashedToken: string } {
  const deviceId = typeof payload === 'string' ? payload : (payload?.sub || crypto.randomUUID());
  return generateDeviceToken(deviceId);
}

export function verifyDeviceToken(token: string): JwtPayload {
  return verifyJwt(token);
}
