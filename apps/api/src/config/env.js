const REQUIRED_IN_PROD = ["DATABASE_URL", "ENCRYPTION_MASTER_KEY"];

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
};

module.exports = {
  env,
  assertEnvironment,
};
