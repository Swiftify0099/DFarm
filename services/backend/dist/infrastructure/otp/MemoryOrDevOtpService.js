import { doveOtpService } from './DoveOtpService.js';
export class MemoryOrDevOtpService {
    delegate;
    constructor() {
        this.delegate = doveOtpService;
    }
    async sendOtp(mobileNumber, purpose = 'CUSTOMER_AUTH') {
        return this.delegate.sendOtp(mobileNumber, purpose);
    }
    async verifyOtp(mobileNumber, otp, purpose = 'CUSTOMER_AUTH') {
        return this.delegate.verifyOtp(mobileNumber, otp, purpose);
    }
}
//# sourceMappingURL=MemoryOrDevOtpService.js.map