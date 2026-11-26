import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { logger } from './shared/logger/index.js';
import { corsOptions } from './config/cors.js';
import { rateLimiter } from './middleware/rate-limit.js';
import { requestContextMiddleware } from './middleware/request-context.js';
import { notFoundHandler } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';
import { cleanApiRouter } from './presentation/routes/index.js';
import { cleanErrorHandler } from './presentation/middleware/error-handler.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  app.use(cors(corsOptions));
  app.use(express.json({
    limit: '10mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }));
  app.use(requestContextMiddleware);

  if (process.env['NODE_ENV'] !== 'test') {
    app.use(
      pinoHttp({
        logger,
        serializers: {
          req(req: any) {
            if (req.url && typeof req.url === 'string') {
              req.url = req.url.replace(/([?&](token|ticket|sseToken|accessToken|secret|key)=)[^&]+/gi, '$1[REDACTED]');
            }
            return req;
          },
        },
      })
    );
  }

  // Root welcome route for browser & platform checks
  app.get('/', (_req, res) => {
    res.json({
      success: true,
      service: 'DFarm Smart Dairy API',
      status: 'UP',
      health: '/health/live',
      timestamp: new Date().toISOString(),
    });
  });

  // Health routes (no rate-limit to avoid blocking orchestrator liveness probes)
  app.use('/health', healthRoutes);
  app.use('/api/v1/health', healthRoutes);

  // Rate limiter for API routes
  app.use('/api/v1', rateLimiter);

  // 1. Clean Architecture Primary API Router (All consolidated API v1 endpoints)
  app.use('/api/v1', cleanApiRouter);

  // 2. Canonical v1 non-login Auth Mounts (/me, /centers, /otp/send, /otp/verify)
  // Legacy /api/users/auth and /api/auth passwordless compatibility mounts are permanently removed (DF-001)
  app.use('/api/v1/auth', authRoutes);

  // 404 & Error handlers
  app.use(cleanErrorHandler);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app: Express = createApp();
