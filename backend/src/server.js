const app    = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const { pool } = require('./db/pool');
const { sweepExpiredTrials, sweepExpiredSubscriptions } =
  require('./modules/subscriptions/subscriptions.service');

// ── Subscription expiration sweep ─────────────────────────────────────────────
// Runs every 5 minutes to catch any orgs whose trial/subscription ended
// between logins (belt-and-suspenders — authenticate also does lazy expiry).

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let sweepTimer;

async function runSweep() {
  try {
    const trialCount = await sweepExpiredTrials();
    const subCount   = await sweepExpiredSubscriptions();
    if (trialCount || subCount) {
      logger.info('Subscription sweep complete', { trialExpired: trialCount, subExpired: subCount });
    }
  } catch (err) {
    logger.error('Subscription sweep error', { error: err.message });
  }
}

async function start() {
  try {
    await pool.query('SELECT 1');
    logger.info('Database connection verified');
  } catch (err) {
    logger.error('Failed to connect to database', { error: err.message });
    process.exit(1);
  }

  // Run initial sweep immediately on startup
  await runSweep();
  sweepTimer = setInterval(runSweep, SWEEP_INTERVAL_MS);

  const server = app.listen(config.port, () => {
    logger.info('SecurePay API running', { port: config.port, env: config.env });
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received — graceful shutdown`);
    clearInterval(sweepTimer);
    server.close(async () => {
      await pool.end();
      logger.info('Database pool closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start();
