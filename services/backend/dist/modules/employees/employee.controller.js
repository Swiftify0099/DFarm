import { EmployeeService } from './employee.service.js';
import { SalaryService } from './salary.service.js';
import { ApiResponse } from '../../shared/response/api-response.js';
import { CreateEmployeeSchema, UpdateEmployeeSchema, AssignEmployeeRoleSchema, AssignEmployeeCenterSchema, CreateSalaryStructureSchema, CreateEmployeeAdvanceSchema, ApproveEmployeeAdvanceSchema, } from '@dfarm/shared-validation';
export class EmployeeController {
    static async createEmployee(req, res, next) {
        try {
            const parsed = CreateEmployeeSchema.parse(req.body);
            const employee = await EmployeeService.createEmployee(parsed, req.auth);
            ApiResponse.success(res, employee, 201);
        }
        catch (err) {
            next(err);
        }
    }
    static async listEmployees(req, res, next) {
        try {
            const filters = {
                centerId: req.query['centerId'],
                department: req.query['department'],
                status: req.query['status'],
                search: req.query['search'],
                limit: req.query['limit'] ? parseInt(req.query['limit'], 10) : undefined,
                offset: req.query['offset'] ? parseInt(req.query['offset'], 10) : undefined,
            };
            const result = await EmployeeService.listEmployees(filters, req.auth);
            ApiResponse.success(res, result);
        }
        catch (err) {
            next(err);
        }
    }
    static async getEmployee(req, res, next) {
        try {
            const employeeId = req.params['id'];
            const employee = await EmployeeService.getEmployeeById(employeeId, req.auth);
            ApiResponse.success(res, employee);
        }
        catch (err) {
            next(err);
        }
    }
    static async updateEmployee(req, res, next) {
        try {
            const employeeId = req.params['id'];
            const parsed = UpdateEmployeeSchema.parse(req.body);
            const employee = await EmployeeService.updateEmployee(employeeId, parsed, req.auth);
            ApiResponse.success(res, employee);
        }
        catch (err) {
            next(err);
        }
    }
    static async assignRole(req, res, next) {
        try {
            const employeeId = req.params['id'];
            const parsed = AssignEmployeeRoleSchema.parse(req.body);
            const employee = await EmployeeService.assignRole(employeeId, parsed, req.auth);
            ApiResponse.success(res, employee);
        }
        catch (err) {
            next(err);
        }
    }
    static async assignCenter(req, res, next) {
        try {
            const employeeId = req.params['id'];
            const parsed = AssignEmployeeCenterSchema.parse(req.body);
            await EmployeeService.assignCenter(employeeId, parsed.centerId, parsed.isPrimary, req.auth);
            ApiResponse.success(res, { success: true, message: 'Center assigned successfully' });
        }
        catch (err) {
            next(err);
        }
    }
    // Salary structures
    static async createSalaryStructure(req, res, next) {
        try {
            const parsed = CreateSalaryStructureSchema.parse(req.body);
            const structure = await SalaryService.createSalaryStructure(parsed, req.auth);
            ApiResponse.success(res, structure, 201);
        }
        catch (err) {
            next(err);
        }
    }
    static async getSalaryStructure(req, res, next) {
        try {
            const employeeId = req.params['id'];
            const structure = await SalaryService.getSalaryStructure(employeeId, req.auth);
            ApiResponse.success(res, structure);
        }
        catch (err) {
            next(err);
        }
    }
    // Employee advances
    static async requestAdvance(req, res, next) {
        try {
            const parsed = CreateEmployeeAdvanceSchema.parse(req.body);
            const advance = await SalaryService.requestAdvance(parsed, req.auth);
            ApiResponse.success(res, advance, 201);
        }
        catch (err) {
            next(err);
        }
    }
    static async approveAdvance(req, res, next) {
        try {
            const advanceId = req.params['advanceId'];
            const parsed = ApproveEmployeeAdvanceSchema.parse(req.body);
            const advance = await SalaryService.approveAdvance(advanceId, parsed, req.auth);
            ApiResponse.success(res, advance);
        }
        catch (err) {
            next(err);
        }
    }
    static async listAdvances(req, res, next) {
        try {
            const filters = {
                employeeId: req.query['employeeId'],
                status: req.query['status'],
            };
            const advances = await SalaryService.listAdvances(filters, req.auth);
            ApiResponse.success(res, advances);
        }
        catch (err) {
            next(err);
        }
    }
}
//# sourceMappingURL=employee.controller.js.map