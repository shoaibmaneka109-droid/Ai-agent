import { getPool } from "./db/pool.js";
import { insertAuditLog } from "./fundRecall.js";

export type GuardDogEventCode =
  | "VPS_IP_MISMATCH"
  | "VPS_IP_REQUIRED"
  | "EXTENSION_MERCHANT_DENIED"
  | "EXTENSION_NOT_EMPLOYEE"
  | "GUARD_DOG_AUTO_LOCKDOWN";

export interface GuardDogAlertPayload {
  organizationId: string;
  code: GuardDogEventCode;
  message: string;
  observedIp?: string | null;
  expectedIp?: string | null;
  hostname?: string | null;
  userId?: string | null;
  at: string;
}

let emitGuardDog: ((payload: GuardDogAlertPayload) => void) | null = null;

export function setGuardDogEmitter(fn: ((payload: GuardDogAlertPayload) => void) | null): void {
  emitGuardDog = fn;
}

/**
 * Guard-Dog: always audit security-relevant events; when org has `guard_dog_enabled`,
 * push a real-time alert to the agency dashboard; optional `guard_dog_auto_lockdown` triggers emergency lockdown.
 */
export async function handleGuardDogSecurityEvent(input: {
  organizationId: string;
  userId: string | null;
  code: GuardDogEventCode;
  message: string;
  observedIp?: string | null;
  expectedIp?: string | null;
  hostname?: string | null;
}): Promise<void> {
  const pool = getPool();
  const actor = input.userId ?? null;
  await insertAuditLog({
    organizationId: input.organizationId,
    actorUserId: actor,
    action: "guard_dog_event",
    payload: {
      code: input.code,
      message: input.message,
      observedIp: input.observedIp ?? null,
      expectedIp: input.expectedIp ?? null,
      hostname: input.hostname ?? null,
    },
  });

  const { rows } = await pool.query<{
    guard_dog_enabled: boolean;
    guard_dog_auto_lockdown: boolean;
  }>(
    `SELECT guard_dog_enabled, guard_dog_auto_lockdown FROM organizations WHERE id = $1`,
    [input.organizationId]
  );
  const row = rows[0];
  if (!row?.guard_dog_enabled) return;

  const payload: GuardDogAlertPayload = {
    organizationId: input.organizationId,
    code: input.code,
    message: input.message,
    observedIp: input.observedIp ?? null,
    expectedIp: input.expectedIp ?? null,
    hostname: input.hostname ?? null,
    userId: input.userId,
    at: new Date().toISOString(),
  };
  emitGuardDog?.(payload);

  if (row.guard_dog_auto_lockdown) {
    await pool.query(`UPDATE organizations SET emergency_lockdown_at = now() WHERE id = $1`, [input.organizationId]);
    await insertAuditLog({
      organizationId: input.organizationId,
      actorUserId: actor,
      action: "guard_dog_emergency_lockdown",
      payload: { triggeredBy: input.code, message: "Auto emergency lockdown applied by Guard-Dog" },
    });
    emitGuardDog?.({
      organizationId: input.organizationId,
      code: "GUARD_DOG_AUTO_LOCKDOWN",
      message: "Emergency lockdown was activated automatically by Guard-Dog.",
      observedIp: input.observedIp ?? null,
      expectedIp: input.expectedIp ?? null,
      hostname: input.hostname ?? null,
      userId: input.userId,
      at: new Date().toISOString(),
    });
  }
}
