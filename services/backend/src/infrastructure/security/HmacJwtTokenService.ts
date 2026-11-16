import crypto from 'node:crypto';
import { ITokenService } from '../../application/ports/index.js';
import { UnauthorizedError } from '../../domain/errors/index.js';

export interface TokenClaims {
  userId: string;
  organizationId?: string;
  centerId?: string;
  role: string;
  actorType: 'STAFF' | 'CUSTOMER';
  iat?: number;
  exp?: number;
}

export class HmacJwtTokenService implements ITokenService {
  private readonly secret: string;

  constructor(secret?: string) {
    this.secret =
      secret ||
      process.env['JWT_SECRET'] ||
      'super-secret-jwt-token-with-at-least-32-characters-long';
  }

  public signToken(
    payload: {
      userId: string;
      organizationId?: string;
      centerId?: string;
      role: string;
      actorType: 'STAFF' | 'CUSTOMER';
    },
    expiresInSeconds = 86400
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'HS256', typ: 'JWT' };
    const claims: TokenClaims = {
      ...payload,
      iat: now,
      exp: now + expiresInSeconds,
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(claims)).toString('base64url');

    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    return `${headerB64}.${payloadB64}.${signature}`;
  }

  public verifyToken(token: string): {
    userId: string;
    organizationId?: string;
    centerId?: string;
    role: string;
    actorType: 'STAFF' | 'CUSTOMER';
  } {
    if (!token) {
      throw new UnauthorizedError('Authentication token missing');
    }

    const cleanToken = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
    const parts = cleanToken.split('.');

    if (parts.length !== 3) {
      throw new UnauthorizedError('Malformed JWT token structure');
    }

    const headerB64 = parts[0];
    const payloadB64 = parts[1];
    const signature = parts[2];

    if (!headerB64 || !payloadB64 || !signature) {
      throw new UnauthorizedError('Malformed JWT token structure');
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    // Timing-safe signature check
    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      throw new UnauthorizedError('Invalid token signature');
    }

    let payload: TokenClaims;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedError('Invalid token payload encoding');
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new UnauthorizedError('Token has expired');
    }

    if (!payload.userId || !payload.role || !payload.actorType) {
      throw new UnauthorizedError('Token is missing mandatory identity claims');
    }

    return {
      userId: payload.userId,
      organizationId: payload.organizationId,
      centerId: payload.centerId,
      role: payload.role,
      actorType: payload.actorType,
    };
  }
}
