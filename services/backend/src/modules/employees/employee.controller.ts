import type { Request, Response, NextFunction } from 'express';
import { EmployeeService } from './employee.service.js';
import { SalaryService } from './salary.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import {
  CreateEmployeeSchema,
  UpdateEmployeeSchema,
  AssignEmployeeRoleSchema,
  AssignEmployeeCenterSchema,
  CreateSalaryStructureSchema,
  CreateEmployeeAdvanceSchema,
  ApproveEmployeeAdvanceSchema,
} from '@dfarm/shared-validation';
import type { EmploymentStatus } from '@dfarm/shared-types';

export class EmployeeController {
  public static async createEmployee(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = CreateEmployeeSchema.parse(req.body);
      const employee = await EmployeeService.createEmployee(parsed, req.auth!);
      ApiResponse.success(res, employee, 201);
    } catch (err) {
      next(err);
    }
  }

  public static async listEmployees(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = {
        centerId: req.query['centerId'] as string | undefined,
        department: req.query['department'] as string | undefined,
        status: req.query['status'] as EmploymentStatus | undefined,
        search: req.query['search'] as string | undefined,
        limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : undefined,
        offset: req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : undefined,
      };
      const result = await EmployeeService.listEmployees(filters, req.auth!);
      ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  }

  public static async getEmployee(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const employeeId = req.params['id'] as string;
      const employee = await EmployeeService.getEmployeeById(employeeId, req.auth!);
      ApiResponse.success(res, employee);
    } catch (err) {
      next(err);
    }
  }

  public static async updateEmployee(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const employeeId = req.params['id'] as string;
      const parsed = UpdateEmployeeSchema.parse(req.body);
      const employee = await EmployeeService.updateEmployee(employeeId, parsed, req.auth!);
      ApiResponse.success(res, employee);
    } catch (err) {
      next(err);
    }
  }

  public static async assignRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const employeeId = req.params['id'] as string;
      const parsed = AssignEmployeeRoleSchema.parse(req.body);
      const employee = await EmployeeService.assignRole(employeeId, parsed, req.auth!);
      ApiResponse.success(res, employee);
    } catch (err) {
      next(err);
    }
  }

  public static async assignCenter(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const employeeId = req.params['id'] as string;
      const parsed = AssignEmployeeCenterSchema.parse(req.body);
      await EmployeeService.assignCenter(employeeId, parsed.centerId, parsed.isPrimary, req.auth!);
      ApiResponse.success(res, { success: true, message: 'Center assigned successfully' });
    } catch (err) {
      next(err);
    }
  }

  // Salary structures
  public static async createSalaryStructure(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = CreateSalaryStructureSchema.parse(req.body);
      const structure = await SalaryService.createSalaryStructure(parsed, req.auth!);
      ApiResponse.success(res, structure, 201);
    } catch (err) {
      next(err);
    }
  }

  public static async getSalaryStructure(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const employeeId = req.params['id'] as string;
      const structure = await SalaryService.getSalaryStructure(employeeId, req.auth!);
      ApiResponse.success(res, structure);
    } catch (err) {
      next(err);
    }
  }

  // Employee advances
  public static async requestAdvance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = CreateEmployeeAdvanceSchema.parse(req.body);
      const advance = await SalaryService.requestAdvance(parsed, req.auth!);
      ApiResponse.success(res, advance, 201);
    } catch (err) {
      next(err);
    }
  }

  public static async approveAdvance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const advanceId = req.params['advanceId'] as string;
      const parsed = ApproveEmployeeAdvanceSchema.parse(req.body);
      const advance = await SalaryService.approveAdvance(advanceId, parsed, req.auth!);
      ApiResponse.success(res, advance);
    } catch (err) {
      next(err);
    }
  }

  public static async listAdvances(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = {
        employeeId: req.query['employeeId'] as string | undefined,
        status: req.query['status'] as any,
      };
      const advances = await SalaryService.listAdvances(filters, req.auth!);
      ApiResponse.success(res, advances);
    } catch (err) {
      next(err);
    }
  }
}
