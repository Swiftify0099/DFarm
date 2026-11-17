import { Router, Request, Response, NextFunction } from 'express';
import { GetDeviceTelemetryUseCase } from '../../application/use-cases/index.js';
import { optionalAuthenticate } from '../middleware/authenticate.js';

const router = Router();
const getTelemetryUseCase = new GetDeviceTelemetryUseCase();

// 1. Get Devices List for Dairy
router.get('/', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId || (req.headers['x-dairy-id'] as string) || (req.query['organizationId'] as string);
    if (!organizationId) {
      res.status(400).json({ success: false, error: 'Dairy context (organizationId) is required' });
      return;
    }

    const devices = [
      {
        id: 'dev-kiosk-01',
        deviceName: 'Primary Collection Kiosk',
        deviceType: 'COLLECTION_KIOSK',
        dairyId: organizationId,
        ipAddress: '192.168.1.120',
        macAddress: 'B8:27:EB:14:8A:22',
        firmwareVersion: 'v2.4.1-arm64',
        status: 'ONLINE',
        lastHeartbeatAt: new Date().toISOString(),
        peripherals: {
          rfidReader: { connected: false, port: 'USB0', model: 'RC522-HF-13.56MHz' },
          weightScale: { connected: true, port: 'COM1', model: 'Essae Teraoka DS-215' },
          analyzer: { connected: true, port: 'COM2', model: 'Lactoscan SA-60' },
        },
      },
    ];

    res.json({ success: true, count: devices.length, data: devices });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/sync', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    res.json({
      success: true,
      message: `Device ${id} sync triggered successfully`,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

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
