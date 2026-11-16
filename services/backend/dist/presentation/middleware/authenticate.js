import { HmacJwtTokenService } from '../../infrastructure/security/HmacJwtTokenService.js';
import { UnauthorizedError } from '../../domain/errors/index.js';
const tokenService = new HmacJwtTokenService();
export function authenticate(req, _res, next) {
    const authHeader = req.headers.authorization || req.headers['x-access-token'];
    if (!authHeader) {
        throw new UnauthorizedError('Authorization token required');
    }
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const claims = tokenService.verifyToken(token);
    req.user = claims;
    next();
}
export function optionalAuthenticate(req, _res, next) {
    const authHeader = req.headers.authorization || req.headers['x-access-token'];
    if (!authHeader) {
        return next();
    }
    try {
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
        const claims = tokenService.verifyToken(token);
        req.user = claims;
    }
    catch {
        // Ignore invalid token in optional auth
    }
    next();
}
//# sourceMappingURL=authenticate.js.map