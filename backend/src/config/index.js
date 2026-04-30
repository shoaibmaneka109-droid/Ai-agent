require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 4000,

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    name: process.env.DB_NAME || 'securepay',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true',
    poolMin: parseInt(process.env.DB_POOL_MIN, 10) || 2,
    poolMax: parseInt(process.env.DB_POOL_MAX, 10) || 20,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  encryption: {
    // AES-256-GCM key must be 32-byte hex string (64 hex chars)
    masterKey: process.env.ENCRYPTION_MASTER_KEY,
  },

  cors: {
    origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  },
};

const REQUIRED = [
  ['JWT_SECRET',              config.jwt.secret],
  ['JWT_REFRESH_SECRET',      config.jwt.refreshSecret],
  ['ENCRYPTION_MASTER_KEY',   config.encryption.masterKey],
];

for (const [name, value] of REQUIRED) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

if (config.encryption.masterKey.length !== 64) {
  throw new Error('ENCRYPTION_MASTER_KEY must be a 64-character hex string (32 bytes)');
}

module.exports = config;
