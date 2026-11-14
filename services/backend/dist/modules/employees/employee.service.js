import { pool } from '../../db.js';
import { EmploymentStatus, EmploymentType, UserRole, } from '@dfarm/shared-types';
import { NotFoundError, ForbiddenError, ConflictError, } from '../../shared/errors/app-error.js';
export class EmployeeService {
    /**
     * Register a new employee
     */
    static async createEmployee(data, auth) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const organizationId = auth.organizationId;
            // 1. Center verification if provided
            if (data.primaryCenterId) {
                const centerRes = await client.query('SELECT id FROM dairy_centers WHERE id = $1 AND organization_id = $2', [data.primaryCenterId, organizationId]);
                if (centerRes.rows.length === 0) {
                    throw new NotFoundError(`Center '${data.primaryCenterId}' not found in organization`, 'CENTER_NOT_FOUND');
                }
            }
            // 2. Generate or validate employee code
            let employeeCode = data.employeeCode?.trim();
            if (!employeeCode) {
                const countRes = await client.query('SELECT COUNT(*)::int AS count FROM employees WHERE organization_id = $1', [organizationId]);
                const seq = (countRes.rows[0].count + 1).toString().padStart(4, '0');
                employeeCode = `EMP-${seq}`;
            }
            // Check unique employee code in org
            const existingCode = await client.query('SELECT id FROM employees WHERE organization_id = $1 AND employee_code = $2', [organizationId, employeeCode]);
            if (existingCode.rows.length > 0) {
                throw new ConflictError(`Employee code '${employeeCode}' already exists in this organization`, 'DUPLICATE_EMPLOYEE_CODE');
            }
            const fullName = `${data.firstName.trim()} ${data.lastName.trim()}`;
            // Emergency contact policy: only approved if explicitly flagged
            const emergencyApproved = Boolean(data.emergencyContactApproved);
            // Mask sensitive fields if raw passed
            const nationalIdMask = data.nationalIdMask
                ? (data.nationalIdMask.length > 4 ? `XXXX-XXXX-${data.nationalIdMask.slice(-4)}` : data.nationalIdMask)
                : null;
            const bankMask = data.bankAccountNumberMask
                ? (data.bankAccountNumberMask.length > 4 ? `XXXXXX${data.bankAccountNumberMask.slice(-4)}` : data.bankAccountNumberMask)
                : null;
            // 3. Insert Employee
            const empInsert = await client.query(`INSERT INTO employees (
          organization_id, primary_center_id, employee_code, first_name, last_name, full_name,
          mobile_number, email, national_id_mask, address_line1, address_line2, city, state, postal_code,
          joining_date, employment_status, employment_type, designation, department,
          emergency_contact_name, emergency_contact_phone, emergency_contact_relation, emergency_contact_approved,
          bank_name, bank_account_number_mask, bank_ifsc, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19,
          $20, $21, $22, $23,
          $24, $25, $26, $27
        ) RETURNING *`, [
                organizationId,
                data.primaryCenterId || null,
                employeeCode,
                data.firstName.trim(),
                data.lastName.trim(),
                fullName,
                data.mobileNumber.trim(),
                data.email?.trim() || null,
                nationalIdMask,
                data.addressLine1 || null,
                data.addressLine2 || null,
                data.city || null,
                data.state || null,
                data.postalCode || null,
                data.joiningDate,
                data.employmentStatus || EmploymentStatus.ACTIVE,
                data.employmentType || EmploymentType.FULL_TIME,
                data.designation.trim(),
                data.department.trim(),
                emergencyApproved ? (data.emergencyContactName || null) : null,
                emergencyApproved ? (data.emergencyContactPhone || null) : null,
                emergencyApproved ? (data.emergencyContactRelation || null) : null,
                emergencyApproved,
                data.bankName || null,
                bankMask,
                data.bankIfsc || null,
                auth.userId,
            ]);
            const employee = empInsert.rows[0];
            // 4. Primary Center Assignment
            if (data.primaryCenterId) {
                await client.query(`INSERT INTO employee_center_assignments (employee_id, center_id, is_primary)
           VALUES ($1, $2, TRUE)
           ON CONFLICT (employee_id, center_id) DO NOTHING`, [employee.id, data.primaryCenterId]);
            }
            // 5. Optional Staff User Creation
            if (data.createUserAccount && data.role) {
                // Enforce admin permission for user creation
                if (auth.role !== UserRole.SUPER_ADMIN &&
                    auth.role !== UserRole.DAIRY_OWNER &&
                    auth.role !== UserRole.DAIRY_ADMIN) {
                    throw new ForbiddenError('Only Dairy Owner or Dairy Admin can create staff logins for employees', 'STAFF_CREATION_FORBIDDEN');
                }
                const username = data.username?.trim() || employeeCode.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const userInsert = await client.query(`INSERT INTO users (organization_id, username, full_name, email, phone_number, role, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
           RETURNING id`, [
                    organizationId,
                    username,
                    fullName,
                    data.email || `${username}@dfarm.local`,
                    data.mobileNumber.trim(),
                    data.role,
                ]);
                const newUserId = userInsert.rows[0].id;
                await client.query('UPDATE employees SET user_id = $1 WHERE id = $2', [newUserId, employee.id]);
                employee.user_id = newUserId;
                if (data.primaryCenterId) {
                    await client.query(`INSERT INTO user_center_assignments (user_id, center_id, is_primary)
             VALUES ($1, $2, TRUE)
             ON CONFLICT (user_id, center_id) DO NOTHING`, [newUserId, data.primaryCenterId]);
                }
            }
            await client.query('COMMIT');
            return this.formatEmployee(employee, data.primaryCenterId ? [data.primaryCenterId] : []);
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * List employees with filtering and center scoping
     */
    static async listEmployees(filters, auth) {
        const params = [auth.organizationId];
        let query = `
      SELECT e.*, u.role as user_role,
        COALESCE(
          json_agg(DISTINCT eca.center_id) FILTER (WHERE eca.center_id IS NOT NULL),
          '[]'::json
        ) AS assigned_center_ids
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN employee_center_assignments eca ON e.id = eca.employee_id
      WHERE e.organization_id = $1
    `;
        // Center restriction for center-scoped actors
        if (auth.role !== UserRole.SUPER_ADMIN && auth.role !== UserRole.DAIRY_OWNER && auth.role !== UserRole.DAIRY_ADMIN) {
            params.push(auth.centerIds);
            query += ` AND (e.primary_center_id = ANY($${params.length}) OR eca.center_id = ANY($${params.length}))`;
        }
        else if (filters.centerId) {
            params.push(filters.centerId);
            query += ` AND (e.primary_center_id = $${params.length} OR eca.center_id = $${params.length})`;
        }
        if (filters.department) {
            params.push(filters.department);
            query += ` AND e.department = $${params.length}`;
        }
        if (filters.status) {
            params.push(filters.status);
            query += ` AND e.employment_status = $${params.length}`;
        }
        if (filters.search) {
            params.push(`%${filters.search}%`);
            query += ` AND (e.full_name ILIKE $${params.length} OR e.employee_code ILIKE $${params.length} OR e.mobile_number ILIKE $${params.length})`;
        }
        query += ` GROUP BY e.id, u.role ORDER BY e.created_at DESC`;
        const countQuery = `SELECT COUNT(DISTINCT e.id)::int as total FROM (${query}) sub`;
        const countRes = await pool.query(countQuery, params);
        const total = countRes.rows[0]?.total || 0;
        const limit = Math.min(filters.limit || 50, 100);
        const offset = filters.offset || 0;
        params.push(limit);
        params.push(offset);
        query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
        const res = await pool.query(query, params);
        const employees = res.rows.map((row) => this.formatEmployee(row, row.assigned_center_ids));
        return { employees, total };
    }
    /**
     * Get employee by ID
     */
    static async getEmployeeById(id, auth) {
        const res = await pool.query(`SELECT e.*, u.role as user_role,
        COALESCE(
          json_agg(DISTINCT eca.center_id) FILTER (WHERE eca.center_id IS NOT NULL),
          '[]'::json
        ) AS assigned_center_ids
       FROM employees e
       LEFT JOIN users u ON e.user_id = u.id
       LEFT JOIN employee_center_assignments eca ON e.id = eca.employee_id
       WHERE e.id = $1 AND e.organization_id = $2
       GROUP BY e.id, u.role`, [id, auth.organizationId]);
        if (res.rows.length === 0) {
            throw new NotFoundError(`Employee '${id}' not found`, 'EMPLOYEE_NOT_FOUND');
        }
        const row = res.rows[0];
        const assignedCenters = row.assigned_center_ids || [];
        // Center isolation check
        if (auth.role !== UserRole.SUPER_ADMIN && auth.role !== UserRole.DAIRY_OWNER && auth.role !== UserRole.DAIRY_ADMIN) {
            const hasAccess = (row.primary_center_id && auth.centerIds.includes(row.primary_center_id)) ||
                assignedCenters.some((c) => auth.centerIds.includes(c));
            if (!hasAccess) {
                throw new ForbiddenError('Actor does not have access to this employee center', 'CENTER_ACCESS_DENIED');
            }
        }
        // Load active salary structure if actor is authorized
        let salaryStructure;
        if (auth.role === UserRole.SUPER_ADMIN ||
            auth.role === UserRole.DAIRY_OWNER ||
            auth.role === UserRole.DAIRY_ADMIN ||
            auth.role === UserRole.ACCOUNTANT ||
            row.user_id === auth.userId) {
            const salRes = await pool.query(`SELECT * FROM employee_salary_structures WHERE employee_id = $1 AND is_active = TRUE LIMIT 1`, [id]);
            if (salRes.rows.length > 0) {
                const s = salRes.rows[0];
                salaryStructure = {
                    id: s.id,
                    organizationId: s.organization_id,
                    employeeId: s.employee_id,
                    calculationBasis: s.calculation_basis,
                    baseSalary: parseFloat(s.base_salary),
                    hra: parseFloat(s.hra),
                    travelAllowance: parseFloat(s.travel_allowance),
                    specialAllowance: parseFloat(s.special_allowance),
                    medicalAllowance: parseFloat(s.medical_allowance),
                    grossSalary: parseFloat(s.gross_salary),
                    providentFundEmployee: parseFloat(s.provident_fund_employee),
                    professionalTax: parseFloat(s.professional_tax),
                    tdsTax: parseFloat(s.tds_tax),
                    otherDeductions: parseFloat(s.other_deductions),
                    overtimeHourlyRate: parseFloat(s.overtime_hourly_rate),
                    effectiveFrom: s.effective_from,
                    effectiveTo: s.effective_to,
                    isActive: s.is_active,
                    createdBy: s.created_by,
                    createdAt: s.created_at.toISOString(),
                    updatedAt: s.updated_at.toISOString(),
                };
            }
        }
        const employee = this.formatEmployee(row, assignedCenters);
        employee.salaryStructure = salaryStructure;
        return employee;
    }
    /**
     * Update employee details
     */
    static async updateEmployee(id, updates, auth) {
        const existing = await this.getEmployeeById(id, auth);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const setClauses = ['updated_by = $2', 'updated_at = NOW()'];
            const values = [id, auth.userId];
            let paramIdx = 3;
            if (updates.firstName !== undefined || updates.lastName !== undefined) {
                const fn = updates.firstName ?? existing.firstName;
                const ln = updates.lastName ?? existing.lastName;
                setClauses.push(`first_name = $${paramIdx++}`, `last_name = $${paramIdx++}`, `full_name = $${paramIdx++}`);
                values.push(fn, ln, `${fn} ${ln}`);
            }
            if (updates.mobileNumber !== undefined) {
                setClauses.push(`mobile_number = $${paramIdx++}`);
                values.push(updates.mobileNumber);
            }
            if (updates.email !== undefined) {
                setClauses.push(`email = $${paramIdx++}`);
                values.push(updates.email);
            }
            if (updates.nationalIdMask !== undefined) {
                const mask = updates.nationalIdMask && updates.nationalIdMask.length > 4
                    ? `XXXX-XXXX-${updates.nationalIdMask.slice(-4)}`
                    : updates.nationalIdMask;
                setClauses.push(`national_id_mask = $${paramIdx++}`);
                values.push(mask);
            }
            if (updates.addressLine1 !== undefined) {
                setClauses.push(`address_line1 = $${paramIdx++}`);
                values.push(updates.addressLine1);
            }
            if (updates.addressLine2 !== undefined) {
                setClauses.push(`address_line2 = $${paramIdx++}`);
                values.push(updates.addressLine2);
            }
            if (updates.city !== undefined) {
                setClauses.push(`city = $${paramIdx++}`);
                values.push(updates.city);
            }
            if (updates.state !== undefined) {
                setClauses.push(`state = $${paramIdx++}`);
                values.push(updates.state);
            }
            if (updates.postalCode !== undefined) {
                setClauses.push(`postal_code = $${paramIdx++}`);
                values.push(updates.postalCode);
            }
            if (updates.joiningDate !== undefined) {
                setClauses.push(`joining_date = $${paramIdx++}`);
                values.push(updates.joiningDate);
            }
            if (updates.terminationDate !== undefined) {
                setClauses.push(`termination_date = $${paramIdx++}`);
                values.push(updates.terminationDate);
            }
            if (updates.employmentStatus !== undefined) {
                setClauses.push(`employment_status = $${paramIdx++}`);
                values.push(updates.employmentStatus);
            }
            if (updates.employmentType !== undefined) {
                setClauses.push(`employment_type = $${paramIdx++}`);
                values.push(updates.employmentType);
            }
            if (updates.designation !== undefined) {
                setClauses.push(`designation = $${paramIdx++}`);
                values.push(updates.designation);
            }
            if (updates.department !== undefined) {
                setClauses.push(`department = $${paramIdx++}`);
                values.push(updates.department);
            }
            if (updates.primaryCenterId !== undefined) {
                if (updates.primaryCenterId) {
                    const cCheck = await client.query('SELECT id FROM dairy_centers WHERE id = $1 AND organization_id = $2', [updates.primaryCenterId, auth.organizationId]);
                    if (cCheck.rows.length === 0) {
                        throw new NotFoundError('Center not found in organization', 'CENTER_NOT_FOUND');
                    }
                }
                setClauses.push(`primary_center_id = $${paramIdx++}`);
                values.push(updates.primaryCenterId);
            }
            if (updates.emergencyContactApproved !== undefined) {
                setClauses.push(`emergency_contact_approved = $${paramIdx++}`);
                values.push(updates.emergencyContactApproved);
            }
            if (updates.emergencyContactName !== undefined) {
                setClauses.push(`emergency_contact_name = $${paramIdx++}`);
                values.push(updates.emergencyContactName);
            }
            if (updates.emergencyContactPhone !== undefined) {
                setClauses.push(`emergency_contact_phone = $${paramIdx++}`);
                values.push(updates.emergencyContactPhone);
            }
            if (updates.emergencyContactRelation !== undefined) {
                setClauses.push(`emergency_contact_relation = $${paramIdx++}`);
                values.push(updates.emergencyContactRelation);
            }
            if (updates.bankName !== undefined) {
                setClauses.push(`bank_name = $${paramIdx++}`);
                values.push(updates.bankName);
            }
            if (updates.bankAccountNumberMask !== undefined) {
                const mask = updates.bankAccountNumberMask && updates.bankAccountNumberMask.length > 4
                    ? `XXXXXX${updates.bankAccountNumberMask.slice(-4)}`
                    : updates.bankAccountNumberMask;
                setClauses.push(`bank_account_number_mask = $${paramIdx++}`);
                values.push(mask);
            }
            if (updates.bankIfsc !== undefined) {
                setClauses.push(`bank_ifsc = $${paramIdx++}`);
                values.push(updates.bankIfsc);
            }
            await client.query(`UPDATE employees SET ${setClauses.join(', ')} WHERE id = $1 AND organization_id = '${auth.organizationId}'`, values);
            await client.query('COMMIT');
            return this.getEmployeeById(id, auth);
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * Assign or update employee roles
     * CRITICAL SECURITY RULE:
     * - Only authorized administrators (SUPER_ADMIN, DAIRY_OWNER, DAIRY_ADMIN) can assign roles.
     * - Users CANNOT promote themselves or modify their own role.
     */
    static async assignRole(employeeId, roleData, auth) {
        // 1. Check actor authorization
        if (auth.role !== UserRole.SUPER_ADMIN &&
            auth.role !== UserRole.DAIRY_OWNER &&
            auth.role !== UserRole.DAIRY_ADMIN) {
            throw new ForbiddenError('Only Dairy Owner or Dairy Admin are authorized to assign staff roles', 'INSUFFICIENT_PRIVILEGES');
        }
        const employee = await this.getEmployeeById(employeeId, auth);
        // 2. SELF-PROMOTION PREVENTION CHECK
        if (employee.userId && employee.userId === auth.userId) {
            throw new ForbiddenError('Self-promotion is strictly prohibited. Users cannot modify their own administrative role.', 'CANNOT_PROMOTE_SELF');
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            let userId = employee.userId;
            if (!userId) {
                // Create user identity for the employee
                const username = employee.employeeCode.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const userInsert = await client.query(`INSERT INTO users (organization_id, username, full_name, email, phone_number, role, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
           RETURNING id`, [
                    auth.organizationId,
                    username,
                    employee.fullName,
                    employee.email || `${username}@dfarm.local`,
                    employee.mobileNumber,
                    roleData.role,
                ]);
                userId = userInsert.rows[0].id;
                await client.query('UPDATE employees SET user_id = $1 WHERE id = $2', [userId, employeeId]);
            }
            else {
                // Update existing user role
                await client.query(`UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3`, [roleData.role, userId, auth.organizationId]);
            }
            // Assign centers to user if specified
            if (roleData.centerIds && roleData.centerIds.length > 0) {
                for (const cId of roleData.centerIds) {
                    const isPrimary = cId === (roleData.primaryCenterId || employee.primaryCenterId);
                    await client.query(`INSERT INTO user_center_assignments (user_id, center_id, is_primary)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, center_id) DO UPDATE SET is_primary = $3`, [userId, cId, isPrimary]);
                    await client.query(`INSERT INTO employee_center_assignments (employee_id, center_id, is_primary)
             VALUES ($1, $2, $3)
             ON CONFLICT (employee_id, center_id) DO UPDATE SET is_primary = $3`, [employeeId, cId, isPrimary]);
                }
            }
            await client.query('COMMIT');
            return this.getEmployeeById(employeeId, auth);
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * Assign centers to an employee
     */
    static async assignCenter(employeeId, centerId, isPrimary, auth) {
        const employee = await this.getEmployeeById(employeeId, auth);
        // Verify center belongs to organization
        const centerRes = await pool.query('SELECT id FROM dairy_centers WHERE id = $1 AND organization_id = $2', [centerId, auth.organizationId]);
        if (centerRes.rows.length === 0) {
            throw new NotFoundError('Center not found in organization', 'CENTER_NOT_FOUND');
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            if (isPrimary) {
                await client.query('UPDATE employee_center_assignments SET is_primary = FALSE WHERE employee_id = $1', [employeeId]);
                await client.query('UPDATE employees SET primary_center_id = $1 WHERE id = $2', [centerId, employeeId]);
            }
            await client.query(`INSERT INTO employee_center_assignments (employee_id, center_id, is_primary)
         VALUES ($1, $2, $3)
         ON CONFLICT (employee_id, center_id) DO UPDATE SET is_primary = $3`, [employeeId, centerId, isPrimary]);
            if (employee.userId) {
                if (isPrimary) {
                    await client.query('UPDATE user_center_assignments SET is_primary = FALSE WHERE user_id = $1', [employee.userId]);
                }
                await client.query(`INSERT INTO user_center_assignments (user_id, center_id, is_primary)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, center_id) DO UPDATE SET is_primary = $3`, [employee.userId, centerId, isPrimary]);
            }
            await client.query('COMMIT');
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    static formatEmployee(row, assignedCenters = []) {
        return {
            id: row.id,
            organizationId: row.organization_id,
            primaryCenterId: row.primary_center_id,
            userId: row.user_id,
            employeeCode: row.employee_code,
            firstName: row.first_name,
            lastName: row.last_name,
            fullName: row.full_name,
            mobileNumber: row.mobile_number,
            email: row.email,
            nationalIdMask: row.national_id_mask,
            addressLine1: row.address_line1,
            addressLine2: row.address_line2,
            city: row.city,
            state: row.state,
            postalCode: row.postal_code,
            joiningDate: row.joining_date instanceof Date ? row.joining_date.toISOString().split('T')[0] : row.joining_date,
            terminationDate: row.termination_date instanceof Date ? row.termination_date.toISOString().split('T')[0] : row.termination_date,
            employmentStatus: row.employment_status,
            employmentType: row.employment_type,
            designation: row.designation,
            department: row.department,
            emergencyContactName: row.emergency_contact_approved ? row.emergency_contact_name : null,
            emergencyContactPhone: row.emergency_contact_approved ? row.emergency_contact_phone : null,
            emergencyContactRelation: row.emergency_contact_approved ? row.emergency_contact_relation : null,
            emergencyContactApproved: row.emergency_contact_approved,
            bankName: row.bank_name,
            bankAccountNumberMask: row.bank_account_number_mask,
            bankIfsc: row.bank_ifsc,
            createdBy: row.created_by,
            updatedBy: row.updated_by,
            createdAt: row.created_at.toISOString(),
            updatedAt: row.updated_at.toISOString(),
            assignedCenterIds: Array.isArray(assignedCenters) ? assignedCenters : [],
            role: row.user_role || undefined,
        };
    }
}
//# sourceMappingURL=employee.service.js.map