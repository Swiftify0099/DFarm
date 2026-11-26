/**
 * Deprecated client-side SMS dispatch module.
 * Direct SMS gateway credentials and OTP generation on the client are permanently disabled.
 * All OTP requests must go through the authenticated/rate-limited backend API (/auth/request-otp).
 */
export class DirectDoveSmsService {
  public static async sendDirectDoveOtp(_mobileNumber: string): Promise<{ success: boolean; message: string }> {
    return {
      success: false,
      message: 'Direct client-side SMS dispatch is disabled. Please use the backend OTP endpoint.',
    };
  }

  public static async verifyDirectDoveOtp(_mobileNumber: string, _inputOtp: string): Promise<boolean> {
    return false;
  }
}
