import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import {
  RequestOperatorOtpUseCase,
  VerifyOperatorOtpUseCase,
  RequestCustomerOtpUseCase,
  VerifyCustomerOtpUseCase,
  RequestAdminOtpUseCase,
  VerifyAdminOtpUseCase,
  RefreshTokenUseCase,
  SelectDairyMembershipUseCase,
} from '../../application/use-cases/index.js';
import { DoveOtpService, doveOtpService, ALLOWED_ADMIN_ROLES, PLATFORM_ADMIN_ROLES } from '../../infrastructure/otp/DoveOtpService.js';
import { HmacJwtTokenService } from '../../infrastructure/security/HmacJwtTokenService.js';
import { PostgresCustomerRepository } from '../../infrastructure/repositories/PostgresCustomerRepository.js';
import { PostgresCustomerMembershipRepository } from '../../infrastructure/repositories/PostgresCustomerMembershipRepository.js';
import { authenticate } from '../middleware/authenticate.js';
import { db } from '../../infrastructure/database/PostgresPool.js';
import { deviceChallengeService } from '../../infrastructure/security/DeviceChallengeService.js';
import { tokenRevocationService } from '../../infrastructure/security/TokenRevocationService.js';

export function serializeOtpResponse(result: {
  success: boolean;
  message: string;
  cooldownSeconds?: number;
  expiresAt?: string;
  previewOtp?: string;
}): Record<string, unknown> {
  const allowTestPreview = DoveOtpService.isStrictTestMode();
  const payload: Record<string, unknown> = {
    success: Boolean(result.success),
    message: result.message,
  };
  if (result.cooldownSeconds !== undefined) {
    payload.cooldownSeconds = result.cooldownSeconds;
  }
  if (result.expiresAt !== undefined) {
    payload.expiresAt = result.expiresAt;
  }
  if (allowTestPreview && typeof result.previewOtp === 'string') {
    payload.previewOtp = result.previewOtp;
  }
  return payload;
}

const router = Router();
const otpService: DoveOtpService = doveOtpService;
const tokenService = new HmacJwtTokenService();
const customerRepo = new PostgresCustomerRepository();
const membershipRepo = new PostgresCustomerMembershipRepository();

const requestOperatorOtp = new RequestOperatorOtpUseCase(otpService);
const verifyOperatorOtp = new VerifyOperatorOtpUseCase(otpService, tokenService);
const requestCustomerOtp = new RequestCustomerOtpUseCase(otpService);
const verifyCustomerOtp = new VerifyCustomerOtpUseCase(otpService, tokenService, customerRepo, membershipRepo);
const selectDairyMembership = new SelectDairyMembershipUseCase(membershipRepo, tokenService, customerRepo);
const requestAdminOtp = new RequestAdminOtpUseCase(otpService);
const verifyAdminOtp = new VerifyAdminOtpUseCase(otpService, tokenService);
const refreshTokenUseCase = new RefreshTokenUseCase(tokenService);

// IP-level rate limiting for OTP requests and verification to prevent brute-force / abuse
const otpRequestLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: () => (process.env['NODE_ENV'] === 'test' ? 200 : 10), // Max 10 OTP requests per minute per IP in production
  message: { success: false, error: 'Too many OTP requests from this IP. Please wait a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpVerifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: () => (process.env['NODE_ENV'] === 'test' ? 200 : 20), // Max 20 verification attempts per minute per IP
  message: { success: false, error: 'Too many verification attempts from this IP. Please wait a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// 0. Lightweight Auth Health Check
// ============================================================================
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ success: true, status: 'healthy', timestamp: new Date().toISOString() });
});

// ============================================================================
// 1. Operator OTP & Device Challenge (Collection App Kiosk)
// ============================================================================
router.post('/device/challenge', otpRequestLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { deviceIdentifier } = req.body;
    if (!deviceIdentifier || !deviceIdentifier.trim()) {
      res.status(400).json({ success: false, error: 'deviceIdentifier is required to generate challenge' });
      return;
    }

    const cleanDeviceId = deviceIdentifier.trim();
    const devRes = await db.query(
      `SELECT id, organization_id, status FROM devices WHERE device_identifier = $1;`,
      [cleanDeviceId]
    );

    if (devRes.rows.length === 0) {
      res.status(404).json({ success: false, error: `Station '${cleanDeviceId}' is not registered` });
      return;
    }

    const dev = devRes.rows[0];
    if (dev.status !== 'ACTIVE') {
      res.status(403).json({ success: false, error: `Station '${cleanDeviceId}' status is ${dev.status}. Challenge generation denied.` });
      return;
    }

    const challenge = await deviceChallengeService.createChallenge(cleanDeviceId, dev.organization_id);
    res.json({ success: true, ...challenge });
  } catch (err) {
    next(err);
  }
});

