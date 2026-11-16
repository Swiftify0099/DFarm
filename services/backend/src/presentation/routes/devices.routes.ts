import { Router, Request, Response, NextFunction } from 'express';
import { GetDeviceTelemetryUseCase } from '../../application/use-cases/index.js';

const router = Router();
const getTelemetryUseCase = new GetDeviceTelemetryUseCase();

router.get('/telemetry', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deviceId = (req.query['deviceId'] as string) || 'KIOSK_MAIN';
    const data = await getTelemetryUseCase.execute(deviceId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export const devicesRoutes = router;
