export class ApiResponse {
    static success(res, data, statusCode = 200, meta = {}) {
        const requestId = res.req?.id;
        const body = {
            success: true,
            data,
            meta: {
                requestId,
                timestamp: new Date().toISOString(),
                ...meta,
            },
        };
        return res.status(statusCode).json(body);
    }
    static created(res, data, meta = {}) {
        return ApiResponse.success(res, data, 201, meta);
    }
    static error(res, code, message, statusCode = 400, details, meta = {}) {
        const requestId = res.req?.id;
        const body = {
            success: false,
            error: {
                code,
                message,
                ...(details !== undefined ? { details } : {}),
            },
            meta: {
                requestId,
                timestamp: new Date().toISOString(),
                ...meta,
            },
        };
        return res.status(statusCode).json(body);
    }
}
//# sourceMappingURL=api-response.js.map