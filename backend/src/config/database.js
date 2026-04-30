const { Pool } = require('pg');
const config = require('./index');
const logger = require('../shared/utils/logger');

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  ssl: config.db.ssl,
  min: config.db.poolMin,
  max: config.db.poolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { error: err.message });
});

pool.on('connect', () => {
  logger.debug('New PostgreSQL connection established');
});

/**
 * Execute a query with automatic connection management.
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Query executed', { text, duration, rows: result.rowCount });
    return result;
  } catch (err) {
    logger.error('Database query error', { text, error: err.message });
    throw err;
  }
};

/**
 * Acquire a client for multi-statement transactions.
 * Caller must call client.release() when done.
 */
const getClient = async () => {
  const client = await pool.connect();
  const originalRelease = client.release.bind(client);
  const timeout = setTimeout(() => {
    logger.warn('A database client has been checked out for more than 30 seconds!');
  }, 30000);

  client.release = () => {
    clearTimeout(timeout);
    client.release = originalRelease;
    return originalRelease();
  };

  return client;
};

/**
 * Run a callback inside a transaction, rolling back on error.
 */
const withTransaction = async (callback) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const testConnection = async () => {
  const result = await query('SELECT NOW() AS now, version() AS version');
  return result.rows[0];
};

module.exports = { query, getClient, withTransaction, testConnection, pool };
