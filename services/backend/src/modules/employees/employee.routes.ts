import { Router } from 'express';
import { EmployeeController } from './employee.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/authorize.js';
import { UserRole } from '@dfarm/shared-types';

const router = Router();

// All employee routes require authentication
router.use(authenticate);

// Employee CRUD
router.post(
  '/',
  requireRole([UserRole.DAIRY_OWNER, UserRole.DAIRY_ADMIN, UserRole.CENTER_MANAGER]),
  EmployeeController.createEmployee
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
  EmployeeController.listEmployees
);

router.get(
  '/:id',
  requireRole([
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.SUPERVISOR,
    UserRole.ACCOUNTANT,
  ]),
  EmployeeController.getEmployee
);

router.put(
  '/:id',
  requireRole([UserRole.DAIRY_OWNER, UserRole.DAIRY_ADMIN, UserRole.CENTER_MANAGER]),
  EmployeeController.updateEmployee
);

// Role Assignment (Only Dairy Owner / Dairy Admin)
router.post(
  '/:id/role',
  requireRole([UserRole.DAIRY_OWNER, UserRole.DAIRY_ADMIN]),
  EmployeeController.assignRole
);

// Center Assignment
router.post(
  '/:id/centers',
  requireRole([UserRole.DAIRY_OWNER, UserRole.DAIRY_ADMIN, UserRole.CENTER_MANAGER]),
  EmployeeController.assignCenter
);

// Salary Structures
router.post(
  '/:id/salary-structure',
  requireRole([UserRole.DAIRY_OWNER, UserRole.DAIRY_ADMIN, UserRole.ACCOUNTANT]),
  EmployeeController.createSalaryStructure
);

router.get(
  '/:id/salary-structure',
  requireRole([
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.CENTER_MANAGER,
    UserRole.SUPERVISOR,
  ]),
  EmployeeController.getSalaryStructure
);

// Advances
router.post(
  '/:id/advances',
  requireRole([
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.ACCOUNTANT,
  ]),
  EmployeeController.requestAdvance
);

router.post(
  '/advances/:advanceId/approve',
  requireRole([UserRole.DAIRY_OWNER, UserRole.DAIRY_ADMIN]),
  EmployeeController.approveAdvance
);

router.get(
  '/advances',
  requireRole([
    UserRole.DAIRY_OWNER,
    UserRole.DAIRY_ADMIN,
    UserRole.CENTER_MANAGER,
    UserRole.ACCOUNTANT,
  ]),
  EmployeeController.listAdvances
);

export const employeeRouter = router;
