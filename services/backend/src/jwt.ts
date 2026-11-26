import crypto from 'node:crypto';
import { config } from './config/env.js';

export interface JwtPayload {
  sub: string;
  email?: string;
  phone?: string;
  role?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

function getJwtSecret(): string {
  const secret = process.env['JWT_SECRET'] || config.JWT_SECRET;
  const isProd = config.NODE_ENV === 'production' || process.env['NODE_ENV'] === 'production';
  if (isProd && (!secret || secret === 'super-secret-jwt-token-with-at-least-32-characters-long')) {
    throw new Error('CRITICAL: Production JWT_SECRET is missing or insecure.');
  }
  return secret || 'super-secret-jwt-token-with-at-least-32-characters-long';
}

export function signJwt(payload: JwtPayload, expiresInSeconds = 86400): string {
  const secret = getJwtSecret();
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const existingAppMeta = (typeof payload['app_metadata'] === 'object' && payload['app_metadata'] !== null)
    ? (payload['app_metadata'] as Record<string, unknown>)
    : {};
  const fullPayload: JwtPayload = {
    ...payload,
    app_metadata: {
      organization_id: payload['organizationId'] || payload['organization_id'] || existingAppMeta['organization_id'],
      center_id: payload['primaryCenterId'] || payload['centerId'] || existingAppMeta['center_id'],
      user_role: payload['role'] || existingAppMeta['user_role'],
      ...existingAppMeta,
    },
    iat: now,
    exp: now + expiresInSeconds,
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

export function verifyJwt(token: string): JwtPayload {
  const secret = getJwtSecret();
  const parts = token.split('.');
  if (parts.length !== 3) {
    // If it's a UUID (mock token), create fallback payload ONLY in test environment
    if (
      process.env['NODE_ENV'] === 'test' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)
    ) {
      return { sub: token };
    }
    throw new Error('Invalid JWT format');
  }

  const [headerB64, payloadB64, signature] = parts;
  if (!headerB64 || !payloadB64 || !signature) {
    throw new Error('Invalid JWT format');
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error('Invalid JWT signature');
  }

  const payloadJson = Buffer.from(payloadB64 || '', 'base64url').toString('utf8');
  const payload: JwtPayload = JSON.parse(payloadJson);

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('JWT token expired');
  }

  return payload;
}
