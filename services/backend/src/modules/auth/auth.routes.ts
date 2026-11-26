import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { SendOtpSchema, VerifyOtpSchema } from './auth.schemas.js';

const router = Router();

// Legacy passwordless POST /login permanently removed (DF-001)

// GET /api/v1/auth/me - Protected via Bearer token + authoritative DB verification
router.get('/me', authenticate, AuthController.me);

// GET /api/v1/auth/centers - Authorized centers for staff user / tenant organization
router.get('/centers', authenticate, AuthController.getCenters);

// POST /api/v1/auth/otp/send - Public (requires registered customer phone number)
router.post('/otp/send', validateRequest({ body: SendOtpSchema }), AuthController.sendOtp);

// POST /api/v1/auth/otp/verify - Public
router.post('/otp/verify', validateRequest({ body: VerifyOtpSchema }), AuthController.verifyOtp);

export const authRoutes = router;
