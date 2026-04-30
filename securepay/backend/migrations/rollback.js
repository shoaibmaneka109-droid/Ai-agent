/**
 * Rolls back the last applied migration by removing its record.
 * The actual schema changes must be handled by a corresponding "down" SQL file
 * named <original>_down.sql (not auto-applied; operator handles destructive changes).
 */

require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'securepay',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

async function rollback() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'SELECT filename FROM schema_migrations ORDER BY applied_at DESC LIMIT 1',
    );
    if (rows.length === 0) {
      console.log('No migrations to roll back.');
      return;
    }
    const { filename } = rows[0];
    await client.query('DELETE FROM schema_migrations WHERE filename = $1', [filename]);
    console.log(`Rolled back: ${filename}`);
    console.log('NOTE: You must manually apply the corresponding down SQL to revert schema changes.');
  } finally {
    client.release();
    await pool.end();
  }
}

rollback();
