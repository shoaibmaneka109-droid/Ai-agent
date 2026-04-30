import type { OrgBillingState } from "@securepay/shared";
import { computeOrgBillingState } from "@securepay/shared";
import { getPool } from "../db/pool.js";

export interface OrgRow {
  id: string;
  kind: "solo_workspace" | "agency";
  trialEndsAt: Date;
  subscriptionEndsAt: Date | null;
}

export async function getOrganizationBillingRow(organizationId: string): Promise<OrgRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<{
    id: string;
    kind: "solo_workspace" | "agency";
    trial_ends_at: Date;
    subscription_ends_at: Date | null;
  }>(
    `SELECT id, kind, trial_ends_at, subscription_ends_at
     FROM organizations WHERE id = $1`,
    [organizationId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    trialEndsAt: row.trial_ends_at,
    subscriptionEndsAt: row.subscription_ends_at,
  };
}

export async function getOrganizationBillingState(organizationId: string): Promise<OrgBillingState | null> {
  const row = await getOrganizationBillingRow(organizationId);
  if (!row) return null;
  return computeOrgBillingState({
    organizationId: row.id,
    organizationKind: row.kind,
    trialEndsAt: row.trialEndsAt,
    subscriptionEndsAt: row.subscriptionEndsAt,
  });
}
