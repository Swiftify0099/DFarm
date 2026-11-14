import type { Request, Response, NextFunction } from 'express';
import { AttendanceService } from './attendance.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import {
  CreateShiftSchema,
  RecordAttendanceSchema,
  AttendanceCorrectionSchema,
  CreateLeaveRequestSchema,
  ApproveLeaveSchema,
} from '@dfarm/shared-validation';
import type { AttendanceStatus, LeaveStatus } from '@dfarm/shared-types';

export class AttendanceController {
  // Shifts
  public static async createShift(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = CreateShiftSchema.parse(req.body);
      const shift = await AttendanceService.createShift(parsed, req.auth!);
      ApiResponse.success(res, shift, 201);
    } catch (err) {
      next(err);
    }
  }

  public static async listShifts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shifts = await AttendanceService.listShifts(req.auth!);
      ApiResponse.success(res, shifts);
    } catch (err) {
      next(err);
    }
  }

  // Attendance
  public static async recordAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = RecordAttendanceSchema.parse(req.body);
      const attendance = await AttendanceService.recordAttendance(parsed, req.auth!);
      ApiResponse.success(res, attendance, 201);
    } catch (err) {
      next(err);
    }
  }

  public static async correctAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const attendanceId = req.params['id'] as string;
      const parsed = AttendanceCorrectionSchema.parse(req.body);
      const attendance = await AttendanceService.correctAttendance(attendanceId, parsed, req.auth!);
      ApiResponse.success(res, attendance);
    } catch (err) {
      next(err);
    }
  }

  public static async listAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = {
        centerId: req.query['centerId'] as string | undefined,
        employeeId: req.query['employeeId'] as string | undefined,
        startDate: req.query['startDate'] as string | undefined,
        endDate: req.query['endDate'] as string | undefined,
        status: req.query['status'] as AttendanceStatus | undefined,
        limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : undefined,
        offset: req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : undefined,
      };
      const result = await AttendanceService.listAttendance(filters, req.auth!);
      ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  }

  // Leaves
  public static async createLeave(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = CreateLeaveRequestSchema.parse(req.body);
      const leave = await AttendanceService.createLeaveRequest(parsed, req.auth!);
      ApiResponse.success(res, leave, 201);
    } catch (err) {
      next(err);
    }
  }

  public static async approveLeave(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const leaveId = req.params['id'] as string;
      const parsed = ApproveLeaveSchema.parse(req.body);
      const leave = await AttendanceService.approveLeave(leaveId, parsed, req.auth!);
      ApiResponse.success(res, leave);
    } catch (err) {
      next(err);
    }
  }

  public static async listLeaves(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = {
        employeeId: req.query['employeeId'] as string | undefined,
        status: req.query['status'] as LeaveStatus | undefined,
      };
      const leaves = await AttendanceService.listLeaves(filters, req.auth!);
      ApiResponse.success(res, leaves);
    } catch (err) {
      next(err);
    }
  }

  // Reports
  public static async getAttendanceReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const params = {
        centerId: req.query['centerId'] as string | undefined,
        startDate: (req.query['startDate'] as string) || new Date().toISOString().split('T')[0]!,
        endDate: (req.query['endDate'] as string) || new Date().toISOString().split('T')[0]!,
      };
      const report = await AttendanceService.getAttendanceReport(params, req.auth!);
      ApiResponse.success(res, report);
    } catch (err) {
      next(err);
    }
  }
}
