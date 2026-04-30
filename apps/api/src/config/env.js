const REQUIRED_IN_PROD = [
  "DATABASE_URL",
  "ENCRYPTION_MASTER_KEY",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
];

function assertEnvironment() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const missing = REQUIRED_IN_PROD.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}

const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || "development",
  appUrl: process.env.WEB_ORIGIN || "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL || "",
  encryptionMasterKey: process.env.ENCRYPTION_MASTER_KEY || "",
  jwtIssuer: process.env.JWT_ISSUER || "securepay-api",
  jwtAudience: process.env.JWT_AUDIENCE || "securepay-app",
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "dev-access-secret",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret",
  jwtAccessTtl: process.env.JWT_ACCESS_TTL || "15m",
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL || "30d",
};

module.exports = {
  env,
  assertEnvironment,
};
