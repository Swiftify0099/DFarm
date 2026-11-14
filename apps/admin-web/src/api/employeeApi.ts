import { apiClient } from './client.js';
import {
  type Employee,
  type EmployeeAttendance,
  type EmployeeShift,
  type EmployeeLeave,
  type EmployeeSalaryStructure,
  type EmployeeAdvance,
  type PayrollRun,
  type EmployeePayslip,
  type EmployeeSalaryPayment,
  type LeaveStatus,
} from '@dfarm/shared-types';

export const employeeApi = {
  // 1. Employee Directory
  getEmployees: (params?: { centerId?: string; department?: string; status?: string; search?: string; limit?: number; offset?: number }) =>
    apiClient.get<{ employees: Employee[]; total: number }>('/employees', params),

  getEmployeeById: (employeeId: string) =>
    apiClient.get<Employee>(`/employees/${employeeId}`),

  createEmployee: (data: any) =>
    apiClient.post<Employee>('/employees', data),

  updateEmployee: (employeeId: string, data: any) =>
    apiClient.put<Employee>(`/employees/${employeeId}`, data),

  assignRole: (employeeId: string, data: { role: string; centerIds?: string[]; primaryCenterId?: string }) =>
    apiClient.post<Employee>(`/employees/${employeeId}/role`, data),

  assignCenter: (employeeId: string, data: { centerId: string; isPrimary: boolean }) =>
    apiClient.post<{ success: boolean; message: string }>(`/employees/${employeeId}/centers`, data),

  // 2. Attendance & Shifts
  getShifts: () =>
    apiClient.get<EmployeeShift[]>('/attendance/shifts'),

  createShift: (data: any) =>
    apiClient.post<EmployeeShift>('/attendance/shifts', data),

  getAttendance: (params?: { centerId?: string; employeeId?: string; startDate?: string; endDate?: string; status?: string; limit?: number; offset?: number }) =>
    apiClient.get<{ records: EmployeeAttendance[]; total: number }>('/attendance', params),

  recordAttendance: (data: any) =>
    apiClient.post<EmployeeAttendance>('/attendance', data),

  correctAttendance: (attendanceId: string, data: { checkInTime?: string | null; checkOutTime?: string | null; status?: string; overtimeHours?: number; reason: string; notes?: string }) =>
    apiClient.put<EmployeeAttendance>(`/attendance/${attendanceId}/correct`, data),

  getAttendanceSummary: (params: { centerId?: string; startDate: string; endDate: string }) =>
    apiClient.get<any[]>('/attendance/reports/summary', params),

  // 3. Leaves
  getLeaves: (params?: { employeeId?: string; status?: string }) =>
    apiClient.get<EmployeeLeave[]>('/attendance/leaves', params),

  createLeave: (data: any) =>
    apiClient.post<EmployeeLeave>('/attendance/leaves', data),

  approveLeave: (leaveId: string, data: { status: LeaveStatus.APPROVED | LeaveStatus.REJECTED; rejectionReason?: string | null }) =>
    apiClient.put<EmployeeLeave>(`/attendance/leaves/${leaveId}/approve`, data),

  // 4. Compensation & Advances
  getSalaryStructure: (employeeId: string) =>
    apiClient.get<EmployeeSalaryStructure | null>(`/employees/${employeeId}/salary-structure`),

  createSalaryStructure: (employeeId: string, data: any) =>
    apiClient.post<EmployeeSalaryStructure>(`/employees/${employeeId}/salary-structure`, data),

  getAdvances: (params?: { employeeId?: string; status?: string }) =>
    apiClient.get<EmployeeAdvance[]>('/employees/advances', params),

  requestAdvance: (employeeId: string, data: any) =>
    apiClient.post<EmployeeAdvance>(`/employees/${employeeId}/advances`, data),

  approveAdvance: (advanceId: string, data: { status: string; disbursedAmount?: number }) =>
    apiClient.post<EmployeeAdvance>(`/employees/advances/${advanceId}/approve`, data),

  // 5. Payroll Lifecycle
  getPayrollRuns: (params?: { centerId?: string; year?: number }) =>
    apiClient.get<PayrollRun[]>('/payroll', params),

  getPayrollRunById: (runId: string) =>
    apiClient.get<{ run: PayrollRun; payslips: EmployeePayslip[] }>(`/payroll/${runId}`),

  initiatePayrollRun: (data: { centerId?: string | null; year: number; month: number; notes?: string | null }) =>
    apiClient.post<PayrollRun>('/payroll', data),

  calculatePayrollRun: (runId: string) =>
    apiClient.post<PayrollRun>(`/payroll/${runId}/calculate`),

  approvePayrollRun: (runId: string, data: { action: 'APPROVE' | 'REJECT'; notes?: string | null }) =>
    apiClient.post<PayrollRun>(`/payroll/${runId}/approve`, data),

  finalizePayrollRun: (runId: string, data?: { notes?: string | null }) =>
    apiClient.post<PayrollRun>(`/payroll/${runId}/finalize`, data || {}),

  getPayslip: (payslipId: string) =>
    apiClient.get<EmployeePayslip>(`/payroll/payslips/${payslipId}`),

  recordSalaryPayment: (data: {
    payrollRunId: string;
    payslipId: string;
    employeeId: string;
    amount: number;
    paymentMethod?: string;
    transactionId?: string | null;
    bankName?: string | null;
    bankAccountMask?: string | null;
    bankIfsc?: string | null;
    notes?: string | null;
  }) => apiClient.post<EmployeeSalaryPayment>('/payroll/payments', data),
};
