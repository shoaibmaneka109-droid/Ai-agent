import type { OrganizationRole, SubscriptionStatus, UserType } from "@securepay/shared";
import type { Pool } from "pg";

import { pool as defaultPool } from "../../db/pool.js";

export type MemberRow = {
  id: string;
  email: string;
  full_name: string;
  role: OrganizationRole;
  created_at: Date;
};

export type OrganizationTenantRow = {
  tenant_id: string;
  account_type: UserType;
  subscription_status: SubscriptionStatus;
  trial_ends_at: Date | null;
};

export class MemberRepository {
  constructor(private readonly pool: Pool = defaultPool) {}

  async countAgencyTrialEmployees(organizationId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `
        SELECT count(*)::text
        FROM organization_memberships
        WHERE organization_id = $1
          AND role IN ('admin', 'member')
      `,
      [organizationId]
    );

    return Number(result.rows[0]?.count ?? 0);
  }

  async findTenantForOrganization(organizationId: string): Promise<OrganizationTenantRow | null> {
    const result = await this.pool.query<OrganizationTenantRow>(
      `
        SELECT
          t.id AS tenant_id,
          t.account_type,
          t.subscription_status,
          t.trial_ends_at
        FROM organizations o
        JOIN tenants t ON t.id = o.tenant_id
        WHERE o.id = $1
        LIMIT 1
      `,
      [organizationId]
    );

    return result.rows[0] ?? null;
  }

  async addEmployee(params: {
    organizationId: string;
    email: string;
    fullName: string;
    passwordHash: string;
    role: Exclude<OrganizationRole, "owner" | "viewer">;
  }): Promise<MemberRow> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const userResult = await client.query<{ id: string; email: string; full_name: string }>(
        `
          INSERT INTO users (email, full_name, password_hash)
          VALUES ($1, $2, $3)
          ON CONFLICT (email)
          DO UPDATE SET full_name = excluded.full_name
          RETURNING id, email, full_name
        `,
        [params.email.toLowerCase(), params.fullName, params.passwordHash]
      );

      const membership = await client.query<MemberRow>(
        `
          INSERT INTO organization_memberships (organization_id, user_id, role)
          VALUES ($1, $2, $3)
          ON CONFLICT (organization_id, user_id)
          DO UPDATE SET role = excluded.role
          RETURNING
            (SELECT id FROM users WHERE id = organization_memberships.user_id) AS id,
            (SELECT email FROM users WHERE id = organization_memberships.user_id) AS email,
            (SELECT full_name FROM users WHERE id = organization_memberships.user_id) AS full_name,
            role,
            created_at
        `,
        [params.organizationId, userResult.rows[0].id, params.role]
      );

      await client.query("COMMIT");
      return membership.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
