import type { OrganizationRole, SubscriptionStatus, UserType } from "@securepay/shared";
import type { Pool, PoolClient } from "pg";

import { pool as defaultPool } from "../../db/pool.js";

type Queryable = Pool | PoolClient;

export type AuthUserRow = {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
};

export type AuthMembershipRow = {
  tenant_id: string;
  tenant_slug: string;
  organization_id: string;
  organization_slug: string;
  account_type: UserType;
  role: OrganizationRole;
  subscription_status: SubscriptionStatus;
  trial_started_at: Date | null;
  trial_ends_at: Date | null;
  subscription_current_period_ends_at: Date | null;
};

export type TenantEntitlementRow = {
  tenant_id: string;
  account_type: UserType;
  subscription_status: SubscriptionStatus;
  trial_ends_at: Date | null;
  subscription_current_period_ends_at: Date | null;
};

export type RegisterTenantInput = {
  email: string;
  fullName: string;
  passwordHash: string;
  accountType: UserType;
  tenantSlug: string;
  organizationName: string;
  organizationSlug: string;
  trialDays: number;
};

export type RegisterTenantResult = {
  user: AuthUserRow;
  membership: AuthMembershipRow;
};

export class AuthRepository {
  constructor(private readonly pool: Pool = defaultPool) {}

  async findUserByEmail(email: string): Promise<AuthUserRow | null> {
    const result = await this.pool.query<AuthUserRow>(
      `
        SELECT id, email, full_name, password_hash
        FROM users
        WHERE email = $1
        LIMIT 1
      `,
      [email.toLowerCase()]
    );

    return result.rows[0] ?? null;
  }

  async findPrimaryMembership(userId: string, tenantSlug?: string): Promise<AuthMembershipRow | null> {
    const result = await this.pool.query<AuthMembershipRow>(
      membershipSelectSql("m.user_id = $1" + (tenantSlug ? " AND t.slug = $2" : "")) +
        `
        ORDER BY
          CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
          m.created_at ASC
        LIMIT 1
      `,
      tenantSlug ? [userId, tenantSlug] : [userId]
    );

    return result.rows[0] ?? null;
  }

  async findTenantEntitlement(tenantId: string): Promise<TenantEntitlementRow | null> {
    const result = await this.pool.query<TenantEntitlementRow>(
      `
        SELECT
          id AS tenant_id,
          account_type,
          subscription_status,
          trial_ends_at,
          subscription_current_period_ends_at
        FROM tenants
        WHERE id = $1
        LIMIT 1
      `,
      [tenantId]
    );

    return result.rows[0] ?? null;
  }

  async registerTenant(input: RegisterTenantInput): Promise<RegisterTenantResult> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const user = await insertUser(client, input.email, input.fullName, input.passwordHash);
      const tenant = await client.query<{ id: string }>(
        `
          INSERT INTO tenants (
            slug,
            account_type,
            display_name,
            subscription_status,
            trial_started_at,
            trial_ends_at
          )
          VALUES ($1, $2, $3, 'trialing', now(), now() + ($4::int * interval '1 day'))
          RETURNING id
        `,
        [input.tenantSlug, input.accountType, input.organizationName, input.trialDays]
      );

      const organization = await client.query<{ id: string }>(
        `
          INSERT INTO organizations (tenant_id, account_type, name, slug, billing_email)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `,
        [
          tenant.rows[0].id,
          input.accountType,
          input.organizationName,
          input.organizationSlug,
          input.email.toLowerCase()
        ]
      );

      await client.query(
        `
          INSERT INTO organization_memberships (organization_id, user_id, role)
          VALUES ($1, $2, 'owner')
        `,
        [organization.rows[0].id, user.id]
      );

      const membership = await selectMembership(client, user.id);
      if (!membership) {
        throw new Error("Failed to create owner membership");
      }

      await client.query("COMMIT");
      return { user, membership };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async markLogin(userId: string): Promise<void> {
    await this.pool.query("UPDATE users SET last_login_at = now() WHERE id = $1", [userId]);
  }
}

export async function findMembershipByUserAndOrganization(
  userId: string,
  organizationId: string,
  queryable: Queryable = defaultPool
): Promise<AuthMembershipRow | null> {
  const result = await queryable.query<AuthMembershipRow>(
    membershipSelectSql("m.user_id = $1 AND o.id = $2") + " LIMIT 1",
    [userId, organizationId]
  );

  return result.rows[0] ?? null;
}

const membershipSelectSql = (whereClause: string): string => `
  SELECT
    t.id AS tenant_id,
    t.slug AS tenant_slug,
    o.id AS organization_id,
    o.slug AS organization_slug,
    t.account_type,
    m.role,
    t.subscription_status,
    t.trial_started_at,
    t.trial_ends_at,
    t.subscription_current_period_ends_at
  FROM organization_memberships m
  JOIN organizations o ON o.id = m.organization_id
  JOIN tenants t ON t.id = o.tenant_id
  WHERE ${whereClause}
`;

async function insertUser(
  client: PoolClient,
  email: string,
  fullName: string,
  passwordHash: string
): Promise<AuthUserRow> {
  const result = await client.query<AuthUserRow>(
    `
      INSERT INTO users (email, full_name, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, email, full_name, password_hash
    `,
    [email.toLowerCase(), fullName, passwordHash]
  );

  return result.rows[0];
}

async function selectMembership(client: Queryable, userId: string): Promise<AuthMembershipRow | null> {
  const result = await client.query<AuthMembershipRow>(
    membershipSelectSql("m.user_id = $1") +
      `
      ORDER BY m.created_at ASC
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] ?? null;
}
