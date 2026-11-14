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
import { authRoutes } from './modules/auth/auth.routes.js';
import { customerRoutes } from './modules/customers/customer.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { identificationRouter } from './modules/identification/identification.routes.js';
import { customerRfidRouter, rfidRouter } from './modules/rfid/rfid.routes.js';
import { syncRouter, deviceRouter } from './modules/sync/sync.routes.js';
import { customerBiometricRouter, identityBiometricRouter } from './modules/biometrics/biometric.routes.js';
import { collectionRouter } from './modules/collections/collection.routes.js';
import { rateRouter } from './modules/rates/rate.routes.js';
import { ledgerRouter, customerLedgerRouter } from './modules/ledger/ledger.routes.js';
import { billingRouter } from './modules/billing/billing.routes.js';
import { paymentRouter } from './modules/payments/payment.routes.js';
import { reconciliationRouter } from './modules/payments/reconciliation.routes.js';
import { feedRouter } from './modules/feed/feed.routes.js';
import { inventoryRouter } from './modules/feed/inventory.routes.js';
import { employeeRouter } from './modules/employees/employee.routes.js';
import { attendanceRouter } from './modules/employees/attendance.routes.js';
import { payrollRouter } from './modules/employees/payroll.routes.js';
import { notificationRouter } from './modules/notifications/routes/notification.routes.js';
import { customerNotificationRouter } from './modules/notifications/routes/customer-notification.routes.js';
import { whatsappWebhookRouter } from './modules/notifications/routes/whatsapp-webhook.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({
    limit: '10mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }));
  app.use(requestContextMiddleware);

  if (process.env['NODE_ENV'] !== 'test') {
    app.use(pinoHttp({ logger }));
  }

  // Health routes (no rate-limit to avoid blocking orchestrator liveness probes)
  app.use('/health', healthRoutes);
  app.use('/api/v1/health', healthRoutes);

  // Rate limiter for API routes
  app.use('/api/v1', rateLimiter);

  // Core App modules
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/customers', customerNotificationRouter);
  app.use('/api/v1/customers', customerRoutes);
  app.use('/api/v1/customers', customerBiometricRouter);
  app.use('/api/v1/customers', customerRfidRouter);
  app.use('/api/v1/identity', identityBiometricRouter);
  app.use('/api/v1/rfid', rfidRouter);
  app.use('/api/v1/identification', identificationRouter);
  app.use('/api/v1/sync', syncRouter);
  app.use('/api/v1/devices', deviceRouter);
  app.use('/api/v1/collections', collectionRouter);
  app.use('/api/v1/rates', rateRouter);
  app.use('/api/v1/customers', customerLedgerRouter);
  app.use('/api/v1/ledger', ledgerRouter);
  app.use('/api/v1/billing', billingRouter);
  app.use('/api/v1/payments', paymentRouter);
  app.use('/api/v1/reconciliation', reconciliationRouter);
  app.use('/api/v1/feed', feedRouter);
  app.use('/api/v1/inventory', inventoryRouter);
  app.use('/api/v1/employees', employeeRouter);
  app.use('/api/v1/attendance', attendanceRouter);
  app.use('/api/v1/payroll', payrollRouter);
  app.use('/api/v1/notifications', notificationRouter);
  app.use('/api/v1/webhooks/whatsapp', whatsappWebhookRouter);
  app.use('/api/v1/dashboard', dashboardRouter);
  app.use('/api/v1/reports', reportsRouter);

  // 404 & Error handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app: Express = createApp();
