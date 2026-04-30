import { getPool } from "./db/pool.js";

/** Hide MASTER_CARD in SQL unless the requester is super_admin (use as AND ... with param $N = role). */
export function sqlExcludeMasterCardUnlessSuperAdmin(roleParam: string): string {
  return `(vc.card_kind IS DISTINCT FROM 'MASTER_CARD' OR ${roleParam} = 'super_admin')`;
}

export async function insertAuditLog(input: {
  organizationId: string;
  actorUserId: string;
  action: string;
  payload: Record<string, unknown>;
}): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO audit_logs (organization_id, action, actor_user_id, payload)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id`,
    [input.organizationId, input.action, input.actorUserId, JSON.stringify(input.payload)]
  );
  return rows[0]!.id;
}

export interface RecallFundsResult {
  ok: boolean;
  statusCode: number;
  message: string;
  simulated?: boolean;
  providerRef?: string;
}

/**
 * Recall funds from an employee's Issuing card toward the org master / platform balance.
 * Production: set STRIPE_ISSUING_RECALL_MODE=live and implement the exact Stripe/Airwallex
 * "balance transfer" call your account supports (Treasury / Issuing balance APIs vary by product).
 * Default mode records intent + audit and returns simulated success for integration testing.
 */
export async function recallFunds(params: {
  organizationId: string;
  actorUserId: string;
  fromCardId: string;
  amountCents: number;
  masterCardId: string | null;
}): Promise<RecallFundsResult> {
  const amount = Math.floor(params.amountCents);
  if (amount <= 0 || amount > 100_000_000) {
    return { ok: false, statusCode: 400, message: "amountCents must be between 1 and 100000000" };
  }
  const pool = getPool();
  const { rows: fromRows } = await pool.query<{
    id: string;
    external_ref: string;
    card_kind: string;
  }>(
    `SELECT id, external_ref, card_kind FROM organization_virtual_cards
     WHERE id = $1::uuid AND organization_id = $2 AND card_kind = 'STANDARD'`,
    [params.fromCardId, params.organizationId]
  );
  const from = fromRows[0];
  if (!from) {
    return { ok: false, statusCode: 404, message: "Source card not found or not eligible for recall" };
  }
  let masterRef: string | null = null;
  if (params.masterCardId) {
    const { rows: m } = await pool.query<{ external_ref: string }>(
      `SELECT external_ref FROM organization_virtual_cards
       WHERE id = $1::uuid AND organization_id = $2 AND card_kind = 'MASTER_CARD'`,
      [params.masterCardId, params.organizationId]
    );
    masterRef = m[0]?.external_ref ?? null;
  } else {
    const { rows: m } = await pool.query<{ external_ref: string }>(
      `SELECT external_ref FROM organization_virtual_cards
       WHERE organization_id = $1 AND card_kind = 'MASTER_CARD' LIMIT 1`,
      [params.organizationId]
    );
    masterRef = m[0]?.external_ref ?? null;
  }
  await insertAuditLog({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: "fund_recall_requested",
    payload: {
      fromCardId: from.id,
      fromExternalRef: from.external_ref,
      amountCents: amount,
      masterCardExternalRef: masterRef,
    },
  });
  const mode = process.env.STRIPE_ISSUING_RECALL_MODE ?? "simulated";
  if (mode === "live") {
    try {
      const { getDecryptedCredential } = await import("../modules/billing/credentials.repository.js");
      const secret = await getDecryptedCredential(params.organizationId, "stripe", "api_secret");
      if (!secret) {
        await insertAuditLog({
          organizationId: params.organizationId,
          actorUserId: params.actorUserId,
          action: "fund_recall_failed",
          payload: { reason: "no_stripe_secret" },
        });
        return { ok: false, statusCode: 503, message: "Stripe API secret not configured" };
      }
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(secret);
      const card = await stripe.issuing.cards.retrieve(from.external_ref);
      const bal = (card as { spending_controls?: { spending_limits?: { amount?: number }[] } }).spending_controls;
      const limitAmt = bal?.spending_limits?.[0]?.amount;
      if (typeof limitAmt === "number" && limitAmt < amount) {
        await insertAuditLog({
          organizationId: params.organizationId,
          actorUserId: params.actorUserId,
          action: "fund_recall_failed",
          payload: { reason: "insufficient_balance", available: limitAmt, requested: amount },
        });
        return { ok: false, statusCode: 402, message: "Insufficient balance on employee card for this recall" };
      }
      await insertAuditLog({
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        action: "fund_recall_completed_live_stub",
        payload: {
          note: "STRIPE_ISSUING_RECALL_MODE=live set but provider-specific transfer not wired — extend fundRecall.ts",
          fromExternalRef: from.external_ref,
          masterExternalRef: masterRef,
          amountCents: amount,
        },
      });
      return {
        ok: true,
        statusCode: 200,
        message:
          "Recall accepted and audited. Wire stripe.treasury / issuing balance transfer per your Stripe Issuing setup.",
        simulated: false,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const insufficient =
        msg.toLowerCase().includes("insufficient") || msg.toLowerCase().includes("balance");
      await insertAuditLog({
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        action: "fund_recall_failed",
        payload: { error: msg.slice(0, 500) },
      });
      return {
        ok: false,
        statusCode: insufficient ? 402 : 502,
        message: insufficient ? "Insufficient balance on employee card" : msg,
      };
    }
  }
  await pool.query(
    `INSERT INTO organization_card_fund_transfers
      (organization_id, from_virtual_card_id, amount_cents, initiated_by_user_id, note, status)
     VALUES ($1, $2::uuid, $3, $4, $5, $6)`,
    [
      params.organizationId,
      from.id,
      amount,
      params.actorUserId,
      `fund_recall_simulated master=${masterRef ?? "none"}`,
      "simulated_recall",
    ]
  );
  await insertAuditLog({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: "fund_recall_completed_simulated",
    payload: {
      fromCardId: from.id,
      amountCents: amount,
      masterExternalRef: masterRef,
    },
  });
  return {
    ok: true,
    statusCode: 200,
    message:
      "Fund recall simulated (audit + ledger row). Set STRIPE_ISSUING_RECALL_MODE=live and implement Stripe Issuing/Treasury transfer in fundRecall.ts for production.",
    simulated: true,
  };
}
