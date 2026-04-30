require('dotenv').config();
const app = require('./app');
const { pool } = require('./config/database');
const { runExpiryCheck } = require('./services/trial.service');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 4000;

// ─── Trial expiry cron ────────────────────────────────────────────────────────
// Runs every 30 minutes. Scans for:
//   1. Trialing subscriptions past grace period → mark hibernating
//   2. Past-due subscriptions older than 7 days  → mark unpaid / lock access
//
// For production, replace with a proper job scheduler (e.g. pg-boss, BullMQ)
// or a cloud-managed cron (AWS EventBridge, GCP Cloud Scheduler).

const EXPIRY_CHECK_INTERVAL_MS =
  parseInt(process.env.TRIAL_EXPIRY_CHECK_INTERVAL_MS || '', 10) ||
  30 * 60 * 1000; // 30 minutes

let expiryTimer = null;

function scheduleExpiryCheck() {
  expiryTimer = setInterval(async () => {
    try {
      const hibernated = await runExpiryCheck();
      if (hibernated > 0) {
        logger.info(`Trial expiry job: moved ${hibernated} tenant(s) to hibernation`);
      }
    } catch (err) {
      logger.error('Trial expiry job failed:', err);
    }
  }, EXPIRY_CHECK_INTERVAL_MS);

  // Prevent the timer from keeping the process alive if all other work is done
  if (expiryTimer.unref) expiryTimer.unref();

  logger.info(`Trial expiry check scheduled every ${EXPIRY_CHECK_INTERVAL_MS / 1000}s`);
}

// ─── Server startup ────────────────────────────────────────────────────────────
async function startServer() {
  try {
    // Verify DB connectivity
    const client = await pool.connect();
    client.release();
    logger.info('PostgreSQL connection established');

    // Run an initial expiry check on startup to catch any missed windows
    try {
      await runExpiryCheck();
    } catch (err) {
      logger.warn('Initial expiry check failed (non-fatal):', err.message);
    }

    const server = app.listen(PORT, () => {
      logger.info(`SecurePay backend running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });

    scheduleExpiryCheck();

    // ── Graceful shutdown ────────────────────────────────────────────────────
    const shutdown = async (signal) => {
      logger.info(`${signal} received. Shutting down gracefully...`);
      if (expiryTimer) clearInterval(expiryTimer);

      server.close(async () => {
        await pool.end();
        logger.info('Server and database connections closed');
        process.exit(0);
      });

      // Force-exit after 10 seconds if graceful shutdown stalls
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10_000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception:', err);
      shutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection:', reason);
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
