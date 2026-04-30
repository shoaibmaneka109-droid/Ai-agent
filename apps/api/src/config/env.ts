import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load apps/api/.env when running from repo root or from apps/api
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const port = Number(process.env.PORT ?? 4000);

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

/** 32-byte key for AES-256-GCM (base64-encoded). */
export function loadMasterKey(): Buffer {
  const b64 = requireEnv("SECUREPAY_MASTER_KEY_BASE64");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error(
      "SECUREPAY_MASTER_KEY_BASE64 must decode to exactly 32 bytes for AES-256"
    );
  }
  return key;
}

export const env = {
  port,
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: process.env.DATABASE_URL,
  masterKey: () => loadMasterKey(),
};
