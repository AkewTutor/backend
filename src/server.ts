import { Server } from 'http';
import app from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/db.js';
import logger from './utils/logger.js';

let server: Server;

/**
 * 🛡️ Handles Graceful Shutdown of the application stack
 * Prevents requests from cutting mid-flight during scaling or deployments
 */
let isShuttingDown = false;
let cleanupStarted = false; // guards cleanupAndExit specifically, separate from handleShutdown gating

const handleShutdown = async (signal: string) => {
  if (isShuttingDown) {
    logger.warn(`Received ${signal} again — shutdown already in progress, ignoring.`);
    return;
  }
  isShuttingDown = true;

  logger.warn(`Received ${signal}. Starting graceful shutdown pipeline...`);

  const cleanupAndExit = async (exitCode: number): Promise<void> => {
    // Prevent double-execution if both the timer and server.close() callback fire
    if (cleanupStarted) {
      logger.warn('Cleanup already in progress/completed — ignoring duplicate call.');
      return;
    }
    cleanupStarted = true;

    clearTimeout(forceExitTimer);

    let finalExitCode = exitCode;
    try {
      await prisma.$disconnect();
      logger.info('Database disconnected successfully');
    } catch (err) {
      logger.error(err, 'Database disconnect failed');
      finalExitCode = 1;
    } finally {
      process.exit(finalExitCode);
    }
  };

  const forceExitTimer = setTimeout(() => {
    logger.fatal('Graceful shutdown exceeded 10s. Forcing emergency cleanup...');
    // Drop any remaining open/keep-alive sockets before bailing out
    if (server) {
      try {
        server.closeAllConnections();
      } catch (err) {
        logger.error(err, 'Failed to force-close remaining connections');
      }
    }
    void cleanupAndExit(1);
  }, 10_000);
  forceExitTimer.unref(); // don't let this timer itself keep the process alive

  if (!server) {
    await cleanupAndExit(0);
    return;
  }

  // Immediately drop idle keep-alive sockets so server.close() doesn't just
  // sit around for the full 10s waiting on connections nobody is using.
  // (Node 18.2+; safe-guarded in case of older runtimes)
  if (typeof server.closeIdleConnections === 'function') {
    server.closeIdleConnections();
  }

  server.close(async (err) => {
    if (err) {
      logger.error(err, 'Error closing HTTP server');
      await cleanupAndExit(1);
      return;
    }
    logger.info('HTTP server closed — no longer accepting connections');
    await cleanupAndExit(0);
  });
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Catch-all safety nets: without these, an uncaught error or unhandled
// rejection outside a request handler crashes the process without ever
// running the graceful shutdown / DB disconnect path above.
process.on('uncaughtException', (err) => {
  logger.fatal(err, 'Uncaught exception — initiating shutdown');
  void handleShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.fatal(reason, 'Unhandled promise rejection — initiating shutdown');
  void handleShutdown('unhandledRejection');
});

/**
 * 🚀 Boosts the Application runtime
 */
const startServer = async () => {
  try {
    // Establish database verification checks early
    await prisma.$connect();
    logger.info('Database connections established successfully');

    // Capture the running listener state instance
    server = app.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    });
  } catch (error) {
    logger.fatal(error, 'Failed to initialize system core startup layers');
    await prisma.$disconnect();
    process.exit(1);
  }
};

startServer();