router.post('/operator/otp/request', otpRequestLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mobileNumber, phone } = req.body;
    const result = await requestOperatorOtp.execute(mobileNumber || phone);
    res.json(serializeOtpResponse(result));
  } catch (err) {
    next(err);
  }
});

router.post('/operator/otp/verify', otpVerifyLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      mobileNumber,
      phone,
      otp,
      deviceIdentifier,
      deviceId,
      deviceToken,
      deviceProof,
      challenge,
    } = req.body;

    const headerToken =
      (req.headers['x-device-token'] as string) ||
      (req.headers['x-device-credential'] as string);

    const activeToken = deviceToken || headerToken;

    const result = await verifyOperatorOtp.execute(
      mobileNumber || phone,
      otp,
      deviceIdentifier || deviceId,
      {
        deviceToken: activeToken,
        challenge,
        deviceProof,
      }
    );
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 2. Customer OTP (Farmer Mobile App)
// ============================================================================
const requestCustomerOtpHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mobileNumber, phone } = req.body;
    const result = await requestCustomerOtp.execute(mobileNumber || phone);
    res.json(serializeOtpResponse(result));
  } catch (err) {
    next(err);
  }
};

const verifyCustomerOtpHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mobileNumber, phone, otp } = req.body;
    const result = await verifyCustomerOtp.execute(mobileNumber || phone, otp);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

router.post('/request-otp', otpRequestLimiter, requestCustomerOtpHandler);
router.post('/customer/request-otp', otpRequestLimiter, requestCustomerOtpHandler);

router.post('/verify-otp', otpVerifyLimiter, verifyCustomerOtpHandler);
router.post('/customer/verify-otp', otpVerifyLimiter, verifyCustomerOtpHandler);

router.post('/customer/select-dairy', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dairyId = req.body.dairyId || req.body.organizationId;
    if (!dairyId) {
      res.status(400).json({ success: false, error: 'dairyId is required.' });
      return;
    }
    const result = await selectDairyMembership.execute({
      globalCustomerId: req.user?.globalCustomerId,
      dairyId,
      tenantCustomerId: req.user?.userId,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 3. Admin OTP (Hardened Dairy & Super Admin Portal)
// ============================================================================
router.post('/admin/otp/request', otpRequestLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mobileNumber, phone, mobile } = req.body;
    const rawPhone = mobileNumber || phone || mobile;
    if (!rawPhone) {
      res.status(400).json({ success: false, error: 'Mobile number is required' });
      return;
    }
    const ip = req.ip || req.socket.remoteAddress;
    const result = await requestAdminOtp.execute(rawPhone, ip);
    res.json(serializeOtpResponse(result));
  } catch (err) {
    next(err);
  }
});

