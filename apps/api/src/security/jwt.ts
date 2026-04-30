import type { OrganizationRole } from "@securepay/shared";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export type AuthTokenPayload = {
  sub: string;
  email: string;
  tenantId: string;
  tenantSlug: string;
  organizationId: string;
  organizationSlug: string;
  role: OrganizationRole;
};

export type JwtClaims = AuthTokenPayload;

export const signAccessToken = (payload: AuthTokenPayload): string =>
  jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
    issuer: "securepay-api",
    audience: "securepay-app"
  });

export const verifyAccessToken = (token: string): AuthTokenPayload =>
  jwt.verify(token, env.jwtSecret, {
    issuer: "securepay-api",
    audience: "securepay-app"
  }) as AuthTokenPayload;
