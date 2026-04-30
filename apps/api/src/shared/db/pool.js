const { Pool } = require("pg");

const { env } = require("../../config/env");

const pool = new Pool({
  connectionString: env.databaseUrl,
});

async function withTransaction(work) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  withTransaction,
};
