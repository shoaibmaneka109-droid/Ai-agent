require('dotenv').config();
const app = require('./app');
const { pool } = require('./config/database');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    await pool.connect();
    logger.info('PostgreSQL connection established');

    const server = app.listen(PORT, () => {
      logger.info(`SecurePay backend running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });

    const shutdown = async (signal) => {
      logger.info(`${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        await pool.end();
        logger.info('Server and database connections closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
