import "dotenv/config";

const required = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  encryptionKey: required("ENCRYPTION_KEY_BASE64"),
  encryptionKeyVersion: Number(process.env.ENCRYPTION_KEY_VERSION ?? 1),
  jwtSecret: required("JWT_SECRET"),
  jwtIssuer: process.env.JWT_ISSUER ?? "securepay-api",
  jwtAudience: process.env.JWT_AUDIENCE ?? "securepay-app",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1h",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173"
};
