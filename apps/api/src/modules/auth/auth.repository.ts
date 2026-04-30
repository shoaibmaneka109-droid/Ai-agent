import bcrypt from "bcryptjs";
import { getPool } from "../../lib/db/pool.js";
import { TRIAL_DAYS_AGENCY, TRIAL_DAYS_SOLO } from "@securepay/shared";

const BCRYPT_ROUNDS = 12;

export async function findUserByEmail(email: string): Promise<{
  id: string;
  email: string;
  password_hash: string;
  user_type: "solo" | "agency";
  default_org_id: string | null;
} | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, email, password_hash, user_type, default_org_id FROM users WHERE lower(email) = lower($1)`,
    [email]
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<{
  id: string;
  email: string;
  user_type: "solo" | "agency";
  default_org_id: string | null;
} | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, email, user_type, default_org_id FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function findOrgMembershipRole(
  organizationId: string,
  userId: string
): Promise<"owner" | "admin" | "super_admin" | "sub_admin" | "member" | null> {
  const pool = getPool();
  const { rows } = await pool.query<{ role: string }>(
    `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
    [organizationId, userId]
  );
  const r = rows[0]?.role;
  if (r === "owner" || r === "admin" || r === "super_admin" || r === "sub_admin" || r === "member") return r;
  return null;
}

export async function findOrgMembershipForMe(
  organizationId: string,
  userId: string
): Promise<{
  role: "owner" | "admin" | "super_admin" | "sub_admin" | "member";
  canManageEmployees: boolean;
  canViewCardsHideKeys: boolean;
  canCardAdminFundTransfer: boolean;
} | null> {
  const pool = getPool();
  const { rows } = await pool.query<{
    role: string;
    can_manage_employees: boolean;
    can_view_cards_hide_keys: boolean;
    can_card_admin_fund_transfer: boolean;
  }>(
    `SELECT role, can_manage_employees, can_view_cards_hide_keys, can_card_admin_fund_transfer
     FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
    [organizationId, userId]
  );
  const row = rows[0];
  if (!row) return null;
  const role = row.role;
  if (role !== "owner" && role !== "admin" && role !== "super_admin" && role !== "sub_admin" && role !== "member")
    return null;
  const r = role as "owner" | "admin" | "super_admin" | "sub_admin" | "member";
  if (r === "owner" || r === "admin" || r === "super_admin") {
    return {
      role: r,
      canManageEmployees: true,
      canViewCardsHideKeys: true,
      canCardAdminFundTransfer: true,
    };
  }
  if (r === "sub_admin") {
    return {
      role: r,
      canManageEmployees: row.can_manage_employees,
      canViewCardsHideKeys: row.can_view_cards_hide_keys,
      canCardAdminFundTransfer: row.can_card_admin_fund_transfer,
    };
  }
  return {
    role: "member",
    canManageEmployees: false,
    canViewCardsHideKeys: false,
    canCardAdminFundTransfer: false,
  };
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function registerSolo(input: {
  email: string;
  password: string;
  organizationName: string;
  slug?: string;
}): Promise<{ userId: string; organizationId: string }> {
  const pool = getPool();
  const slug = input.slug?.trim() || slugify(input.organizationName);
  const passwordHash = await hashPassword(input.password);
  const trialDays = TRIAL_DAYS_SOLO;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orgRes = await client.query<{ id: string }>(
      `INSERT INTO organizations (name, slug, kind, trial_ends_at)
       VALUES ($1, $2, 'solo_workspace', now() + ($3::int * interval '1 day'))
       RETURNING id`,
      [input.organizationName, slug, trialDays]
    );
    const organizationId = orgRes.rows[0]!.id;

    const userRes = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, user_type, default_org_id)
       VALUES ($1, $2, 'solo', $3)
       RETURNING id`,
      [input.email, passwordHash, organizationId]
    );
    const userId = userRes.rows[0]!.id;

    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
       VALUES ($1, $2, 'owner', now())`,
      [organizationId, userId]
    );

    await client.query("COMMIT");
    return { userId, organizationId };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function registerAgencyAdmin(input: {
  email: string;
  password: string;
  organizationName: string;
  slug?: string;
}): Promise<{ userId: string; organizationId: string }> {
  const pool = getPool();
  const slug = input.slug?.trim() || slugify(input.organizationName);
  const passwordHash = await hashPassword(input.password);
  const trialDays = TRIAL_DAYS_AGENCY;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orgRes = await client.query<{ id: string }>(
      `INSERT INTO organizations (name, slug, kind, trial_ends_at)
       VALUES ($1, $2, 'agency', now() + ($3::int * interval '1 day'))
       RETURNING id`,
      [input.organizationName, slug, trialDays]
    );
    const organizationId = orgRes.rows[0]!.id;

    const userRes = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, user_type, default_org_id)
       VALUES ($1, $2, 'agency', $3)
       RETURNING id`,
      [input.email, passwordHash, organizationId]
    );
    const userId = userRes.rows[0]!.id;

    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
       VALUES ($1, $2, 'super_admin', now())`,
      [organizationId, userId]
    );

    await client.query("COMMIT");
    return { userId, organizationId };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
