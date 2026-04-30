#!/usr/bin/env node
/**
 * Generates cryptographically secure secrets for the .env file.
 * Run once during initial setup: node scripts/generate-secrets.js
 */
const crypto = require('crypto');

const secrets = {
  JWT_ACCESS_SECRET:  crypto.randomBytes(48).toString('hex'),
  JWT_REFRESH_SECRET: crypto.randomBytes(48).toString('hex'),
  ENCRYPTION_KEY:     crypto.randomBytes(32).toString('hex'),
};

console.log('\n# Paste these into your .env file:\n');
for (const [key, value] of Object.entries(secrets)) {
  console.log(`${key}=${value}`);
}
console.log('\n# Keep these secret and never commit them to version control.\n');
