import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pg from 'pg';
import crypto from 'node:crypto';
import { createApp } from '../dist/app.js';
import { signJwt } from '../dist/jwt.js';
import { pool } from '../dist/db.js';

const { Client } = pg;
const dbClient = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
});

async function query(text, params) {
  return dbClient.query(text, params);
}

test('DFARM Phase 16: Employee Management, Staff Access, Attendance & Payroll Suite', async (t) => {
  await dbClient.connect();
  t.after(async () => {
    await dbClient.end();
    await pool.end();
  });

  const app = createApp();
  const runSuffix = Date.now().toString().slice(-6);

  let orgId = '';
  let center1Id = '';
  let center2Id = '';

  let ownerUserId = '';
  let adminUserId = '';
  let managerCenter1UserId = '';
  let operatorUserId = '';

  let ownerToken = '';
  let adminToken = '';
  let managerCenter1Token = '';
  let operatorToken = '';

  let testEmployee1Id = '';
  let testEmployeeCode1 = `EMP-T1-${runSuffix}`;
  let testEmployee2Id = '';
  let testEmployeeCode2 = `EMP-T2-${runSuffix}`;

  let testShiftId = '';
  let testAttendanceId = '';
  let testLeaveId = '';
  let testAdvanceId = '';
  let testPayrollRunId = '';
  let testPayslipId = '';

  await t.test('0. Setup Test Organization, Centers, and Staff Users', async () => {
    // 1. Create a dedicated unique test organization for test isolation
    const insOrg = await query(
      `INSERT INTO organizations (name, code, status)
       VALUES ($1, $2, 'ACTIVE') RETURNING id`,
      [`Sangli Dairy Union P16 ${runSuffix}`, `SDCU_${runSuffix}`]
    );
    orgId = insOrg.rows[0].id;

    // 2. Create two dedicated centers
    const insC1 = await query(
      `INSERT INTO dairy_centers (organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone)
       VALUES ($1, $2, 'Center 1', 'Main Road', 'Tasgaon', 'Sangli', 'Maharashtra', '416416', '+919876543210')
       RETURNING id`,
      [orgId, `C1_${runSuffix}`]
    );
    center1Id = insC1.rows[0].id;

    const insC2 = await query(
      `INSERT INTO dairy_centers (organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone)
       VALUES ($1, $2, 'Center 2', 'Station Road', 'Miraj', 'Sangli', 'Maharashtra', '416410', '+919876543211')
       RETURNING id`,
      [orgId, `C2_${runSuffix}`]
    );
    center2Id = insC2.rows[0].id;

    // 3. Create Users
    // Dairy Owner
    ownerUserId = crypto.randomUUID();
    await query(
      `INSERT INTO users (id, organization_id, username, full_name, email, phone_number, role, status)
       VALUES ($1, $2, $3, 'P16 Dairy Owner', 'owner_p16_${runSuffix}@dfarm.local', '+919811111111', 'DAIRY_OWNER', 'ACTIVE')
       ON CONFLICT (username) DO NOTHING`,
      [ownerUserId, orgId, `owner_p16_${runSuffix}`]
    );
    ownerToken = signJwt({
      sub: ownerUserId,
      userId: ownerUserId,
      organizationId: orgId,
      role: 'DAIRY_OWNER',
      centerIds: [center1Id, center2Id],
    });

    // Dairy Admin
    adminUserId = crypto.randomUUID();
    await query(
      `INSERT INTO users (id, organization_id, username, full_name, email, phone_number, role, status)
       VALUES ($1, $2, $3, 'P16 Dairy Admin', 'admin_p16_${runSuffix}@dfarm.local', '+919822222222', 'DAIRY_ADMIN', 'ACTIVE')
       ON CONFLICT (username) DO NOTHING`,
      [adminUserId, orgId, `admin_p16_${runSuffix}`]
    );
    adminToken = signJwt({
      sub: adminUserId,
      userId: adminUserId,
      organizationId: orgId,
      role: 'DAIRY_ADMIN',
      centerIds: [center1Id, center2Id],
    });

    // Center 1 Manager
    managerCenter1UserId = crypto.randomUUID();
    await query(
      `INSERT INTO users (id, organization_id, username, full_name, email, phone_number, role, status)
       VALUES ($1, $2, $3, 'P16 Center 1 Manager', 'mgr_p16_${runSuffix}@dfarm.local', '+919833333333', 'CENTER_MANAGER', 'ACTIVE')
       ON CONFLICT (username) DO NOTHING`,
      [managerCenter1UserId, orgId, `mgr_p16_${runSuffix}`]
    );
    managerCenter1Token = signJwt({
      sub: managerCenter1UserId,
      userId: managerCenter1UserId,
      organizationId: orgId,
      role: 'CENTER_MANAGER',
      centerIds: [center1Id],
    });

    // Collection Operator
    operatorUserId = crypto.randomUUID();
    await query(
      `INSERT INTO users (id, organization_id, username, full_name, email, phone_number, role, status)
       VALUES ($1, $2, $3, 'P16 Operator', 'op_p16_${runSuffix}@dfarm.local', '+919844444444', 'COLLECTION_OPERATOR', 'ACTIVE')
       ON CONFLICT (username) DO NOTHING`,
      [operatorUserId, orgId, `op_p16_${runSuffix}`]
    );
    operatorToken = signJwt({
      sub: operatorUserId,
      userId: operatorUserId,
      organizationId: orgId,
      role: 'COLLECTION_OPERATOR',
      centerIds: [center1Id],
    });

    assert.ok(orgId, 'Organization ID should exist');
    assert.ok(center1Id, 'Center 1 ID should exist');
    assert.ok(center2Id, 'Center 2 ID should exist');
  });

  await t.test('1. Employee Creation with Validation & Emergency Contact Policy', async () => {
    const res = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        employeeCode: testEmployeeCode1,
        firstName: 'Ramesh',
        lastName: 'Patil',
        mobileNumber: '+919876500001',
        email: `ramesh_${runSuffix}@dfarm.local`,
        nationalIdMask: '123456789012', // Should be masked to XXXX-XXXX-9012
        designation: 'Senior Center Operator',
        department: 'OPERATIONS',
        joiningDate: '2026-01-01',
        primaryCenterId: center1Id,
        emergencyContactName: 'Sunita Patil',
        emergencyContactPhone: '+919876500099',
        emergencyContactRelation: 'Spouse',
        emergencyContactApproved: true,
        bankName: 'State Bank of India',
        bankAccountNumberMask: '1234567890', // Should be masked to XXXXXX7890
        bankIfsc: 'SBIN0001234',
      });

    assert.equal(res.status, 201, `Expected 201 Created: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.employeeCode, testEmployeeCode1);
    assert.equal(res.body.data.fullName, 'Ramesh Patil');
    assert.equal(res.body.data.nationalIdMask, 'XXXX-XXXX-9012');
    assert.equal(res.body.data.bankAccountNumberMask, 'XXXXXX7890');
    assert.equal(res.body.data.emergencyContactApproved, true);
    assert.equal(res.body.data.emergencyContactName, 'Sunita Patil');

    testEmployee1Id = res.body.data.id;
  });

  await t.test('2. Duplicate Employee Code Rejection', async () => {
    const res = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        employeeCode: testEmployeeCode1, // Same code!
        firstName: 'Another',
        lastName: 'Patil',
        mobileNumber: '+919876500002',
        designation: 'Junior Operator',
        department: 'OPERATIONS',
        joiningDate: '2026-02-01',
      });

    assert.equal(res.status, 409, 'Duplicate employee code should be rejected with 409 Conflict');
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'DUPLICATE_EMPLOYEE_CODE');
  });

  await t.test('3. Role Authorization: Operator Denied Employee Creation', async () => {
    const res = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        firstName: 'Unauthorized',
        lastName: 'Creation',
        mobileNumber: '+919876500003',
        designation: 'Staff',
        department: 'ADMIN',
        joiningDate: '2026-01-01',
      });

    assert.equal(res.status, 403, 'Operator should be forbidden from creating employees');
    assert.equal(res.body.success, false);
  });

  await t.test('4. Center Isolation: Center 1 Manager cannot access Center 2 Employee', async () => {
    // Create employee in Center 2
    const resC2 = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        employeeCode: testEmployeeCode2,
        firstName: 'Suresh',
        lastName: 'Kadam',
        mobileNumber: '+919876500004',
        designation: 'Center 2 Staff',
        department: 'OPERATIONS',
        joiningDate: '2026-01-15',
        primaryCenterId: center2Id,
      });

    assert.equal(resC2.status, 201);
    testEmployee2Id = resC2.body.data.id;

    // Center 1 Manager tries to get Center 2 employee
    const resGet = await request(app)
      .get(`/api/v1/employees/${testEmployee2Id}`)
      .set('Authorization', `Bearer ${managerCenter1Token}`);

    assert.equal(resGet.status, 403, 'Center Manager must be forbidden from accessing employee outside assigned center');
    assert.equal(resGet.body.error.code, 'CENTER_ACCESS_DENIED');
  });

  await t.test('5. Role Assignment & Self-Promotion Prevention', async () => {
    // Assign role to test employee 1 (Owner assigns Supervisor)
    const resRole = await request(app)
      .post(`/api/v1/employees/${testEmployee1Id}/role`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        role: 'SUPERVISOR',
        centerIds: [center1Id],
      });

    assert.equal(resRole.status, 200);
    assert.equal(resRole.body.data.role, 'SUPERVISOR');
    const linkedUserId = resRole.body.data.userId;
    assert.ok(linkedUserId, 'User account should be linked');

    // Self-promotion attempt: user logs in as test employee and tries to upgrade to DAIRY_OWNER
    const empUserToken = signJwt({
      sub: linkedUserId,
      userId: linkedUserId,
      organizationId: orgId,
      role: 'SUPERVISOR',
      centerIds: [center1Id],
    });

    const resSelfPromote = await request(app)
      .post(`/api/v1/employees/${testEmployee1Id}/role`)
      .set('Authorization', `Bearer ${empUserToken}`)
      .send({
        role: 'DAIRY_OWNER',
      });

    assert.equal(resSelfPromote.status, 403, 'Self-promotion attempt must be rejected with 403 Forbidden');
  });

  await t.test('6. Shift Creation & Attendance Recording', async () => {
    // 1. Create Shift
    const shiftRes = await request(app)
      .post('/api/v1/attendance/shifts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        code: `SHF_${runSuffix}`,
        name: 'Morning General Shift',
        startTime: '08:00',
        endTime: '16:00',
        gracePeriodMinutes: 15,
        halfDayThresholdHours: 4.0,
        fullDayThresholdHours: 8.0,
      });

    assert.equal(shiftRes.status, 201);
    testShiftId = shiftRes.body.data.id;

    // 2. Record daily attendance (Check In at 08:05, Check Out at 17:05 -> 9 hours, 1h overtime)
    const attRes = await request(app)
      .post('/api/v1/attendance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeId: testEmployee1Id,
        centerId: center1Id,
        attendanceDate: '2026-11-01',
        shiftType: 'GENERAL',
        shiftId: testShiftId,
        checkInTime: '2026-11-01T08:05:00.000Z',
        checkOutTime: '2026-11-01T17:05:00.000Z',
        status: 'PRESENT',
        overtimeHours: 1.0,
        notes: 'Regular attendance with 1h OT',
      });

    assert.equal(attRes.status, 201);
    assert.equal(attRes.body.data.status, 'PRESENT');
    assert.equal(attRes.body.data.totalHours, 9.0);
    assert.equal(attRes.body.data.overtimeHours, 1.0);
    testAttendanceId = attRes.body.data.id;
  });

  await t.test('7. Manual Attendance Correction Requires Reason and Records Audit Trail', async () => {
    // 1. Attempt without reason (should fail)
    const failRes = await request(app)
      .put(`/api/v1/attendance/${testAttendanceId}/correct`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'HALF_DAY',
        reason: 'bad', // less than 5 characters!
      });

    assert.equal(failRes.status, 400, 'Correction with short/missing reason should be rejected');

    // 2. Valid correction with reason
    const okRes = await request(app)
      .put(`/api/v1/attendance/${testAttendanceId}/correct`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'PRESENT',
        overtimeHours: 2.0,
        reason: 'Authorized additional 1 hour overtime for emergency milk tank maintenance',
      });

    assert.equal(okRes.status, 200);
    assert.equal(okRes.body.data.isManualCorrection, true);
    assert.equal(okRes.body.data.overtimeHours, 2.0);

    // 3. Verify audit log was recorded in database
    const auditRes = await query(
      'SELECT * FROM employee_attendance_audits WHERE attendance_id = $1',
      [testAttendanceId]
    );
    assert.equal(auditRes.rows.length, 1, 'Exactly one audit log entry must be present');
    assert.equal(auditRes.rows[0].action, 'MANUAL_CORRECTION');
    assert.equal(auditRes.rows[0].actor_id, adminUserId);
    assert.match(auditRes.rows[0].reason, /emergency milk tank maintenance/);
  });

  await t.test('8. Leave Management: Request, Overlap Prevention & Approval', async () => {
    // 1. Submit leave request
    const leaveRes = await request(app)
      .post('/api/v1/attendance/leaves')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeId: testEmployee1Id,
        leaveType: 'CASUAL',
        startDate: '2026-11-10',
        endDate: '2026-11-11',
        daysCount: 2.0,
        reason: 'Family function in hometown',
      });

    assert.equal(leaveRes.status, 201);
    assert.equal(leaveRes.body.data.status, 'PENDING');
    testLeaveId = leaveRes.body.data.id;

    // 2. Overlapping leave request should be rejected with 409 Conflict
    const dupRes = await request(app)
      .post('/api/v1/attendance/leaves')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeId: testEmployee1Id,
        leaveType: 'SICK',
        startDate: '2026-11-11',
        endDate: '2026-11-12',
        daysCount: 2.0,
        reason: 'Flu symptoms',
      });

    assert.equal(dupRes.status, 409, 'Overlapping leave dates must be rejected');
    assert.equal(dupRes.body.error.code, 'LEAVE_DATES_OVERLAP');

    // 3. Approve leave
    const appRes = await request(app)
      .put(`/api/v1/attendance/leaves/${testLeaveId}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        status: 'APPROVED',
      });

    assert.equal(appRes.status, 200);
    assert.equal(appRes.body.data.status, 'APPROVED');
  });

  await t.test('9. Salary Structure Creation with PostgreSQL NUMERIC', async () => {
    const salRes = await request(app)
      .post(`/api/v1/employees/${testEmployee1Id}/salary-structure`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        employeeId: testEmployee1Id,
        calculationBasis: 'MONTHLY',
        baseSalary: 24000.0,
        hra: 4800.0,
        travelAllowance: 2400.0,
        specialAllowance: 1800.0,
        medicalAllowance: 1000.0,
        providentFundEmployee: 2880.0,
        professionalTax: 200.0,
        tdsTax: 500.0,
        otherDeductions: 0.0,
        overtimeHourlyRate: 150.0,
        effectiveFrom: '2026-01-01',
      });

    assert.equal(salRes.status, 201);
    assert.equal(salRes.body.data.baseSalary, 24000.0);
    // Gross = 24000 + 4800 + 2400 + 1800 + 1000 = 34000.00
    assert.equal(salRes.body.data.grossSalary, 34000.0);
  });

  await t.test('10. Employee Advance Request & Maker-Checker Self-Approval Rejection', async () => {
    // 1. Admin initiates advance for employee
    const advRes = await request(app)
      .post(`/api/v1/employees/${testEmployee1Id}/advances`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeId: testEmployee1Id,
        amount: 6000.0,
        monthlyInstallment: 2000.0,
        reason: 'Medical emergency advance for family medication',
      });

    assert.equal(advRes.status, 201);
    assert.equal(advRes.body.data.status, 'PENDING_APPROVAL');
    testAdvanceId = advRes.body.data.id;

    // 2. Admin tries to approve their own initiated advance (Maker-Checker violation!)
    const selfAppRes = await request(app)
      .post(`/api/v1/employees/advances/${testAdvanceId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'APPROVED',
      });

    assert.equal(selfAppRes.status, 403, 'Initiator self-approval must be rejected');
    assert.equal(selfAppRes.body.error.code, 'SELF_APPROVAL_PROHIBITED');

    // 3. Dairy Owner approves (valid second checker)
    const ownerAppRes = await request(app)
      .post(`/api/v1/employees/advances/${testAdvanceId}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        status: 'APPROVED',
      });

    assert.equal(ownerAppRes.status, 200);
    assert.equal(ownerAppRes.body.data.status, 'ACTIVE');
    assert.equal(ownerAppRes.body.data.remainingBalance, 6000.0);
  });

  await t.test('11. Payroll Lifecycle: Initiate (DRAFT) & Duplicate Prevention', async () => {
    // 1. Initiate November 2026 run for Center 1
    const runRes = await request(app)
      .post('/api/v1/payroll')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        centerId: center1Id,
        year: 2026,
        month: 11,
        notes: 'November 2026 Center 1 Regular Staff Payroll',
      });

    assert.equal(runRes.status, 201);
    assert.equal(runRes.body.data.status, 'DRAFT');
    assert.equal(runRes.body.data.year, 2026);
    assert.equal(runRes.body.data.month, 11);
    testPayrollRunId = runRes.body.data.id;

    // 2. Duplicate payroll run attempt for same org, center, year, month must fail
    const dupRes = await request(app)
      .post('/api/v1/payroll')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        centerId: center1Id,
        year: 2026,
        month: 11,
      });

    assert.equal(dupRes.status, 409, 'Duplicate payroll run for same period must be rejected with 409');
    assert.equal(dupRes.body.error.code, 'DUPLICATE_PAYROLL_RUN');
  });

  await t.test('12. Payroll Calculation with Attendance, Overtime & Advance Recovery', async () => {
    // Populate additional attendance records for employee 1 in November 2026 so present days = 25
    for (let day = 2; day <= 25; day++) {
      const dayStr = day.toString().padStart(2, '0');
      await query(
        `INSERT INTO employee_attendance (
          organization_id, center_id, employee_id, attendance_date, shift_type,
          check_in_time, check_out_time, total_hours, status
        ) VALUES ($1, $2, $3, $4, 'GENERAL', $5, $6, 8.0, 'PRESENT')
        ON CONFLICT (employee_id, attendance_date, shift_type) DO NOTHING`,
        [
          orgId,
          center1Id,
          testEmployee1Id,
          `2026-11-${dayStr}`,
          `2026-11-${dayStr}T08:00:00Z`,
          `2026-11-${dayStr}T16:00:00Z`,
        ]
      );
    }

    const calcRes = await request(app)
      .post(`/api/v1/payroll/${testPayrollRunId}/calculate`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(calcRes.status, 200);
    assert.equal(calcRes.body.data.status, 'UNDER_REVIEW');
    assert.ok(calcRes.body.data.totalEmployees >= 1);
    assert.ok(calcRes.body.data.totalNetSalary > 0);

    // Fetch run details and payslips
    const detailsRes = await request(app)
      .get(`/api/v1/payroll/${testPayrollRunId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(detailsRes.status, 200);
    const ps = detailsRes.body.data.payslips.find((p) => p.employeeId === testEmployee1Id);
    assert.ok(ps, 'Payslip for test employee 1 must exist');
    testPayslipId = ps.id;

    // Verify itemized calculations
    assert.ok(ps.grossEarnings > 0);
    assert.ok(ps.totalDeductions > 0);
    assert.equal(ps.advanceRecovery, 2000.0, 'Should deduct monthly installment of 2000 from active advance');
    assert.equal(ps.paymentStatus, 'PENDING');
  });

  await t.test('13. Payroll Approval: Maker-Checker Rejection for Initiator Self-Approval', async () => {
    // Admin was the initiator of testPayrollRunId, so Admin cannot approve
    const selfAppRes = await request(app)
      .post(`/api/v1/payroll/${testPayrollRunId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'APPROVE' });

    assert.equal(selfAppRes.status, 403, 'Payroll initiator cannot approve their own payroll run');
    assert.equal(selfAppRes.body.error.code, 'SELF_APPROVAL_PROHIBITED');
  });

  await t.test('14. Payroll Approval by Authorized Checker (Dairy Owner)', async () => {
    const ownerAppRes = await request(app)
      .post(`/api/v1/payroll/${testPayrollRunId}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ action: 'APPROVE', notes: 'Approved after verifying attendance & advance deductions' });

    assert.equal(ownerAppRes.status, 200);
    assert.equal(ownerAppRes.body.data.status, 'APPROVED');
  });

  await t.test('15. Payroll Finalization & Advance Recovery Balance Reduction', async () => {
    const finRes = await request(app)
      .post(`/api/v1/payroll/${testPayrollRunId}/finalize`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ notes: 'Locked and finalized for bank disbursement' });

    assert.equal(finRes.status, 200);
    assert.equal(finRes.body.data.status, 'FINALIZED');

    // Check advance balance reduction in database
    const advRes = await query('SELECT remaining_balance, recovered_amount FROM employee_advances WHERE id = $1', [
      testAdvanceId,
    ]);
    assert.equal(parseFloat(advRes.rows[0].recovered_amount), 2000.0);
    assert.equal(parseFloat(advRes.rows[0].remaining_balance), 4000.0); // 6000 - 2000 = 4000
  });

  await t.test('16. Historical Payroll Preservation', async () => {
    // Modify employee's salary structure for future
    await request(app)
      .post(`/api/v1/employees/${testEmployee1Id}/salary-structure`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        employeeId: testEmployee1Id,
        calculationBasis: 'MONTHLY',
        baseSalary: 50000.0, // Substantial raise
        effectiveFrom: '2026-12-01',
      });

    // Verify finalized payslip for November 2026 was NOT altered
    const psRes = await request(app)
      .get(`/api/v1/payroll/payslips/${testPayslipId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(psRes.status, 200);
    assert.equal(psRes.body.data.baseSalary, 24000.0, 'Historical base salary on finalized payslip must remain unchanged');
  });

  await t.test('17. Salary Disbursement into Dedicated Employee Financial Table', async () => {
    const psRes = await request(app)
      .get(`/api/v1/payroll/payslips/${testPayslipId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const netAmount = psRes.body.data.netSalary;

    const disburseRes = await request(app)
      .post('/api/v1/payroll/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        payrollRunId: testPayrollRunId,
        payslipId: testPayslipId,
        employeeId: testEmployee1Id,
        amount: netAmount,
        paymentMethod: 'BANK_TRANSFER',
        transactionId: `NEFT_EMP_${runSuffix}`,
        bankName: 'State Bank of India',
        bankAccountMask: 'XXXXXX7890',
        bankIfsc: 'SBIN0001234',
        notes: 'Disbursed via corporate payroll banking portal',
      });

    assert.equal(disburseRes.status, 201);
    assert.equal(disburseRes.body.data.status, 'COMPLETED');
    assert.equal(disburseRes.body.data.amount, netAmount);
    assert.ok(disburseRes.body.data.paymentReference.startsWith('EPAY-'));

    // Verify payslip marked as PAID
    const updatedPs = await request(app)
      .get(`/api/v1/payroll/payslips/${testPayslipId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(updatedPs.body.data.paymentStatus, 'PAID');
  });

  await t.test('18. Customer Ledger Isolation Verification', async () => {
    // Strictly verify that NO entries were inserted into customer financial tables:
    // 1. customer_ledger_accounts
    // 2. ledger_transactions
    // 3. customer_payouts
    const ledgerTxCheck = await query(
      `SELECT COUNT(*)::int as count FROM ledger_transactions
       WHERE reference_id = $1 OR reference_id = $2`,
      [testPayrollRunId, testPayslipId]
    );
    assert.equal(
      ledgerTxCheck.rows[0].count,
      0,
      'Employee payroll operations must NEVER create entries in customer ledger_transactions'
    );

    const custPayoutCheck = await query(
      `SELECT COUNT(*)::int as count FROM customer_payouts
       WHERE recipient_name ILIKE '%Patil%' AND reference_number ILIKE 'EPAY%'`,
      []
    );
    assert.equal(
      custPayoutCheck.rows[0].count,
      0,
      'Employee payouts must never be written into customer_payouts table'
    );
  });
});
