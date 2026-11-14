import { Router } from 'express';
import { AttendanceController } from './attendance.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import { UserRole } from '@dfarm/shared-types';

const router = Router();

router.use(authenticate);

// Shifts
router.post(
  '/shifts',
  requireRole([UserRole.DAIRY_OWNER, UserRole.DAIRY_ADMIN]),
  AttendanceController.createShift
);

router.get(
  '/shifts',
  requireRole([
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.SUPERVISOR,
    UserRole.COLLECTION_OPERATOR,
  ]),
  AttendanceController.listShifts
);

// Attendance
router.post(
  '/',
  requireRole([
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.SUPERVISOR,
  ]),
  AttendanceController.recordAttendance
);

router.put(
  '/:id/correct',
  requireRole([
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.SUPERVISOR,
  ]),
  AttendanceController.correctAttendance
);

router.get(
  '/',
  requireRole([
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.SUPERVISOR,
    UserRole.ACCOUNTANT,
  ]),
  AttendanceController.listAttendance
);

router.get(
  '/reports/summary',
  requireRole([
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.ACCOUNTANT,
  ]),
  AttendanceController.getAttendanceReport
);

// Leaves
router.post(
  '/leaves',
  requireRole([
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.SUPERVISOR,
    UserRole.COLLECTION_OPERATOR,
    UserRole.ACCOUNTANT,
  ]),
  AttendanceController.createLeave
);

router.put(
  '/leaves/:id/approve',
  requireRole([UserRole.DAIRY_OWNER, UserRole.DAIRY_ADMIN, UserRole.CENTER_MANAGER]),
  AttendanceController.approveLeave
);

router.get(
  '/leaves',
  requireRole([
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.SUPERVISOR,
    UserRole.ACCOUNTANT,
  ]),
  AttendanceController.listLeaves
);

export const attendanceRouter = router;
