export declare function serializeOtpResponse(result: {
    success: boolean;
    message: string;
    cooldownSeconds?: number;
    expiresAt?: string;
    previewOtp?: string;
}): Record<string, unknown>;
export declare const authRoutes: import("express-serve-static-core").Router;
//# sourceMappingURL=auth.routes.d.ts.map