import pg from "pg";
import { env } from "../config/env.js";

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000
});

export type QueryParams = readonly unknown[];

export async function query<T>(text: string, params: QueryParams = []): Promise<pg.QueryResult<T>> {
  const result = await pool.query<T>(text, params);
  return result;
}
