import { Router } from "express";
import type { Request, Response } from "express";
import { signAccessToken } from "../../lib/jwt.js";
import { env } from "../../config/env.js";
import {
  findUserByEmail,
  findUserById,
  verifyPassword,
  registerSolo,
  registerAgencyAdmin,
} from "./auth.repository.js";
import { getOrganizationBillingState } from "../../lib/billing/orgBilling.js";
import { requireAuth } from "../../middleware/requireAuth.js";

const r = Router();

r.post("/register/solo", async (req: Request, res: Response) => {
  const body = req.body as {
    email?: string;
    password?: string;
    organizationName?: string;
    slug?: string;
  };
  if (!body.email || !body.password || !body.organizationName) {
    res.status(400).json({ error: "email, password, organizationName required" });
    return;
  }
  try {
    const { userId, organizationId } = await registerSolo({
      email: body.email,
      password: body.password,
      organizationName: body.organizationName,
      slug: body.slug,
    });
    const token = signAccessToken({
      sub: userId,
      email: body.email,
      userType: "solo",
    });
    res.status(201).json({ accessToken: token, userId, organizationId });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "23505") {
      res.status(409).json({ error: "Email or organization slug already in use" });
      return;
    }
    if (env.nodeEnv !== "production") console.error(e);
    res.status(500).json({ error: "Registration failed" });
  }
});

r.post("/register/agency", async (req: Request, res: Response) => {
  const body = req.body as {
    email?: string;
    password?: string;
    organizationName?: string;
    slug?: string;
  };
  if (!body.email || !body.password || !body.organizationName) {
    res.status(400).json({ error: "email, password, organizationName required" });
    return;
  }
  try {
    const { userId, organizationId } = await registerAgencyAdmin({
      email: body.email,
      password: body.password,
      organizationName: body.organizationName,
      slug: body.slug,
    });
    const token = signAccessToken({
      sub: userId,
      email: body.email,
      userType: "agency",
    });
    res.status(201).json({ accessToken: token, userId, organizationId });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "23505") {
      res.status(409).json({ error: "Email or organization slug already in use" });
      return;
    }
    if (env.nodeEnv !== "production") console.error(e);
    res.status(500).json({ error: "Registration failed" });
  }
});

r.post("/login", async (req: Request, res: Response) => {
  const body = req.body as { email?: string; password?: string };
  if (!body.email || !body.password) {
    res.status(400).json({ error: "email and password required" });
    return;
  }
  try {
    const user = await findUserByEmail(body.email);
    if (!user || !(await verifyPassword(body.password, user.password_hash))) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    if (!user.default_org_id) {
      res.status(500).json({ error: "User has no default organization" });
      return;
    }
    const token = signAccessToken({
      sub: user.id,
      email: user.email,
      userType: user.user_type,
    });
    res.json({
      accessToken: token,
      userId: user.id,
      defaultOrganizationId: user.default_org_id,
      userType: user.user_type,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("DATABASE_URL")) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    if (env.nodeEnv !== "production") console.error(e);
    res.status(500).json({ error: "Login failed" });
  }
});

r.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.auth!.userId);
    if (!user || !user.default_org_id) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const billing = await getOrganizationBillingState(user.default_org_id);
    if (!billing) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }
    res.json({
      user: {
        id: user.id,
        email: user.email,
        userType: user.user_type,
        defaultOrganizationId: user.default_org_id,
      },
      billing: {
        accessMode: billing.accessMode,
        integrationsUnlocked: billing.integrationsUnlocked,
        isTrialActive: billing.isTrialActive,
        isPaidActive: billing.isPaidActive,
        trialEndsAt: billing.trialEndsAt.toISOString(),
        subscriptionEndsAt: billing.subscriptionEndsAt?.toISOString() ?? null,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("DATABASE_URL")) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    throw e;
  }
});

export const authRoutes = r;
