import { Router } from "express";
import { z } from "zod";

import {
  requireTenantContext,
  getTenantContext,
  type TenantRequestHandler
} from "../../middleware/tenant-context.js";
import { OrganizationRepository } from "./organization.repository.js";

const createOrganizationSchema = z.object({
  name: z.string().min(1).max(160),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
  accountType: z.enum(["solo", "agency"]),
  legalName: z.string().max(240).optional(),
  billingEmail: z.string().email().optional()
});

export const organizationRouter = Router();
const repository = new OrganizationRepository();

const listOrganizations: TenantRequestHandler = async (request, response, next) => {
  try {
    const { tenantId } = getTenantContext(request);
    const organizations = await repository.listByTenant(tenantId);
    response.json({ data: organizations });
  } catch (error) {
    next(error);
  }
};

const createOrganization: TenantRequestHandler = async (request, response, next) => {
  try {
    const { tenantId } = getTenantContext(request);
    const body = createOrganizationSchema.parse(request.body);

    const organization = await repository.create({
      tenantId,
      name: body.name,
      slug: body.slug,
      accountType: body.accountType,
      legalName: body.legalName,
      billingEmail: body.billingEmail
    });

    response.status(201).json({ data: organization });
  } catch (error) {
    next(error);
  }
};

organizationRouter.get("/", requireTenantContext, listOrganizations);
organizationRouter.post("/", requireTenantContext, createOrganization);
