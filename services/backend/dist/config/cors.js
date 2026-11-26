import { config } from './env.js';
export const PRODUCTION_ALLOWED_ORIGINS = [
    'https://collection.dfarm.in',
    'https://dairy.dfarm.in',
    'https://admin.dfarm.in',
    'https://dfarm-collection.pages.dev',
    'https://dfarm-dairy-admin.pages.dev',
    'https://dfarm-super-admin.pages.dev',
];
const LOCALHOST_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
export function getAllowedCorsOrigins() {
    const isProduction = config.NODE_ENV === 'production' || process.env['NODE_ENV'] === 'production';
    const rawOrigins = process.env['CORS_ALLOWED_ORIGINS'] ?? config.CORS_ALLOWED_ORIGINS;
    const parsed = rawOrigins
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0 && origin !== '*');
    if (!isProduction) {
        return parsed;
    }
    // In production, strip any localhost/loopback or non-HTTPS origins and fall back to explicit production domains
    const prodConfigured = parsed.filter((origin) => origin.startsWith('https://') && !LOCALHOST_ORIGIN_REGEX.test(origin));
    return prodConfigured.length > 0 ? prodConfigured : [...PRODUCTION_ALLOWED_ORIGINS];
}
export function isOriginAllowed(requestOrigin) {
    // Allow non-browser tools (curl, postman, server-to-server, mobile native, tests) with no origin header
    if (!requestOrigin) {
        return true;
    }
    const isProduction = config.NODE_ENV === 'production' || process.env['NODE_ENV'] === 'production';
    const allowedOrigins = getAllowedCorsOrigins();
    if (allowedOrigins.includes(requestOrigin)) {
        return true;
    }
    // Restrict localhost / development origins strictly to non-production environments
    if (!isProduction) {
        return true;
    }
    return false;
}
export const corsOptions = {
    origin: (requestOrigin, callback) => {
        if (isOriginAllowed(requestOrigin)) {
            return callback(null, true);
        }
        return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-Id',
        'Accept',
        'X-Dairy-Tenant-ID',
        'X-Dairy-Tenant-Id',
        'x-dairy-tenant-id',
        'X-Dairy-Id',
        'x-dairy-id',
        'X-Organization-Id',
        'x-organization-id',
        'X-Tenant-Id',
        'x-tenant-id',
        'X-Center-Id',
        'x-center-id',
        'X-Farmer-Id',
        'x-farmer-id',
        'X-Customer-Id',
        'x-customer-id',
        'X-Client-App',
        'x-client-app',
        'X-Client-Version',
        'x-client-version',
        'X-Device-Id',
        'x-device-id',
        'X-Idempotency-Key',
        'x-idempotency-key',
        'X-Access-Token',
        'x-access-token'
    ],
    exposedHeaders: ['X-Request-Id', 'X-Dairy-Id', 'X-Dairy-Tenant-Id', 'X-Organization-Id'],
    maxAge: 86400, // 24 hours
};
//# sourceMappingURL=cors.js.map