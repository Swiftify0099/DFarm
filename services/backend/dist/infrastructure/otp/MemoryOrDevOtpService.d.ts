import { IOtpService } from '../../application/ports/index.js';
export declare class MemoryOrDevOtpService implements IOtpService {
    private readonly delegate;
    constructor();
    sendOtp(mobileNumber: string, purpose?: 'OPERATOR_LOGIN' | 'CUSTOMER_AUTH' | 'ADMIN_LOGIN'): Promise<{
        success: boolean;
        message: string;
        previewOtp?: string;
    }>;
    verifyOtp(mobileNumber: string, otp: string, purpose?: 'OPERATOR_LOGIN' | 'CUSTOMER_AUTH' | 'ADMIN_LOGIN'): Promise<boolean>;
}
//# sourceMappingURL=MemoryOrDevOtpService.d.ts.map