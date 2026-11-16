import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { RequestOperatorOtpUseCase, VerifyOperatorOtpUseCase, RequestCustomerOtpUseCase, VerifyCustomerOtpUseCase, RequestAdminOtpUseCase, VerifyAdminOtpUseCase, RefreshTokenUseCase, } from '../../application/use-cases/index.js';
import { doveOtpService } from '../../infrastructure/otp/DoveOtpService.js';
import { HmacJwtTokenService } from '../../infrastructure/security/HmacJwtTokenService.js';
import { PostgresCustomerRepository } from '../../infrastructure/repositories/PostgresCustomerRepository.js';
const router = Router();
const otpService = doveOtpService;
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
router.post('/operator/otp/request', otpRequestLimiter, async (req, res, next) => {
    try {
        const { mobileNumber, phone } = req.body;
        const result = await requestOperatorOtp.execute(mobileNumber || phone);
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
router.post('/operator/otp/verify', otpVerifyLimiter, async (req, res, next) => {
    try {
        const { mobileNumber, phone, otp } = req.body;
        const result = await verifyOperatorOtp.execute(mobileNumber || phone, otp);
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
});
// ============================================================================
// 2. Customer OTP (Farmer Mobile App)
// ============================================================================
router.post('/request-otp', otpRequestLimiter, async (req, res, next) => {
    try {
        const { mobileNumber, phone } = req.body;
        const result = await requestCustomerOtp.execute(mobileNumber || phone);
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
router.post('/verify-otp', otpVerifyLimiter, async (req, res, next) => {
    try {
        const { mobileNumber, phone, otp } = req.body;
        const result = await verifyCustomerOtp.execute(mobileNumber || phone, otp);
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
});
// ============================================================================
// 3. Admin OTP (Hardened Dairy & Super Admin Portal)
// ============================================================================
router.post('/admin/otp/request', otpRequestLimiter, async (req, res, next) => {
    try {
        const { mobileNumber, phone } = req.body;
        const ip = req.ip || req.socket.remoteAddress;
        const result = await requestAdminOtp.execute(mobileNumber || phone, ip);
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
router.post('/admin/otp/verify', otpVerifyLimiter, async (req, res, next) => {
    try {
        const { mobileNumber, phone, otp } = req.body;
        const result = await verifyAdminOtp.execute(mobileNumber || phone, otp);
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
});
// ============================================================================
// 4. Token Refresh
// ============================================================================
router.post('/refresh-token', (req, res, next) => {
    try {
        const token = req.body.refreshToken || req.headers.authorization?.slice(7);
        const result = refreshTokenUseCase.execute(token);
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
});
export const authRoutes = router;
//# sourceMappingURL=auth.routes.js.map