import pg from "pg";
import { env } from "../../config/env.js";

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!pool) {
    pool = new pg.Pool({ connectionString: env.databaseUrl });
  }
  return pool;
}
