import { io, type Socket } from "socket.io-client";
import { getStoredOrganizationId, getStoredToken } from "./api";

export type GuardDogAlertPayload = {
  organizationId: string;
  code: string;
  message: string;
  observedIp?: string | null;
  expectedIp?: string | null;
  hostname?: string | null;
  userId?: string | null;
  at: string;
};

/**
 * Subscribes to org room for dashboard events (`card_frozen`, `guard_dog_alert`).
 * Uses same origin / VITE_API_URL as REST.
 */
export function subscribeOrgCardEvents(
  onCardFrozen: (payload: {
    organizationId: string;
    virtualCardId: string;
    externalRef: string;
    last4: string;
    provider: string;
    source: string;
  }) => void,
  onGuardDogAlert?: (payload: GuardDogAlertPayload) => void
): () => void {
  const token = getStoredToken();
  const organizationId = getStoredOrganizationId();
  if (!token || !organizationId) {
    return () => {};
  }
  const base =
    (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const socket: Socket = io(base, {
    path: "/socket.io",
    auth: { token, organizationId },
    transports: ["websocket", "polling"],
  });
  socket.on("card_frozen", onCardFrozen);
  if (onGuardDogAlert) {
    socket.on("guard_dog_alert", onGuardDogAlert);
  }
  socket.on("connect_error", () => {
    /* optional: dev only */
  });
  return () => {
    socket.disconnect();
  };
}
