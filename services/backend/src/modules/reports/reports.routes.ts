import { Router } from 'express';
import { ReportsController } from './reports.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import { UserRole } from '@dfarm/shared-types';

export const reportsRouter = Router();

reportsRouter.use(authenticate);

// All reports require staff role
const staffRoles = [
  UserRole.SUPER_ADMIN,
  UserRole.DAIRY_OWNER,
  UserRole.CENTER_MANAGER,
  UserRole.SUPERVISOR,
  UserRole.ACCOUNTANT,
];

reportsRouter.get('/daily-collections', requireRole(staffRoles), ReportsController.getDailyCollection);
reportsRouter.get('/monthly-collections', requireRole(staffRoles), ReportsController.getMonthlyCollection);
reportsRouter.get('/farmer-wise', requireRole(staffRoles), ReportsController.getFarmerWise);
reportsRouter.get('/cow-buffalo', requireRole(staffRoles), ReportsController.getCowBuffalo);
reportsRouter.get('/fat-snf', requireRole(staffRoles), ReportsController.getFatSnf);
reportsRouter.get('/billing', requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.ACCOUNTANT]), ReportsController.getBilling);
reportsRouter.get('/payouts', requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER, UserRole.ACCOUNTANT]), ReportsController.getPayouts);
