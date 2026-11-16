import { Router } from 'express';
import { GetDeviceTelemetryUseCase } from '../../application/use-cases/index.js';
const router = Router();
const getTelemetryUseCase = new GetDeviceTelemetryUseCase();
router.get('/telemetry', async (req, res, next) => {
    try {
        const deviceId = req.query['deviceId'] || 'KIOSK_MAIN';
        const data = await getTelemetryUseCase.execute(deviceId);
        res.json({ success: true, data });
    }
    catch (err) {
        next(err);
    }
});
export const devicesRoutes = router;
//# sourceMappingURL=devices.routes.js.map