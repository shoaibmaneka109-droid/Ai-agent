import type { Request, Response, NextFunction } from "express";

/** Any elevated org staff: owner, main admin, or sub-admin (granular checks use requireOrgPermissions). */
export function requireOrgAdmin(req: Request, res: Response, next: NextFunction): void {
  const role = req.orgMemberRole;
  if (role === "owner" || role === "admin" || role === "super_admin" || role === "sub_admin") {
    next();
    return;
  }
  res.status(403).json({ error: "Organization admin role required" });
}
