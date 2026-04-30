import type { OrgBillingState } from "@securepay/shared";
import { AGENCY_TRIAL_MAX_EMPLOYEES } from "@securepay/shared";
import { getPool } from "../db/pool.js";

/** Count of `member`-role seats (employees) in the org. */
export async function countAgencyEmployees(organizationId: string): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
     FROM organization_members
     WHERE organization_id = $1 AND role = 'member'`,
    [organizationId]
  );
  return Number(rows[0]?.n ?? 0);
}

export function assertAgencyTrialEmployeeCap(
  billing: OrgBillingState,
  currentEmployeeCount: number,
  roleBeingAdded: "owner" | "admin" | "member"
): void {
  if (billing.organizationKind !== "agency") return;
  if (roleBeingAdded !== "member") return;
  const inAgencyTrial = billing.isTrialActive && !billing.isPaidActive;
  if (!inAgencyTrial) return;
  if (currentEmployeeCount >= AGENCY_TRIAL_MAX_EMPLOYEES) {
    throw new Error("AGENCY_TRIAL_EMPLOYEE_CAP");
  }
}