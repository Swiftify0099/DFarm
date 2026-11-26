import { IOtpService, ITokenService } from '../../ports/index.js';
export interface ResolvedAdminRecord {
    id: string;
    fullName: string;
    organizationId: string | null;
    role: string;
    orgName: string | null;
    orgCode: string | null;
}
export declare function resolveActiveAdminByPhone(e164Phone: string): Promise<ResolvedAdminRecord>;
export declare class RequestAdminOtpUseCase {
    private readonly otpService;
    constructor(otpService: IOtpService);
    execute(rawPhone: string, ipAddress?: string): Promise<{
        success: boolean;
        message: string;
        previewOtp?: string;
    }>;
}
export declare class VerifyAdminOtpUseCase {
    private readonly otpService;
    private readonly tokenService;
    constructor(otpService: IOtpService, tokenService: ITokenService);
    execute(rawPhone: string, otp: string): Promise<{
        token: string;
        refreshToken: string;
        expiresIn: number;
        user: {
            id: string;
            phone: string;
            role: string;
            actorType: string;
            name?: string;
            fullName?: string;
            dairyId?: string;
            dairyName?: string;
            dairyCode?: string;
        };
    }>;
}
//# sourceMappingURL=AdminAuthUseCases.d.ts.map