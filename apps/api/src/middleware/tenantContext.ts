import type { Request, Response, NextFunction } from "express";

/**
 * Placeholder for tenant resolution (JWT/session → organization_id).
 * All tenant-scoped routes should run after this and use req.tenantId.
 */
export function tenantContext(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("x-organization-id");
  if (!header) {
    res.status(400).json({ error: "Missing X-Organization-Id header" });
    return;
  }
  req.tenantId = header;
  next();
}
