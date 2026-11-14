import { type Employee, EmploymentStatus, EmploymentType, UserRole } from '@dfarm/shared-types';
import type { AuthContext } from '../../middleware/authenticate.js';
export declare class EmployeeService {
    /**
     * Register a new employee
     */
    static createEmployee(data: {
        employeeCode?: string;
        firstName: string;
        lastName: string;
        mobileNumber: string;
        email?: string | null;
        nationalIdMask?: string | null;
        addressLine1?: string | null;
        addressLine2?: string | null;
        city?: string | null;
        state?: string | null;
        postalCode?: string | null;
        joiningDate: string;
        employmentStatus?: EmploymentStatus;
        employmentType?: EmploymentType;
        designation: string;
        department: string;
        primaryCenterId?: string | null;
        emergencyContactName?: string | null;
        emergencyContactPhone?: string | null;
        emergencyContactRelation?: string | null;
        emergencyContactApproved?: boolean;
        bankName?: string | null;
        bankAccountNumberMask?: string | null;
        bankIfsc?: string | null;
        role?: UserRole;
        createUserAccount?: boolean;
        username?: string;
    }, auth: AuthContext): Promise<Employee>;
    /**
     * List employees with filtering and center scoping
     */
    static listEmployees(filters: {
        centerId?: string;
        department?: string;
        status?: EmploymentStatus;
        search?: string;
        limit?: number;
        offset?: number;
    }, auth: AuthContext): Promise<{
        employees: Employee[];
        total: number;
    }>;
    /**
     * Get employee by ID
     */
    static getEmployeeById(id: string, auth: AuthContext): Promise<Employee>;
    /**
     * Update employee details
     */
    static updateEmployee(id: string, updates: Partial<{
        firstName: string;
        lastName: string;
        mobileNumber: string;
        email: string | null;
        nationalIdMask: string | null;
        addressLine1: string | null;
        addressLine2: string | null;
        city: string | null;
        state: string | null;
        postalCode: string | null;
        joiningDate: string;
        terminationDate: string | null;
        employmentStatus: EmploymentStatus;
        employmentType: EmploymentType;
        designation: string;
        department: string;
        primaryCenterId: string | null;
        emergencyContactName: string | null;
        emergencyContactPhone: string | null;
        emergencyContactRelation: string | null;
        emergencyContactApproved: boolean;
        bankName: string | null;
        bankAccountNumberMask: string | null;
        bankIfsc: string | null;
    }>, auth: AuthContext): Promise<Employee>;
    /**
     * Assign or update employee roles
     * CRITICAL SECURITY RULE:
     * - Only authorized administrators (SUPER_ADMIN, DAIRY_OWNER, DAIRY_ADMIN) can assign roles.
     * - Users CANNOT promote themselves or modify their own role.
     */
    static assignRole(employeeId: string, roleData: {
        role: UserRole;
        centerIds?: string[];
        primaryCenterId?: string;
    }, auth: AuthContext): Promise<Employee>;
    /**
     * Assign centers to an employee
     */
    static assignCenter(employeeId: string, centerId: string, isPrimary: boolean, auth: AuthContext): Promise<void>;
    private static formatEmployee;
}
//# sourceMappingURL=employee.service.d.ts.map