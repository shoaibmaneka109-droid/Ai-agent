import type { Request, Response, NextFunction } from "express";

export function requireOrgAdmin(req: Request, res: Response, next: NextFunction): void {
  const role = req.orgMemberRole;
  if (role !== "admin" && role !== "owner") {
    res.status(403).json({ error: "Admin or owner role required" });
    return;
  }
  next();
}
