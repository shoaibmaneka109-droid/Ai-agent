import type { NextFunction, Request, Response } from "express";

export type TenantRequest = Request & {
  tenantContext: {
    tenantId: string;
    organizationId?: string;
  };
};

export type OrganizationTenantRequest = Request & {
  tenantContext: {
    tenantId: string;
    organizationId: string;
  };
};

export type TenantRequestHandler = (
  req: TenantRequest,
  res: Response,
  next: NextFunction
) => void | Promise<void>;

export const getTenantContext = (req: Request): TenantRequest["tenantContext"] => {
  if (!req.tenantContext) {
    throw new Error("Tenant context has not been initialized");
  }

  return req.tenantContext;
};

export const getOrganizationContext = (req: Request): OrganizationTenantRequest["tenantContext"] => {
  if (!req.tenantContext?.organizationId) {
    throw new Error("Organization tenant context has not been initialized");
  }

  return {
    tenantId: req.tenantContext.tenantId,
    organizationId: req.tenantContext.organizationId
  };
};

export function tenantContext(req: Request, _res: Response, next: NextFunction) {
  const tenantId = req.header("x-tenant-id");
  const organizationId = req.header("x-organization-id");

  if (tenantId) {
    req.tenantContext = {
      tenantId,
      organizationId: organizationId || undefined
    };
  }

  next();
}

export function requireTenantContext(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantContext) {
    res.status(400).json({ error: "Missing x-tenant-id header" });
    return;
  }

  next();
}

export function requireOrganizationContext(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantContext?.organizationId) {
    res.status(400).json({ error: "Missing x-organization-id header" });
    return;
  }

  next();
}
