import { type EmployeeAttendance, type EmployeeShift, type EmployeeLeave, AttendanceStatus, EmployeeShiftType, LeaveStatus, LeaveType } from '@dfarm/shared-types';
import type { AuthContext } from '../../middleware/authenticate.js';
export declare class AttendanceService {
    /**
     * 1. Create or get standard shifts for organization
     */
    static createShift(data: {
        code: string;
        name: string;
        startTime: string;
        endTime: string;
        gracePeriodMinutes?: number;
        halfDayThresholdHours?: number;
        fullDayThresholdHours?: number;
    }, auth: AuthContext): Promise<EmployeeShift>;
    static listShifts(auth: AuthContext): Promise<EmployeeShift[]>;
    /**
     * 2. Record daily attendance / check-in / check-out
     */
    static recordAttendance(data: {
        employeeId: string;
        centerId: string;
        attendanceDate: string;
        shiftType?: EmployeeShiftType;
        shiftId?: string | null;
        checkInTime?: string | null;
        checkOutTime?: string | null;
        status?: AttendanceStatus;
        overtimeHours?: number;
        notes?: string | null;
    }, auth: AuthContext): Promise<EmployeeAttendance>;
    /**
     * 3. Manual Attendance Correction with Mandatory Audit Reason
     */
    static correctAttendance(attendanceId: string, data: {
        checkInTime?: string | null;
        checkOutTime?: string | null;
        status?: AttendanceStatus;
        overtimeHours?: number;
        reason: string;
        notes?: string | null;
    }, auth: AuthContext): Promise<EmployeeAttendance>;
    /**
     * 4. List Attendance with Filtering
     */
    static listAttendance(filters: {
        centerId?: string;
        employeeId?: string;
        startDate?: string;
        endDate?: string;
        status?: AttendanceStatus;
        limit?: number;
        offset?: number;
    }, auth: AuthContext): Promise<{
        records: EmployeeAttendance[];
        total: number;
    }>;
    /**
     * 5. Leave Management: Request, Approve, List
     */
    static createLeaveRequest(data: {
        employeeId: string;
        leaveType: LeaveType;
        startDate: string;
        endDate: string;
        daysCount: number;
        reason: string;
    }, auth: AuthContext): Promise<EmployeeLeave>;
    static approveLeave(leaveId: string, action: {
        status: LeaveStatus.APPROVED | LeaveStatus.REJECTED;
        rejectionReason?: string | null;
    }, auth: AuthContext): Promise<EmployeeLeave>;
    static listLeaves(filters: {
        employeeId?: string;
        status?: LeaveStatus;
    }, auth: AuthContext): Promise<EmployeeLeave[]>;
    /**
     * 6. Attendance Summary Report
     */
    static getAttendanceReport(params: {
        centerId?: string;
        startDate: string;
        endDate: string;
    }, auth: AuthContext): Promise<any[]>;
    private static formatAttendance;
    private static formatLeave;
}
//# sourceMappingURL=attendance.service.d.ts.map