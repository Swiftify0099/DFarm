import { IOtpService, ITokenService } from '../../ports/index.js';
export declare class RequestAdminOtpUseCase {
    private readonly otpService;
    constructor(otpService: IOtpService);
    execute(rawPhone: string, _ipAddress?: string): Promise<{
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