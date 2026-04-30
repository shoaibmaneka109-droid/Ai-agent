import type { Request, Response, NextFunction } from "express";
import { getPool } from "../lib/db/pool.js";
import { getRequestClientIp, clientIpMatchesAllowed } from "../lib/requestIp.js";

/**
 * For employees (`member` role): request IP must match `organization_members.allowed_vps_ip`
 * to access virtual card details. Admins/owners bypass (they manage mappings, not card PAN).
 */
export async function requireEmployeeVpsIpForCardAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.auth || !req.tenantId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const role = req.orgMemberRole;
  if (role !== "member") {
    next();
    return;
  }
  try {
    const pool = getPool();
    const { rows } = await pool.query<{ allowed_vps_ip: string | null }>(
      `SELECT host(allowed_vps_ip) AS allowed_vps_ip
       FROM organization_members
       WHERE organization_id = $1 AND user_id = $2`,
      [req.tenantId, req.auth.userId]
    );
    const allowed = rows[0]?.allowed_vps_ip ?? null;
    if (!allowed) {
      res.status(403).json({
        error: "No VPS IP configured for your account. Ask an admin to assign your allowed IP.",
        code: "VPS_IP_REQUIRED",
      });
      return;
    }
    const clientIp = getRequestClientIp(req);
    if (!clientIpMatchesAllowed(clientIp, allowed)) {
      res.status(403).json({
        error: "Card details are only available from your registered VPS IP address.",
        code: "VPS_IP_MISMATCH",
        expectedIp: allowed,
      });
      return;
    }
    next();
  } catch (e) {
    next(e);
  }
}
