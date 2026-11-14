import { rateLimit } from 'express-rate-limit';
import { config } from '../config/env.js';
import { ApiResponse } from '../shared/response/api-response.js';
export const rateLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    limit: process.env.NODE_ENV === 'test' ? 10000 : config.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
        return ApiResponse.error(res, 'RATE_LIMIT_EXCEEDED', 'Too many requests received from this client. Please slow down and try again later.', 429);
    },
});
//# sourceMappingURL=rate-limit.js.map