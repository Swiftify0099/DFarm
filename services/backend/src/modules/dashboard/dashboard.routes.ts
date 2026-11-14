import { Router } from 'express';
import { DashboardController } from './dashboard.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);

// GET /api/v1/dashboard/metrics
dashboardRouter.get('/metrics', DashboardController.getMetrics);
dashboardRouter.get('/overview', DashboardController.getMetrics);
