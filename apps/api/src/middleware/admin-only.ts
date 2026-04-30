import type { NextFunction, Request, Response } from "express";

import { HttpError } from "./error-handler.js";

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth || !["owner", "admin"].includes(req.auth.role)) {
    next(new HttpError(403, "Only organization admins can manage provider integrations", "ADMIN_REQUIRED"));
    return;
  }

  next();
}
