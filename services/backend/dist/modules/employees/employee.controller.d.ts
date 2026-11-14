import type { Request, Response, NextFunction } from 'express';
export declare class EmployeeController {
    static createEmployee(req: Request, res: Response, next: NextFunction): Promise<void>;
    static listEmployees(req: Request, res: Response, next: NextFunction): Promise<void>;
    static getEmployee(req: Request, res: Response, next: NextFunction): Promise<void>;
    static updateEmployee(req: Request, res: Response, next: NextFunction): Promise<void>;
    static assignRole(req: Request, res: Response, next: NextFunction): Promise<void>;
    static assignCenter(req: Request, res: Response, next: NextFunction): Promise<void>;
    static createSalaryStructure(req: Request, res: Response, next: NextFunction): Promise<void>;
    static getSalaryStructure(req: Request, res: Response, next: NextFunction): Promise<void>;
    static requestAdvance(req: Request, res: Response, next: NextFunction): Promise<void>;
    static approveAdvance(req: Request, res: Response, next: NextFunction): Promise<void>;
    static listAdvances(req: Request, res: Response, next: NextFunction): Promise<void>;
}
//# sourceMappingURL=employee.controller.d.ts.map