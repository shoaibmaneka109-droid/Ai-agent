import type { Request, Response, NextFunction } from "express";

function deny(res: Response, code: string, message: string): void {
  res.status(403).json({ error: message, code });
}

/** Owner or main admin only — integrations, API keys, creating sub-admins. */
export function requireMainAgencyAdmin(req: Request, res: Response, next: NextFunction): void {
  const role = req.orgMemberRole;
  if (role === "owner" || role === "admin") {
    next();
    return;
  }
  deny(res, "MAIN_ADMIN_REQUIRED", "Main admin (owner or admin) role required");
}

/** Permission A: manage employees (and related employee fields). */
export function requireManageEmployees(req: Request, res: Response, next: NextFunction): void {
  if (req.orgMemberPermissions?.manageEmployees) {
    next();
    return;
  }
  deny(res, "PERMISSION_MANAGE_EMPLOYEES", "Manage employees permission required");
}

/** Permission B: virtual cards area without API key access (integration routes use requireMainAgencyAdmin). */
export function requireViewCardsAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.orgMemberPermissions?.viewCardsHideKeys) {
    next();
    return;
  }
  deny(res, "PERMISSION_VIEW_CARDS", "View cards (without API keys) permission required");
}

export function requireManageEmployeesOrViewCards(req: Request, res: Response, next: NextFunction): void {
  const p = req.orgMemberPermissions;
  if (p?.manageEmployees || p?.viewCardsHideKeys) {
    next();
    return;
  }
  deny(res, "PERMISSION_CARD_OR_EMPLOYEES", "Manage employees or view cards permission required");
}

/** Permission C: card-to-admin fund transfers. */
export function requireCardAdminFundTransfer(req: Request, res: Response, next: NextFunction): void {
  if (req.orgMemberPermissions?.cardAdminFundTransfer) {
    next();
    return;
  }
  deny(res, "PERMISSION_FUND_TRANSFER", "Card-to-admin fund transfer permission required");
}
