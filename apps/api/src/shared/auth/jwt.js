const crypto = require("crypto");

const { env } = require("../../config/env");

const DEFAULT_ACCESS_TTL_SECONDS = 60 * 15;
const DEFAULT_REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30;

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const padded = padding === 0 ? normalized : normalized + "=".repeat(4 - padding);
  return Buffer.from(padded, "base64").toString("utf8");
}

function parseTtl(value, fallbackSeconds) {
  if (!value) {
    return fallbackSeconds;
  }

  if (/^\d+$/.test(String(value))) {
    return Number(value);
  }

  const match = String(value).trim().match(/^(\d+)([smhd])$/i);
  if (!match) {
    return fallbackSeconds;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 60 * 60 * 24,
  };

  return amount * multipliers[unit];
}

function getSecret(secretValue, label) {
  if (String(secretValue || "").length < 16) {
    throw new Error(`${label} must be at least 16 characters long.`);
  }

  return secretValue;
}

function getAccessSecret() {
  return getSecret(env.jwtAccessSecret, "JWT_ACCESS_SECRET");
}

function getRefreshSecret() {
  return getSecret(env.jwtRefreshSecret, "JWT_REFRESH_SECRET");
}

function signJwt(payload, options = {}) {
  const header = {
    alg: "HS256",
    typ: "JWT",
  };
  const issuedAt = Math.floor(Date.now() / 1000);
  const ttlSeconds = options.ttlSeconds || DEFAULT_ACCESS_TTL_SECONDS;
  const fullPayload = {
    ...payload,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac("sha256", options.secret)
    .update(unsignedToken)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${unsignedToken}.${signature}`;
}

function verifyJwt(token, secret) {
  if (!token || typeof token !== "string") {
    throw new Error("Token is required.");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format.");
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(unsignedToken)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const provided = Buffer.from(signature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    throw new Error("Invalid token signature.");
  }

  const header = JSON.parse(base64UrlDecode(encodedHeader));
  if (header.alg !== "HS256") {
    throw new Error("Unsupported token algorithm.");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    throw new Error("Token has expired.");
  }

  return payload;
}

function signAccessToken(payload, ttlSeconds = DEFAULT_ACCESS_TTL_SECONDS) {
  return signJwt(payload, {
    ttlSeconds,
    secret: getAccessSecret(),
  });
}

function signRefreshToken(payload, ttlSeconds = DEFAULT_REFRESH_TTL_SECONDS) {
  return signJwt(payload, {
    ttlSeconds,
    secret: getRefreshSecret(),
  });
}

function verifyAccessToken(token) {
  const payload = verifyJwt(token, getAccessSecret());
  if (payload.type !== "access") {
    throw new Error("Invalid access token.");
  }

  return payload;
}

function verifyRefreshToken(token) {
  const payload = verifyJwt(token, getRefreshSecret());
  if (payload.type !== "refresh") {
    throw new Error("Invalid refresh token.");
  }

  return payload;
}

function getTokenExpiryFromNow() {
  return {
    accessTokenTtl: parseTtl(env.jwtAccessTtl, DEFAULT_ACCESS_TTL_SECONDS),
    refreshTokenTtl: parseTtl(env.jwtRefreshTtl, DEFAULT_REFRESH_TTL_SECONDS),
  };
}

module.exports = {
  DEFAULT_ACCESS_TTL_SECONDS,
  DEFAULT_REFRESH_TTL_SECONDS,
  getTokenExpiryFromNow,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
