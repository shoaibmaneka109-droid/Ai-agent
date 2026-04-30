import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/jwt.js";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    req.auth = { userId: payload.sub, email: payload.email, userType: payload.userType };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
