import type { NextFunction, Request, Response } from "express";

import { HttpError } from "./error-handler.js";
import { verifyAccessToken } from "../security/jwt.js";

export function authenticateJwt(req: Request, _res: Response, next: NextFunction) {
  const authorization = req.header("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    next(new HttpError(401, "Bearer token is required", "AUTH_TOKEN_REQUIRED"));
    return;
  }

  try {
    const token = authorization.slice("Bearer ".length);
    const auth = verifyAccessToken(token);

    req.auth = auth;
    req.tenantContext = {
      tenantId: auth.tenantId,
      organizationId: auth.organizationId
    };

    next();
  } catch {
    next(new HttpError(401, "Invalid or expired token", "AUTH_TOKEN_INVALID"));
  }
}
