const app    = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const { pool } = require('./db/pool');

async function start() {
  // Verify DB connectivity before accepting traffic
  try {
    await pool.query('SELECT 1');
    logger.info('Database connection verified');
  } catch (err) {
    logger.error('Failed to connect to database', { error: err.message });
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    logger.info(`SecurePay API running`, { port: config.port, env: config.env });
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received — graceful shutdown`);
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
