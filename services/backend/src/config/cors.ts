import type { CorsOptions } from 'cors';
import { config } from './env.js';

const allowedOrigins = config.CORS_ALLOWED_ORIGINS
  .split(',')
  .map(origin => origin.trim())
  .filter(origin => origin.length > 0);

export const corsOptions: CorsOptions = {
  origin: (requestOrigin, callback) => {
    // Allow non-browser tools (curl, postman, server-to-server, tests) with no origin header
    if (!requestOrigin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(requestOrigin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origin ${requestOrigin} is not allowed by CORS policy`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Accept'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 86400, // 24 hours
};

