/**
 * Shared constants and type definitions used across backend and frontend.
 * In a TypeScript project, these would be TypeScript interfaces/enums.
 */

const USER_ROLES = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
});

const ORG_PLANS = Object.freeze({
  SOLO: 'solo',
  AGENCY: 'agency',
});

const ORG_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  CANCELLED: 'cancelled',
});

const API_KEY_PROVIDERS = Object.freeze({
  STRIPE: 'stripe',
  AIRWALLEX: 'airwallex',
  CUSTOM: 'custom',
});

const API_KEY_ENVS = Object.freeze({
  LIVE: 'live',
  TEST: 'test',
});

const PAYMENT_STATUSES = Object.freeze({
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
});

const CURRENCIES = Object.freeze(['USD', 'EUR', 'GBP', 'AUD', 'SGD', 'HKD']);

const PLAN_LIMITS = Object.freeze({
  solo: { maxMembers: 1, maxApiKeys: 2 },
  agency: { maxMembers: Infinity, maxApiKeys: 10 },
});

module.exports = {
  USER_ROLES,
  ORG_PLANS,
  ORG_STATUS,
  API_KEY_PROVIDERS,
  API_KEY_ENVS,
  PAYMENT_STATUSES,
  CURRENCIES,
  PLAN_LIMITS,
};
