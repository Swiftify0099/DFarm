import crypto from 'node:crypto';
import { verifyJwt, signJwt } from './jwt.js';
export function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}
export function generateDeviceToken(deviceId, expiresInSeconds = 30 * 86400) {
    const token = signJwt({ sub: deviceId, type: 'device' }, expiresInSeconds);
    const hashedToken = hashToken(token);
    return { token, hashedToken };
}
export function createDeviceToken(payload) {
    const deviceId = typeof payload === 'string' ? payload : (payload?.sub || crypto.randomUUID());
    return generateDeviceToken(deviceId);
}
export function verifyDeviceToken(token) {
    return verifyJwt(token);
}
//# sourceMappingURL=security.js.map