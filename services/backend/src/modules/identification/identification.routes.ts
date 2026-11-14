import { Router } from 'express';
import { IdentificationController } from './identification.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validateRequest } from '../../middleware/validate-request.js';
import {
  StartIdentificationSessionSchema,
  FaceIdentificationInputSchema,
  RfidIdentificationInputSchema,
  SupervisorVerificationInputSchema,
} from '@dfarm/shared-validation';
import { z } from 'zod';

const SessionIdParamSchema = z.object({
  sessionId: z.string().uuid('Session ID must be a valid UUID'),
});

export const identificationRouter = Router();
identificationRouter.use(authenticate);

// 1. Start Session
identificationRouter.post(
  '/session',
  validateRequest({ body: StartIdentificationSessionSchema }),
  IdentificationController.startSession
);

// 2. Query Session State
identificationRouter.get(
  '/session/:sessionId',
  validateRequest({ params: SessionIdParamSchema }),
  IdentificationController.getSession
);

// 3. Method 1: Face Recognition
identificationRouter.post(
  '/face',
  validateRequest({ body: FaceIdentificationInputSchema }),
  IdentificationController.identifyByFace
);

// 4. Method 2: RFID Card Tap
identificationRouter.post(
  '/rfid',
  validateRequest({ body: RfidIdentificationInputSchema }),
  IdentificationController.identifyByRfid
);

// 5. Method 3: Supervisor Manual Verification
identificationRouter.post(
  '/supervisor-verify',
  validateRequest({ body: SupervisorVerificationInputSchema }),
  IdentificationController.verifyBySupervisor
);

// 6. Identification Audit Telemetry
identificationRouter.get(
  '/audit',
  IdentificationController.getAuditLogs
);

