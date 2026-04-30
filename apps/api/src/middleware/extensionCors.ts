import type { Request, Response, NextFunction } from "express";

/**
 * CORS for SecurePay Chrome extension: requests originate from merchant pages,
 * so the browser sends Origin: chrome-extension://<id>.
 */
export function extensionCorsHeaders(req: Request, res: Response, next: NextFunction): void {
  const origin = req.header("origin") ?? "";
  const configured = process.env.EXTENSION_CORS_ORIGIN?.trim();

  let allowOrigin = "*";
  if (configured) {
    allowOrigin = configured;
  } else if (origin.startsWith("chrome-extension://")) {
    allowOrigin = origin;
  }

  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Organization-Id");
  res.setHeader("Access-Control-Max-Age", "600");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}
