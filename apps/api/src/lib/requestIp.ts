import net from "node:net";
import type { Request } from "express";
import { Address4, Address6 } from "ip-address";
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

/** Canonical form for equality (IPv4 dotted quad; IPv6 full lowercase compressed form). */
export function canonicalIpForCompare(ip: string): string | null {
  const n = normalizeIpString(ip);
  if (!n) return null;
  if (net.isIPv4(n)) {
    try {
      return new Address4(n).correctForm();
    } catch {
      return null;
    }
  }
  if (net.isIPv6(n)) {
    try {
      return new Address6(n).canonicalForm();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * True when the observed client IP is the same host as the DB-stored VPS IP (IPv4 or IPv6).
 */
export function clientIpMatchesAllowed(clientIp: string | null, allowedFromDb: string | null): boolean {
  if (!clientIp || !allowedFromDb) return false;
  const a = canonicalIpForCompare(clientIp);
  const b = canonicalIpForCompare(allowedFromDb);
  if (a && b) return a === b;
  const fa = normalizeIpString(clientIp);
  const fb = normalizeIpString(allowedFromDb);
  return fa === fb;
}
