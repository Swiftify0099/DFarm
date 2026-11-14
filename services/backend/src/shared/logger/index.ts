import { pino } from 'pino';
import { config } from '../../config/env.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'token',
      'otp',
      'faceTemplate',
      'embedding',
      'encryptionKey',
      'serviceRoleKey',
      'service_role_key',
      'jwt_secret',
      '*.password',
      '*.token',
      '*.otp',
      '*.faceTemplate',
      '*.embedding',
    ],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

