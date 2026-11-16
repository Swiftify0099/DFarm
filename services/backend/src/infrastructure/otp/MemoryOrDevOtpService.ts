import { IOtpService } from '../../application/ports/index.js';
import { doveOtpService, DoveOtpService } from './DoveOtpService.js';

export class MemoryOrDevOtpService implements IOtpService {
  private readonly delegate: DoveOtpService;

  constructor() {
    this.delegate = doveOtpService;
  }

  public async sendOtp(
    mobileNumber: string,
    purpose: 'OPERATOR_LOGIN' | 'CUSTOMER_AUTH' | 'ADMIN_LOGIN' = 'CUSTOMER_AUTH'
  ): Promise<{ success: boolean; message: string; previewOtp?: string }> {
    return this.delegate.sendOtp(mobileNumber, purpose);
  }

  public async verifyOtp(
    mobileNumber: string,
    otp: string,
    purpose: 'OPERATOR_LOGIN' | 'CUSTOMER_AUTH' | 'ADMIN_LOGIN' = 'CUSTOMER_AUTH'
  ): Promise<boolean> {
    return this.delegate.verifyOtp(mobileNumber, otp, purpose);
  }
}
