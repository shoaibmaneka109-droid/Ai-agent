import { Router } from "express";
import { z } from "zod";

import { HttpError } from "../../middleware/error-handler.js";
import { authenticateJwt } from "../../middleware/authenticate-jwt.js";
import { hashPassword, verifyPassword } from "../../security/password.js";
import { signAccessToken } from "../../security/jwt.js";
import { AuthRepository, type AuthMembershipRow } from "./auth.repository.js";
import { getTrialPolicy } from "../subscriptions/trial-policy.js";
import type { OrganizationRole } from "@securepay/shared";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  fullName: z.string().min(1).max(160),
  accountType: z.enum(["solo", "agency"]),
  tenantSlug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
  organizationName: z.string().min(1).max(160),
  organizationSlug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantSlug: z.string().min(1).optional()
});

const repository = new AuthRepository();
export const authRouter = Router();

const issueAuthResponse = async (params: {
  user: {
    id: string;
    email: string;
    full_name: string;
  };
  membership: AuthMembershipRow;
}) => {
  const token = signAccessToken({
    sub: params.user.id,
    email: params.user.email,
    tenantId: params.membership.tenant_id,
    tenantSlug: params.membership.tenant_slug,
    organizationId: params.membership.organization_id,
    organizationSlug: params.membership.organization_slug,
    role: params.membership.role
  });

  return {
    accessToken: token,
    user: {
      id: params.user.id,
      email: params.user.email,
      fullName: params.user.full_name
    },
    tenant: {
      id: params.membership.tenant_id,
      slug: params.membership.tenant_slug,
      accountType: params.membership.account_type,
      subscriptionStatus: params.membership.subscription_status,
      trialEndsAt: params.membership.trial_ends_at?.toISOString() ?? null
    },
    organization: {
      id: params.membership.organization_id,
      slug: params.membership.organization_slug,
      role: params.membership.role
    }
  };
};

authRouter.post("/register", async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const trial = getTrialPolicy(body.accountType);
    const passwordHash = await hashPassword(body.password);

    const registration = await repository.registerTenant({
      email: body.email,
      passwordHash,
      fullName: body.fullName,
      accountType: body.accountType,
      tenantSlug: body.tenantSlug,
      organizationName: body.organizationName,
      organizationSlug: body.organizationSlug,
      trialDays: trial.trialDays
    });

    const auth = await issueAuthResponse({
      user: registration.user,
      membership: registration.membership
    });

    res.status(201).json({ data: auth });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await repository.findUserByEmail(body.email);

    if (!user || !(await verifyPassword(body.password, user.password_hash))) {
      throw new HttpError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    }

    const membership = await repository.findPrimaryMembership(user.id, body.tenantSlug);

    if (!membership) {
      throw new HttpError(403, "No tenant membership found for this user", "TENANT_MEMBERSHIP_REQUIRED");
    }

    await repository.markLogin(user.id);

    const auth = await issueAuthResponse({
      user,
      membership
    });

    res.json({ data: auth });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", authenticateJwt, async (req, res) => {
  res.json({ data: req.auth });
});
