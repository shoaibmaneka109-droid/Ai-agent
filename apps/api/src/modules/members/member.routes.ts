import { Router } from "express";
import { z } from "zod";

import { authenticateJwt } from "../../middleware/authenticate-jwt.js";
import { attachSubscriptionAccess, requireActiveSubscription } from "../../middleware/entitlements.js";
import { HttpError } from "../../middleware/error-handler.js";
import { getOrganizationContext, requireOrganizationContext } from "../../middleware/tenant-context.js";
import { hashPassword } from "../../security/password.js";
import { MemberRepository } from "./member.repository.js";
import { AGENCY_TRIAL_EMPLOYEE_LIMIT } from "../subscriptions/trial-policy.js";

const inviteEmployeeSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(160),
  password: z.string().min(12),
  role: z.enum(["admin", "member"]).default("member")
});

export const memberRouter = Router();
const repository = new MemberRepository();

memberRouter.post(
  "/employees",
  authenticateJwt,
  requireOrganizationContext,
  attachSubscriptionAccess,
  requireActiveSubscription,
  async (req, res, next) => {
    try {
      if (!req.auth || !["owner", "admin"].includes(req.auth.role)) {
        throw new HttpError(403, "Only agency owners and admins can add employees", "INSUFFICIENT_ROLE");
      }

      const { organizationId } = getOrganizationContext(req);
      const body = inviteEmployeeSchema.parse(req.body);
      const tenant = await repository.findTenantForOrganization(organizationId);

      if (!tenant) {
        throw new HttpError(404, "Organization not found", "ORGANIZATION_NOT_FOUND");
      }

      if (tenant.account_type !== "agency") {
        throw new HttpError(422, "Solo tenants cannot add employees", "SOLO_EMPLOYEES_UNSUPPORTED");
      }

      if (tenant.subscription_status === "trialing") {
        const employeeCount = await repository.countAgencyTrialEmployees(organizationId);

        if (employeeCount >= AGENCY_TRIAL_EMPLOYEE_LIMIT) {
          throw new HttpError(
            403,
            "Agency trials can include up to 9 employees before upgrading.",
            "AGENCY_TRIAL_EMPLOYEE_LIMIT_REACHED"
          );
        }
      }

      const passwordHash = await hashPassword(body.password);
      const employee = await repository.addEmployee({
        organizationId,
        email: body.email,
        fullName: body.fullName,
        passwordHash,
        role: body.role
      });

      res.status(201).json({
        data: {
          id: employee.id,
          email: employee.email,
          fullName: employee.full_name,
          role: employee.role
        }
      });
    } catch (error) {
      next(error);
    }
  }
);
