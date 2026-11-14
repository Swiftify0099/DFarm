import type { Request, Response, NextFunction } from 'express';
export declare class AttendanceController {
    static createShift(req: Request, res: Response, next: NextFunction): Promise<void>;
    static listShifts(req: Request, res: Response, next: NextFunction): Promise<void>;
    static recordAttendance(req: Request, res: Response, next: NextFunction): Promise<void>;
    static correctAttendance(req: Request, res: Response, next: NextFunction): Promise<void>;
    static listAttendance(req: Request, res: Response, next: NextFunction): Promise<void>;
    static createLeave(req: Request, res: Response, next: NextFunction): Promise<void>;
    static approveLeave(req: Request, res: Response, next: NextFunction): Promise<void>;
    static listLeaves(req: Request, res: Response, next: NextFunction): Promise<void>;
    static getAttendanceReport(req: Request, res: Response, next: NextFunction): Promise<void>;
}
//# sourceMappingURL=attendance.controller.d.ts.map