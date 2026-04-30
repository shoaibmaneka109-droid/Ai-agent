import type { Pool } from "pg";

export interface TenantRecord {
  id: string;
  slug: string;
  account_type: "solo" | "agency";
  display_name: string;
}

export async function getTenantBySlug(pool: Pool, slug: string): Promise<TenantRecord | null> {
  const result = await pool.query<TenantRecord>(
    `select id, slug, account_type, display_name
     from tenants
     where slug = $1`,
    [slug],
  );

  return result.rows[0] ?? null;
}
