import { AttendanceService } from './attendance.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { CreateShiftSchema, RecordAttendanceSchema, AttendanceCorrectionSchema, CreateLeaveRequestSchema, ApproveLeaveSchema, } from '@dfarm/shared-validation';
export class AttendanceController {
    // Shifts
    static async createShift(req, res, next) {
        try {
            const parsed = CreateShiftSchema.parse(req.body);
            const shift = await AttendanceService.createShift(parsed, req.auth);
            ApiResponse.success(res, shift, 201);
        }
        catch (err) {
            next(err);
        }
    }
    static async listShifts(req, res, next) {
        try {
            const shifts = await AttendanceService.listShifts(req.auth);
            ApiResponse.success(res, shifts);
        }
        catch (err) {
            next(err);
        }
    }
    // Attendance
    static async recordAttendance(req, res, next) {
        try {
            const parsed = RecordAttendanceSchema.parse(req.body);
            const attendance = await AttendanceService.recordAttendance(parsed, req.auth);
            ApiResponse.success(res, attendance, 201);
        }
        catch (err) {
            next(err);
        }
    }
    static async correctAttendance(req, res, next) {
        try {
            const attendanceId = req.params['id'];
            const parsed = AttendanceCorrectionSchema.parse(req.body);
            const attendance = await AttendanceService.correctAttendance(attendanceId, parsed, req.auth);
            ApiResponse.success(res, attendance);
        }
        catch (err) {
            next(err);
        }
    }
    static async listAttendance(req, res, next) {
        try {
            const filters = {
                centerId: req.query['centerId'],
                employeeId: req.query['employeeId'],
                startDate: req.query['startDate'],
                endDate: req.query['endDate'],
                status: req.query['status'],
                limit: req.query['limit'] ? parseInt(req.query['limit'], 10) : undefined,
                offset: req.query['offset'] ? parseInt(req.query['offset'], 10) : undefined,
            };
            const result = await AttendanceService.listAttendance(filters, req.auth);
            ApiResponse.success(res, result);
        }
        catch (err) {
            next(err);
        }
    }
    // Leaves
    static async createLeave(req, res, next) {
        try {
            const parsed = CreateLeaveRequestSchema.parse(req.body);
            const leave = await AttendanceService.createLeaveRequest(parsed, req.auth);
            ApiResponse.success(res, leave, 201);
        }
        catch (err) {
            next(err);
        }
    }
    static async approveLeave(req, res, next) {
        try {
            const leaveId = req.params['id'];
            const parsed = ApproveLeaveSchema.parse(req.body);
            const leave = await AttendanceService.approveLeave(leaveId, parsed, req.auth);
            ApiResponse.success(res, leave);
        }
        catch (err) {
            next(err);
        }
    }
    static async listLeaves(req, res, next) {
        try {
            const filters = {
                employeeId: req.query['employeeId'],
                status: req.query['status'],
            };
            const leaves = await AttendanceService.listLeaves(filters, req.auth);
            ApiResponse.success(res, leaves);
        }
        catch (err) {
            next(err);
        }
    }
    // Reports
    static async getAttendanceReport(req, res, next) {
        try {
            const params = {
                centerId: req.query['centerId'],
                startDate: req.query['startDate'] || new Date().toISOString().split('T')[0],
                endDate: req.query['endDate'] || new Date().toISOString().split('T')[0],
            };
            const report = await AttendanceService.getAttendanceReport(params, req.auth);
            ApiResponse.success(res, report);
        }
        catch (err) {
            next(err);
        }
    }
}
//# sourceMappingURL=attendance.controller.js.map