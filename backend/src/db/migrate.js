/**
 * Simple migration runner.
 * Applies all *.sql files from /database/migrations in alphabetical order,
 * tracking applied migrations in a `schema_migrations` table.
 */
const path = require('path');
const fs   = require('fs');
const { pool } = require('./pool');
const logger   = require('../utils/logger');

const MIGRATIONS_DIR = path.join(__dirname, '../../../database/migrations');

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    const applied = await client.query('SELECT version FROM schema_migrations');
    const appliedSet = new Set(applied.rows.map((r) => r.version));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (appliedSet.has(file)) {
        logger.info(`Migration already applied: ${file}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      logger.info(`Applying migration: ${file}`);
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      logger.info(`Migration applied: ${file}`);
    }

    logger.info('All migrations up to date');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  logger.error('Migration failed', { error: err.message });
  process.exit(1);
});
