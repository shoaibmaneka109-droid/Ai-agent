import type { Request } from "express";
import { env } from "../config/env.js";

function forwardedClientIp(req: Request): string | null {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) {
    return xf.split(",")[0]!.trim();
  }
  if (Array.isArray(xf) && xf[0]) {
    return xf[0].split(",")[0]!.trim();
  }
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) return realIp.trim();
  return null;
}

/**
 * Client IP for comparison with DB-stored VPS IP.
 * When `TRUST_PROXY=1`, uses X-Forwarded-For / X-Real-IP (first hop); otherwise `req.socket.remoteAddress`.
 */
export function getRequestClientIp(req: Request): string | null {
  if (env.trustProxy) {
    const fromProxy = forwardedClientIp(req);
    if (fromProxy) return normalizeIpString(fromProxy);
  }
  const raw = req.socket.remoteAddress;
  if (!raw) return null;
  return normalizeIpString(raw);
}

/** Strip IPv4-mapped IPv6 prefix for consistent comparison. */
export function normalizeIpString(ip: string): string {
  const t = ip.trim();
  if (t.startsWith("::ffff:") && t.includes(".")) {
    return t.slice("::ffff:".length);
  }
  return t;
}

export function clientIpMatchesAllowed(clientIp: string | null, allowedFromDb: string | null): boolean {
  if (!clientIp || !allowedFromDb) return false;
  const a = normalizeIpString(clientIp);
  const b = normalizeIpString(allowedFromDb);
  return a === b;
}
