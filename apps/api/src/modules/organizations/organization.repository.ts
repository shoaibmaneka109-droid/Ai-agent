import type { Pool } from "pg";
import type { OrganizationSummary, UserType } from "@securepay/shared";
import { pool as defaultPool } from "../../db/pool.js";

type OrganizationRow = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  account_type: UserType;
  created_at: Date;
  updated_at: Date;
};

const mapOrganization = (row: OrganizationRow): OrganizationSummary => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  type: row.account_type,
});

export type CreateOrganizationParams = {
  tenantId: string;
  accountType: UserType;
  name: string;
  slug: string;
  legalName?: string;
  billingEmail?: string;
};

export class OrganizationRepository {
  constructor(private readonly pool: Pool = defaultPool) {}

  async create(params: CreateOrganizationParams): Promise<OrganizationSummary> {
    const result = await this.pool.query<OrganizationRow>(
      `
        INSERT INTO organizations (tenant_id, account_type, name, slug, legal_name, billing_email)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, tenant_id, account_type, name, slug, created_at, updated_at
      `,
      [
        params.tenantId,
        params.accountType,
        params.name,
        params.slug,
        params.legalName ?? null,
        params.billingEmail ?? null
      ]
    );

    return mapOrganization(result.rows[0]);
  }

  async listByTenant(tenantId: string): Promise<OrganizationSummary[]> {
    const result = await this.pool.query<OrganizationRow>(
      `
        SELECT id, tenant_id, account_type, name, slug, created_at, updated_at
        FROM organizations
        WHERE tenant_id = $1
        ORDER BY created_at DESC
      `,
      [tenantId]
    );

    return result.rows.map(mapOrganization);
  }
}
