import { pino } from 'pino';
import { config } from '../../config/env.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-access-token"]',
      'req.headers["x-sse-ticket"]',
      'req.query.token',
      'req.query.ticket',
      'req.query.sseToken',
      'req.query.accessToken',
      'password',
      'token',
      'ticket',
      'otp',
      'faceTemplate',
      'embedding',
      'encryptionKey',
      'serviceRoleKey',
      'service_role_key',
      'jwt_secret',
      '*.password',
      '*.token',
      '*.ticket',
      '*.otp',
      '*.faceTemplate',
      '*.embedding',
    ],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

