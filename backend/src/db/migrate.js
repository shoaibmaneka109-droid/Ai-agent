#!/usr/bin/env node
/**
 * Simple migration runner.
 * Reads SQL files from ./migrations in order and executes unrun ones.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');
const logger = require('../services/logger');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    VARCHAR(50) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows: applied } = await client.query('SELECT version FROM schema_migrations');
    const appliedVersions = new Set(applied.map((r) => r.version));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = path.basename(file, '.sql');
      if (appliedVersions.has(version)) {
        logger.info(`Skipping migration (already applied): ${version}`);
        continue;
      }

      logger.info(`Applying migration: ${version}`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
          [version]
        );
        await client.query('COMMIT');
        logger.info(`Migration applied: ${version}`);
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`Migration failed: ${version}`, { error: err.message });
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
  logger.error('Migration runner error', { error: err.message });
  process.exit(1);
});