router.post('/admin/otp/verify', otpVerifyLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mobileNumber, phone, mobile, otp, code } = req.body;
    const rawPhone = mobileNumber || phone || mobile;
    const rawOtp = otp || code;

    if (!rawPhone) {
      res.status(400).json({ success: false, error: 'Phone / mobile number is required' });
      return;
    }
    if (!rawOtp) {
      res.status(400).json({ success: false, error: 'Verification OTP code is required' });
      return;
    }

    const result = await verifyAdminOtp.execute(rawPhone, rawOtp);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.get('/admin/me', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId || req.user?.actorType !== 'STAFF') {
      res.status(401).json({ success: false, error: 'Unauthorized: missing staff authentication context' });
      return;
    }

    let row: any = null;
    try {
      const queryRes = await db.query(
        `SELECT 
           u.id, 
           u.full_name, 
           COALESCE(u.phone_number, u.mobile_number) AS mobile_number,
           u.organization_id, 
           u.role AS base_role,
           u.user_role AS secondary_role,
           u.status AS user_status, 
           o.name AS org_name, 
           o.code AS org_code, 
           o.status AS org_status
         FROM users u
         LEFT JOIN organizations o ON o.id = u.organization_id
         WHERE u.id = $1
         LIMIT 1;`,
        [userId]
      );
      if (queryRes.rows.length > 0) {
        row = queryRes.rows[0];
      }
    } catch {
      res.status(503).json({ success: false, error: 'Unable to verify administrator session' });
      return;
    }

    if (!row) {
      res.status(401).json({ success: false, error: 'Administrator user record not found' });
      return;
    }

    if (String(row.user_status || '').toUpperCase() !== 'ACTIVE') {
      res.status(403).json({ success: false, error: 'Administrator account is suspended or inactive' });
      return;
    }

    const roleCandidates = [row.secondary_role, row.base_role]
      .filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
      .map((r) => r.trim().toUpperCase());

    const resolvedRole = roleCandidates.find((r) => ALLOWED_ADMIN_ROLES.has(r));
    if (!resolvedRole) {
      res.status(403).json({ success: false, error: 'Account role is not authorized for administrator access' });
      return;
    }

    const isPlatformStaff = PLATFORM_ADMIN_ROLES.has(resolvedRole);

    if (!isPlatformStaff) {
      if (!row.organization_id || !row.org_name || !row.org_code) {
        res.status(403).json({ success: false, error: 'No active dairy cooperative assigned to administrator account' });
        return;
      }

      if (req.user?.organizationId && row.organization_id !== req.user.organizationId) {
        res.status(403).json({ success: false, error: 'Organization mismatch for administrator session' });
        return;
      }

      if (String(row.org_status || '').toUpperCase() !== 'ACTIVE') {
        res.status(403).json({ success: false, error: 'Assigned dairy cooperative is currently inactive or suspended' });
        return;
      }
    }

    res.json({
      success: true,
      user: {
        id: row.id,
        fullName: row.full_name,
        mobileNumber: row.mobile_number,
        role: resolvedRole,
        dairyId: row.organization_id || (isPlatformStaff ? '00000000-0000-0000-0000-000000000001' : undefined),
        dairyName: row.org_name || (isPlatformStaff ? 'DFarm Platform Federation' : undefined),
        dairyCode: row.org_code || (isPlatformStaff ? 'DF-PLATFORM' : undefined),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 4. Token Refresh
// ============================================================================
router.post('/refresh-token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.body?.refreshToken || req.headers.authorization?.slice(7);
    const result = await refreshTokenUseCase.execute(token);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 5. Logout
// ============================================================================
router.post('/logout', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || (req.headers['x-access-token'] as string | undefined);
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader?.trim();
  const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken.trim() : undefined;

  const errors: string[] = [];

  if (accessToken) {
    try {
      const claims = tokenService.verifyToken(accessToken);
      await tokenRevocationService.revokeAsync({ token: accessToken, jti: claims.jti, expiresAtSeconds: claims.exp });
    } catch (err: unknown) {
      // If the token is already invalid/expired we don't need to revoke it —
      // but if the DB write fails (503 REVOCATION_DB_UNAVAILABLE), surface that truthfully.
      const code = (err as any)?.code;
      if (code === 'REVOCATION_DB_UNAVAILABLE') {
        errors.push('Access token revocation could not be persisted to the authorization database.');
      }
      // Invalid / expired tokens are silently accepted — user is logging out anyway.
    }
  }
  if (refreshToken) {
    try {
      const claims = tokenService.verifyToken(refreshToken);
      await tokenRevocationService.revokeAsync({ token: refreshToken, jti: claims.jti, expiresAtSeconds: claims.exp });
    } catch (err: unknown) {
      const code = (err as any)?.code;
      if (code === 'REVOCATION_DB_UNAVAILABLE') {
        errors.push('Refresh token revocation could not be persisted to the authorization database.');
      }
    }
  }

  if (errors.length > 0) {
    // Truthful failure — do NOT return "Logged out successfully" if revocation failed
    res.status(503).json({
      success: false,
      code: 'REVOCATION_DB_UNAVAILABLE',
      error: 'Logout could not be completed: token revocation database is unavailable. Please retry.',
      details: errors,
    });
    return;
  }

  res.json({ success: true, message: 'Logged out successfully' });
});

export const authRoutes = router;
