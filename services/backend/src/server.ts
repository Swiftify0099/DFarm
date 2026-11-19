import http from 'node:http';
import { app } from './app.js';
import { config } from './config/env.js';
import { logger } from './shared/logger/index.js';

let server: http.Server | null = null;

export function startServer(): http.Server {
  server = http.createServer(app);

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.fatal(
        { port: config.PORT },
        `Port ${config.PORT} is already in use by another process. Please free port ${config.PORT} or configure a different PORT.`
      );
    } else {
      logger.fatal({ err }, 'Server error encountered during startup');
    }
    process.exit(1);
  });

  server.listen(config.PORT, () => {
    logger.info(
      {
        port: config.PORT,
        env: config.NODE_ENV,
        apiBase: config.API_BASE_URL,
      },
      'DFarm Smart Dairy Backend Server started successfully'
    );
  });

  return server;
}

export async function stopServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server) {
      return resolve();
    }
    server.close(err => {
      if (err) {
        logger.error({ err }, 'Error during server shutdown');
        return reject(err);
      }
      logger.info('DFarm Backend Server closed gracefully');
      server = null;
      resolve();
    });
  });
}

function handleShutdown(signal: string): void {
  logger.info({ signal }, 'Received termination signal, shutting down gracefully...');
  stopServer()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

// Only attach listeners if executed directly
if (process.argv[1]?.endsWith('server.js') || process.argv[1]?.endsWith('server.ts')) {
  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled Promise Rejection');
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught Exception thrown');
    process.exit(1);
  });

  startServer();
}

