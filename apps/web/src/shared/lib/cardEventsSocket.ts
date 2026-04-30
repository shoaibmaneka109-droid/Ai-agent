import { io, type Socket } from "socket.io-client";
import { getStoredOrganizationId, getStoredToken } from "./api";

/**
 * Subscribes to org room for `card_frozen` (e.g. webhook auto-freeze). Uses same origin / VITE_API_URL as REST.
 */
export function subscribeOrgCardEvents(
  onCardFrozen: (payload: {
    organizationId: string;
    virtualCardId: string;
    externalRef: string;
    last4: string;
    provider: string;
    source: string;
  }) => void
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
  socket.on("connect_error", () => {
    /* optional: dev only */
  });
  return () => {
    socket.disconnect();
  };
}
