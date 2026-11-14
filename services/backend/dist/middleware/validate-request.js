import { ZodError } from 'zod';
import { ValidationError } from '../shared/errors/app-error.js';
export function validateRequest(schema) {
    return async (req, _res, next) => {
        try {
            if (schema.params) {
                const parsedParams = await schema.params.parseAsync(req.params);
                if (req.params && typeof req.params === 'object') {
                    Object.assign(req.params, parsedParams);
                }
            }
            if (schema.query) {
                const parsedQuery = await schema.query.parseAsync(req.query);
                if (req.query && typeof req.query === 'object') {
                    Object.assign(req.query, parsedQuery);
                }
            }
            if (schema.body) {
                req.body = await schema.body.parseAsync(req.body ?? {});
            }
            next();
        }
        catch (err) {
            if (err instanceof ZodError || err?.name === 'ZodError') {
                const issues = (err.errors || err.issues || []);
                const formattedErrors = issues.map((e) => ({
                    field: Array.isArray(e.path) ? e.path.join('.') : 'root',
                    message: e.message,
                    rule: e.code,
                }));
                return next(new ValidationError('Request validation failed', formattedErrors));
            }
            next(err);
        }
    };
}
//# sourceMappingURL=validate-request.js.map