import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  userType: "solo" | "agency";
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const days = env.jwtExpiresInDays;
  return jwt.sign(
    { email: payload.email, userType: payload.userType },
    env.jwtSecret,
    {
      subject: payload.sub,
      expiresIn: `${days}d`,
    }
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
  const sub = decoded.sub;
  const email = decoded.email;
  const userType = decoded.userType;
  if (typeof sub !== "string" || typeof email !== "string") {
    throw new Error("Invalid token payload");
  }
  if (userType !== "solo" && userType !== "agency") {
    throw new Error("Invalid token userType");
  }
  return { sub, email, userType };
}
