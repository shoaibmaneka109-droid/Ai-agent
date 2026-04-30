import type { SubscriptionStatus, UserType } from "@securepay/shared";
import type { Pool } from "pg";

import { pool as defaultPool } from "../../db/pool.js";

export type EntitlementRecord = {
  tenant_id: string;
  account_type: UserType;
  subscription_status: SubscriptionStatus;
  trial_started_at: Date | null;
  trial_ends_at: Date | null;
  subscription_current_period_ends_at: Date | null;
};

export class SubscriptionRepository {
  constructor(private readonly pool: Pool = defaultPool) {}

  async getEntitlement(tenantId: string): Promise<EntitlementRecord | null> {
    const result = await this.pool.query<EntitlementRecord>(
      `
        SELECT
          id AS tenant_id,
          account_type,
          subscription_status,
          trial_started_at,
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
}
