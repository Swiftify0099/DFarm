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
} from '../../application/use-cases/index.js';
import { DoveOtpService, doveOtpService } from '../../infrastructure/otp/DoveOtpService.js';
import { HmacJwtTokenService } from '../../infrastructure/security/HmacJwtTokenService.js';
import { PostgresCustomerRepository } from '../../infrastructure/repositories/PostgresCustomerRepository.js';
import { authenticate } from '../middleware/authenticate.js';
import { db } from '../../infrastructure/database/PostgresPool.js';

const router = Router();
const otpService: DoveOtpService = doveOtpService;
const tokenService = new HmacJwtTokenService();
const customerRepo = new PostgresCustomerRepository();

const requestOperatorOtp = new RequestOperatorOtpUseCase(otpService);
const verifyOperatorOtp = new VerifyOperatorOtpUseCase(otpService, tokenService);
const requestCustomerOtp = new RequestCustomerOtpUseCase(otpService);
const verifyCustomerOtp = new VerifyCustomerOtpUseCase(otpService, tokenService, customerRepo);
const requestAdminOtp = new RequestAdminOtpUseCase(otpService);
const verifyAdminOtp = new VerifyAdminOtpUseCase(otpService, tokenService);
const refreshTokenUseCase = new RefreshTokenUseCase(tokenService);

// IP-level rate limiting for OTP requests and verification to prevent brute-force / abuse
const otpRequestLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 OTP requests per minute per IP
  message: { success: false, error: 'Too many OTP requests from this IP. Please wait a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpVerifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20, // Max 20 verification attempts per minute per IP
  message: { success: false, error: 'Too many verification attempts from this IP. Please wait a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// 1. Operator OTP (Collection App Kiosk)
// ============================================================================
router.post('/operator/otp/request', otpRequestLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mobileNumber, phone } = req.body;
    const result = await requestOperatorOtp.execute(mobileNumber || phone);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/operator/otp/verify', otpVerifyLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mobileNumber, phone, otp } = req.body;
    const result = await verifyOperatorOtp.execute(mobileNumber || phone, otp);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 2. Customer OTP (Farmer Mobile App)
// ============================================================================
router.post('/request-otp', otpRequestLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mobileNumber, phone } = req.body;
    const result = await requestCustomerOtp.execute(mobileNumber || phone);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/verify-otp', otpVerifyLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mobileNumber, phone, otp } = req.body;
    const result = await verifyCustomerOtp.execute(mobileNumber || phone, otp);
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
    const { mobileNumber, phone } = req.body;
    const ip = req.ip || req.socket.remoteAddress;
    const result = await requestAdminOtp.execute(mobileNumber || phone, ip);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/admin/otp/verify', otpVerifyLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mobileNumber, phone, otp } = req.body;
    const result = await verifyAdminOtp.execute(mobileNumber || phone, otp);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.get('/admin/me', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized: missing authentication context' });
      return;
    }
    const cleanId = userId.replace('admin:', '');
    const clean10 = cleanId.replace(/\D/g, '').slice(-10);

    const queryRes = await db.query(
      `SELECT 
         u.id, 
         u.full_name, 
         u.phone_number AS mobile_number,
         u.organization_id, 
         COALESCE(u.role, u.user_role) AS role, 
         u.status AS user_status, 
         o.name AS org_name, 
         o.code AS org_code, 
         o.status AS org_status
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
       WHERE u.id = $1 OR (length($2) = 10 AND u.phone_number LIKE $3)
       LIMIT 1;`,
      [cleanId, clean10, `%${clean10}`]
    );

    if (queryRes.rows.length === 0) {
      res.status(401).json({ success: false, error: 'Administrator user record not found' });
      return;
    }

    const row = queryRes.rows[0];
    if (row.user_status && row.user_status !== 'ACTIVE') {
      res.status(403).json({ success: false, error: 'Administrator account is suspended or inactive' });
      return;
    }

    if (!row.organization_id || !row.org_name || !row.org_code) {
      res.status(403).json({ success: false, error: 'No active dairy cooperative assigned to administrator account' });
      return;
    }

    if (row.org_status && row.org_status !== 'ACTIVE') {
      res.status(403).json({ success: false, error: `Assigned dairy (${row.org_name}) is currently inactive or suspended` });
      return;
    }

    res.json({
      success: true,
      user: {
        id: row.id,
        fullName: row.full_name,
        mobileNumber: row.mobile_number,
        role: row.role || 'PRIMARY_DAIRY_ADMIN',
        dairyId: row.organization_id,
        dairyName: row.org_name,
        dairyCode: row.org_code,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 4. Token Refresh
// ============================================================================
router.post('/refresh-token', (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.body.refreshToken || req.headers.authorization?.slice(7);
    const result = refreshTokenUseCase.execute(token);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

export const authRoutes = router;
