import { apiClient } from './client.js';
export const employeeApi = {
    // 1. Employee Directory
    getEmployees: (params) => apiClient.get('/employees', params),
    getEmployeeById: (employeeId) => apiClient.get(`/employees/${employeeId}`),
    createEmployee: (data) => apiClient.post('/employees', data),
    updateEmployee: (employeeId, data) => apiClient.put(`/employees/${employeeId}`, data),
    assignRole: (employeeId, data) => apiClient.post(`/employees/${employeeId}/role`, data),
    assignCenter: (employeeId, data) => apiClient.post(`/employees/${employeeId}/centers`, data),
    // 2. Attendance & Shifts
    getShifts: () => apiClient.get('/attendance/shifts'),
    createShift: (data) => apiClient.post('/attendance/shifts', data),
    getAttendance: (params) => apiClient.get('/attendance', params),
    recordAttendance: (data) => apiClient.post('/attendance', data),
    correctAttendance: (attendanceId, data) => apiClient.put(`/attendance/${attendanceId}/correct`, data),
    getAttendanceSummary: (params) => apiClient.get('/attendance/reports/summary', params),
    // 3. Leaves
    getLeaves: (params) => apiClient.get('/attendance/leaves', params),
    createLeave: (data) => apiClient.post('/attendance/leaves', data),
    approveLeave: (leaveId, data) => apiClient.put(`/attendance/leaves/${leaveId}/approve`, data),
    // 4. Compensation & Advances
    getSalaryStructure: (employeeId) => apiClient.get(`/employees/${employeeId}/salary-structure`),
    createSalaryStructure: (employeeId, data) => apiClient.post(`/employees/${employeeId}/salary-structure`, data),
    getAdvances: (params) => apiClient.get('/employees/advances', params),
    requestAdvance: (employeeId, data) => apiClient.post(`/employees/${employeeId}/advances`, data),
    approveAdvance: (advanceId, data) => apiClient.post(`/employees/advances/${advanceId}/approve`, data),
    // 5. Payroll Lifecycle
    getPayrollRuns: (params) => apiClient.get('/payroll', params),
    getPayrollRunById: (runId) => apiClient.get(`/payroll/${runId}`),
    initiatePayrollRun: (data) => apiClient.post('/payroll', data),
    calculatePayrollRun: (runId) => apiClient.post(`/payroll/${runId}/calculate`),
    approvePayrollRun: (runId, data) => apiClient.post(`/payroll/${runId}/approve`, data),
    finalizePayrollRun: (runId, data) => apiClient.post(`/payroll/${runId}/finalize`, data || {}),
    getPayslip: (payslipId) => apiClient.get(`/payroll/payslips/${payslipId}`),
    recordSalaryPayment: (data) => apiClient.post('/payroll/payments', data),
};
//# sourceMappingURL=employeeApi.js.map