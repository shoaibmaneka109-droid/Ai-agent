/**
 * Simple sequential migration runner.
 * Reads SQL files from migrations/ directory in alphabetical order
 * and applies any not yet recorded in schema_migrations.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');
const logger = require('../shared/utils/logger');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function run() {
  const client = await pool.connect();
  try {
    // Ensure tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     VARCHAR(50)  PRIMARY KEY,
        applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    const applied = await client.query('SELECT version FROM schema_migrations');
    const appliedSet = new Set(applied.rows.map((r) => r.version));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = path.basename(file, '.sql');
      if (appliedSet.has(version)) {
        logger.info(`[skip]  ${version}`);
        continue;
      }

      logger.info(`[apply] ${version}`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
          [version]
        );
        await client.query('COMMIT');
        logger.info(`[done]  ${version}`);
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`[fail]  ${version}`, { error: err.message });
        throw err;
      }
    }

    logger.info('All migrations complete');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  logger.error('Migration failed', { error: err.message });
  process.exit(1);
});
