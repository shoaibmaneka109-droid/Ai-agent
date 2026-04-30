/**
 * Unit tests for the subscription service.
 * These run without a live DB by mocking the database module.
 */

jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));
jest.mock('../../src/services/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const db = require('../../src/config/database');
const {
  PLAN_TRIAL_CONFIG,
  getSubscriptionContext,
  checkAndExpireIfNeeded,
  canAddMemberCheck,
} = require('../../src/services/subscription');

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeOrg = (overrides = {}) => ({
  id: 'org-1',
  plan_type: 'solo',
  subscription_status: 'trialing',
  trial_duration_days: 15,
  trial_ends_at: new Date(Date.now() + 10 * 86400000).toISOString(), // 10 days left
  trial_member_limit: 1,
  subscription_started_at: null,
  subscription_ends_at: null,
  hibernated_at: null,
  last_activated_at: null,
  created_at: new Date().toISOString(),
  ...overrides,
});

// ── PLAN_TRIAL_CONFIG ─────────────────────────────────────────────────────────

describe('PLAN_TRIAL_CONFIG', () => {
  test('solo plan has 15-day trial and 1 member limit', () => {
    expect(PLAN_TRIAL_CONFIG.solo.trialDays).toBe(15);
    expect(PLAN_TRIAL_CONFIG.solo.trialMemberLimit).toBe(1);
  });

  test('agency plan has 30-day trial and 10 member limit', () => {
    expect(PLAN_TRIAL_CONFIG.agency.trialDays).toBe(30);
    expect(PLAN_TRIAL_CONFIG.agency.trialMemberLimit).toBe(10);
  });
});

// ── getSubscriptionContext ────────────────────────────────────────────────────

describe('getSubscriptionContext', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns correct context for an active trial with days remaining', async () => {
    db.query.mockResolvedValueOnce({ rows: [makeOrg()] });
    const ctx = await getSubscriptionContext('org-1');

    expect(ctx.status).toBe('trialing');
    expect(ctx.trialDaysRemaining).toBeGreaterThan(0);
    expect(ctx.featuresLocked).toBe(false);
    expect(ctx.isTrialExpired).toBe(false);
    expect(ctx.canAddMembers).toBe(true);
  });

  test('flags isTrialExpired when trial_ends_at is in the past', async () => {
    db.query.mockResolvedValueOnce({
      rows: [makeOrg({ trial_ends_at: new Date(Date.now() - 1000).toISOString() })],
    });
    const ctx = await getSubscriptionContext('org-1');
    expect(ctx.isTrialExpired).toBe(true);
    expect(ctx.trialDaysRemaining).toBe(0);
  });

  test('featuresLocked is true when status is hibernating', async () => {
    db.query.mockResolvedValueOnce({
      rows: [makeOrg({ subscription_status: 'hibernating', hibernated_at: new Date().toISOString() })],
    });
    const ctx = await getSubscriptionContext('org-1');
    expect(ctx.featuresLocked).toBe(true);
    expect(ctx.isHibernating).toBe(true);
    expect(ctx.canAddMembers).toBe(false);
  });

  test('featuresLocked is true when status is cancelled', async () => {
    db.query.mockResolvedValueOnce({
      rows: [makeOrg({ subscription_status: 'cancelled' })],
    });
    const ctx = await getSubscriptionContext('org-1');
    expect(ctx.featuresLocked).toBe(true);
    expect(ctx.isCancelled).toBe(true);
  });

  test('active subscription with days remaining is not locked', async () => {
    db.query.mockResolvedValueOnce({
      rows: [makeOrg({
        subscription_status: 'active',
        subscription_started_at: new Date().toISOString(),
        subscription_ends_at: new Date(Date.now() + 20 * 86400000).toISOString(),
      })],
    });
    const ctx = await getSubscriptionContext('org-1');
    expect(ctx.status).toBe('active');
    expect(ctx.featuresLocked).toBe(false);
    expect(ctx.subscriptionDaysRemaining).toBeGreaterThan(0);
  });

  test('flags isSubscriptionExpired when subscription_ends_at is past', async () => {
    db.query.mockResolvedValueOnce({
      rows: [makeOrg({
        subscription_status: 'active',
        subscription_ends_at: new Date(Date.now() - 1000).toISOString(),
      })],
    });
    const ctx = await getSubscriptionContext('org-1');
    expect(ctx.isSubscriptionExpired).toBe(true);
  });

  test('throws if org not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(getSubscriptionContext('no-org')).rejects.toThrow('not found');
  });
});

// ── checkAndExpireIfNeeded ────────────────────────────────────────────────────

describe('checkAndExpireIfNeeded', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns "trialing" unchanged when trial is still valid', async () => {
    db.query.mockResolvedValueOnce({ rows: [makeOrg()] });
    const status = await checkAndExpireIfNeeded('org-1');
    expect(status).toBe('trialing');
  });

  test('hibernates the org when trial has expired', async () => {
    // First call: getSubscriptionContext
    db.query.mockResolvedValueOnce({
      rows: [makeOrg({ trial_ends_at: new Date(Date.now() - 1000).toISOString() })],
    });
    // enterHibernation transaction
    db.transaction = jest.fn().mockImplementation(async (cb) => {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ subscription_status: 'trialing' }] }) // SELECT FOR UPDATE
          .mockResolvedValueOnce({})   // UPDATE
          .mockResolvedValueOnce({}),  // INSERT event
      };
      return cb(client);
    });

    const status = await checkAndExpireIfNeeded('org-1');
    expect(status).toBe('hibernating');
  });

  test('returns current status unchanged when already hibernating', async () => {
    db.query.mockResolvedValueOnce({
      rows: [makeOrg({ subscription_status: 'hibernating', hibernated_at: new Date().toISOString() })],
    });
    const status = await checkAndExpireIfNeeded('org-1');
    expect(status).toBe('hibernating');
  });
});

// ── canAddMemberCheck ─────────────────────────────────────────────────────────

describe('canAddMemberCheck', () => {
  beforeEach(() => jest.clearAllMocks());

  test('allows adding when trialing and under seat limit', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [makeOrg({ trial_member_limit: 10 })] }) // context
      .mockResolvedValueOnce({ rows: [{ count: '5' }] });                       // seat count
    const result = await canAddMemberCheck('org-1');
    expect(result.allowed).toBe(true);
  });

  test('blocks adding when trialing and at seat limit', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [makeOrg({ trial_member_limit: 10 })] })
      .mockResolvedValueOnce({ rows: [{ count: '10' }] });
    const result = await canAddMemberCheck('org-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/10 active members/);
  });

  test('blocks adding when hibernating', async () => {
    db.query.mockResolvedValueOnce({
      rows: [makeOrg({ subscription_status: 'hibernating', hibernated_at: new Date().toISOString() })],
    });
    const result = await canAddMemberCheck('org-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/reactivate/i);
  });

  test('allows unlimited members on active (paid) subscription', async () => {
    db.query.mockResolvedValueOnce({
      rows: [makeOrg({
        subscription_status: 'active',
        subscription_ends_at: new Date(Date.now() + 20 * 86400000).toISOString(),
        trial_member_limit: 10,
      })],
    });
    const result = await canAddMemberCheck('org-1');
    expect(result.allowed).toBe(true);
  });
});
