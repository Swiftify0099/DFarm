import { ApiResponse } from '../shared/response/api-response.js';
export function notFoundHandler(req, res) {
    return ApiResponse.error(res, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} was not found on this server`, 404);
}
//# sourceMappingURL=not-found.js.map