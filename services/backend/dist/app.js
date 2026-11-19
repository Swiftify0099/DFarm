import express from 'express';
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
export function createApp() {
    const app = express();
    app.use(helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    }));
    app.use(cors(corsOptions));
    app.use(express.json({
        limit: '10mb',
        verify: (req, _res, buf) => {
            req.rawBody = buf;
        },
    }));
    app.use(requestContextMiddleware);
    if (process.env['NODE_ENV'] !== 'test') {
        app.use(pinoHttp({ logger }));
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
    // 2. Compatibility & Auth Aliases
    app.use('/api/users/auth', authRoutes);
    app.use('/api/auth', authRoutes);
    // 404 & Error handlers
    app.use(cleanErrorHandler);
    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
}
export const app = createApp();
//# sourceMappingURL=app.js.map