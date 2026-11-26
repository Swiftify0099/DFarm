import { HmacJwtTokenService } from '../../infrastructure/security/HmacJwtTokenService.js';
import { UnauthorizedError, ForbiddenError } from '../../domain/errors/index.js';
import { sseTicketService } from '../../infrastructure/security/SseTicketService.js';
import { tokenRevocationService } from '../../infrastructure/security/TokenRevocationService.js';
const tokenService = new HmacJwtTokenService();
export async function authenticate(req, _res, next) {
    try {
        // Never accept query token on standard API endpoints
        const authHeader = req.headers.authorization || req.headers['x-access-token'];
        if (!authHeader) {
            throw new UnauthorizedError('Authorization token required');
        }
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
        const claims = tokenService.verifyToken(token);
        if (claims.tokenType === 'refresh') {
            throw new UnauthorizedError('Refresh tokens cannot be used as access tokens', 'INVALID_TOKEN_TYPE');
        }
        if (await tokenRevocationService.isRevoked(token, claims.jti)) {
            throw new UnauthorizedError('Authentication token has been revoked', 'TOKEN_REVOKED');
        }
        req.user = claims;
        next();
    }
    catch (err) {
        next(err);
    }
}
export async function optionalAuthenticate(req, _res, next) {
    // Never accept query token on standard API endpoints
    const authHeader = req.headers.authorization || req.headers['x-access-token'];
    if (!authHeader) {
        return next();
    }
    try {
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
        const claims = tokenService.verifyToken(token);
        if (claims.tokenType !== 'refresh' && !(await tokenRevocationService.isRevoked(token, claims.jti))) {
            req.user = claims;
        }
    }
    catch {
        // Ignore invalid token in optional auth
    }
    next();
}
/**
 * Dedicated authentication middleware for SSE streaming endpoints (/dairy-admin/events).
 * Rejects raw access tokens in URL query strings (400/401).
 * Accepts:
 *   Option A: Authorization: Bearer <JWT> header (streaming fetch)
 *   Option B: ?ticket=<short_lived_sse_ticket> query parameter (short-lived, single-use, purpose-scoped)
 */
export async function authenticateSseStream(req, res, next) {
    // 1. Explicitly reject normal long-lived tokens in query parameters
    if (req.query.token) {
        res.status(400).json({
            success: false,
            errorCode: 'EXPOSED_QUERY_TOKEN_FORBIDDEN',
            error: 'Long-lived access tokens are strictly forbidden in URL query parameters. Use an SSE ticket or Authorization header.',
        });
        return;
    }
    const authHeader = req.headers.authorization || req.headers['x-access-token'];
    const ticketQuery = req.query.ticket || req.headers['x-sse-ticket'];
    let user = null;
    try {
        if (authHeader) {
            // Option A: Authorization header streaming
            const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
            user = tokenService.verifyToken(token);
            if (user.tokenType === 'refresh') {
                throw new UnauthorizedError('Refresh tokens cannot be used for streaming access');
            }
            if (await tokenRevocationService.isRevoked(token, user.jti)) {
                throw new UnauthorizedError('Authentication token has been revoked');
            }
        }
        else if (ticketQuery) {
            // Option B: Purpose-specific, short-lived SSE ticket (distributed atomic single-use)
            user = await sseTicketService.verifyAndConsumeTicket(ticketQuery);
        }
        else {
            throw new UnauthorizedError('Authentication token or SSE ticket required');
        }
    }
    catch (err) {
        if (err instanceof ForbiddenError) {
            res.status(403).json({ success: false, errorCode: 'FORBIDDEN', error: err.message });
            return;
        }
        res.status(401).json({ success: false, errorCode: 'UNAUTHORIZED', error: err?.message || 'Unauthorized' });
        return;
    }
    // 2. Validate authorized dairy admin role
    const allowedAdminRoles = [
        'PRIMARY_DAIRY_ADMIN',
        'DAIRY_ADMIN',
        'SUPER_ADMIN',
        'DAIRY_OWNER',
        'BRANCH_MANAGER',
        'CENTER_MANAGER',
    ];
    if (!allowedAdminRoles.includes(user.role)) {
        res.status(403).json({
            success: false,
            errorCode: 'ROLE_UNAUTHORIZED',
            error: `Role '${user.role}' is not authorized for dairy admin SSE streaming.`,
        });
        return;
    }
    req.user = user;
    next();
}
//# sourceMappingURL=authenticate.js.map