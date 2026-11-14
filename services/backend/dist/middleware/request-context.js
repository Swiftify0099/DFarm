import crypto from 'node:crypto';
export function requestContextMiddleware(req, res, next) {
    const existingId = req.headers['x-request-id'] || req.headers['x-correlation-id'];
    const requestId = typeof existingId === 'string' && existingId.length > 0
        ? existingId
        : crypto.randomUUID();
    req.id = requestId;
    req.requestId = requestId;
    req.startTime = Date.now();
    res.setHeader('X-Request-Id', requestId);
    next();
}
export const requestContext = requestContextMiddleware;
//# sourceMappingURL=request-context.js.map