# DFarm Workflow: Employee Shift, Attendance & Leave Management

## 1. Overview

DFarm provides a 100% software-based attendance, shift scheduling, and leave management system designed specifically for the round-the-clock operations of dairy chilling centers and processing plants.

> **CRITICAL DIRECTIVE**:
> - Physical biometric fingerprint / facial machines are NOT connected.
> - Customer Face Recognition (Phase 06) is strictly prohibited from being repurposed for staff or employee attendance.

---

## 2. Shift Management

Dairy operations operate around morning and evening milking intake windows. Configurable shift types include:
- `MORNING`: Early morning intake window (e.g. 05:00 - 10:00).
- `EVENING`: Evening collection window (e.g. 16:00 - 21:00).
- `GENERAL`: Standard 8-hour administrative / maintenance shift (e.g. 09:00 - 18:00 with 1 hour break).
- `NIGHT`: Overnight security, cooling plant monitoring, or CIP (Clean-in-Place) sanitation shift.
- `SPLIT`: Morning intake + Evening intake with afternoon break.

### Creating a Shift
```http
POST /api/v1/attendance/shifts
Authorization: Bearer <Admin_or_Manager_Token>
Content-Type: application/json

{
  "centerId": "23ab84bb-7fbf-4043-9828-944a9937a092",
  "shiftName": "Morning Intake Shift",
  "shiftType": "MORNING",
  "startTime": "05:30",
  "endTime": "10:30",
  "gracePeriodMinutes": 15
}
```

---

## 3. Daily Attendance Lifecycle

### Clock-In & Clock-Out
1. **Clock-In (`POST /api/v1/attendance`)**:
   - Recorded by Center Manager or Supervisor on behalf of staff, or via authenticated self-service kiosk.
   - Evaluates arrival against shift start time + `gracePeriodMinutes`. If late, sets `isLateArrival = true`.
2. **Clock-Out**:
   - Automatically computes `total_hours = (check_out_time - check_in_time) - break_minutes`.
   - If clocked out before shift end, flags `isEarlyDeparture = true`.
   - If total hours exceed standard shift duration (e.g. 8.0 hours), excess hours are logged as `overtime_hours`.

### Attendance Statuses
- `PRESENT`: Standard attended shift.
- `HALF_DAY`: Attended 4 to 6 hours or marked half day.
- `LATE`: Arrival beyond grace threshold.
- `ABSENT`: Unexcused absence.
- `ON_LEAVE`: Excused leave approved by supervisor.
- `HOLIDAY` / `WEEK_OFF`: Scheduled day off.

---

## 4. Manual Attendance Correction & Mandatory Audit Trail

Manual edits to past attendance records frequently occur due to forgot-to-clock-in or field emergencies. To prevent fraud:
1. Every correction requires an authorized supervisor or manager (`CENTER_MANAGER`, `DAIRY_ADMIN`, `DAIRY_OWNER`).
2. A descriptive `reason` (minimum 5 characters) is **strictly mandatory**.
3. All prior values (`previous_check_in_time`, `previous_check_out_time`, `previous_status`, `previous_total_hours`) are atomically snapshot into `employee_attendance_audits`.

### API Request Example
```http
PUT /api/v1/attendance/11ae2e6f-b06f-49c8-9f26-007ba18457be/correct
Authorization: Bearer <Center_Manager_Token>
Content-Type: application/json

{
  "checkInTime": "2026-11-01T06:00:00.000Z",
  "checkOutTime": "2026-11-01T15:00:00.000Z",
  "totalHours": 8.5,
  "overtimeHours": 0.5,
  "status": "PRESENT",
  "reason": "Supervisor confirmed employee was on-site collecting evening cans from Route 4"
}
```

---

## 5. Leave Management & Overlap Prevention

### Leave Request Flow
1. Staff or supervisor submits a leave request specifying `leaveType` (`CASUAL`, `SICK`, `EARNED`, `MATERNITY`, `PATERNITY`, `UNPAID`).
2. **Overlap Validation**: The system checks `employee_leaves` for any existing request with status `PENDING` or `APPROVED` intersecting `[startDate, endDate]`. If overlapping dates exist, the submission is rejected with `LEAVE_DATES_OVERLAP` (HTTP 409).
3. **Approval**: Center Manager or Admin approves or rejects the leave via `PUT /api/v1/attendance/leaves/:id/approve`.
4. Approved leaves are integrated into the payroll engine to grant paid leave or apply unpaid leave salary deductions.
