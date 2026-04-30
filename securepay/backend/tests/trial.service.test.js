/**
 * Unit tests for trial.service.js — computeAccess and business rules
 *
 * These tests run against the pure computeAccess() function (no DB) so they
 * are fast and deterministic. The integration tests (DB-backed) live in
 * tests/integration/.
 */

const { computeAccess, TRIAL_DAYS, AGENCY_TRIAL_EMPLOYEE_CAP } = require('../src/services/trial.service');

// ─── Constants ────────────────────────────────────────────────────────────────

describe('Business rule constants', () => {
  test('Solo trial is 15 days', () => {
    expect(TRIAL_DAYS.solo).toBe(15);
  });

  test('Agency trial is 30 days', () => {
    expect(TRIAL_DAYS.agency).toBe(30);
  });

  test('Agency trial employee cap is 9', () => {
    expect(AGENCY_TRIAL_EMPLOYEE_CAP).toBe(9);
  });
});

// ─── computeAccess ────────────────────────────────────────────────────────────

function makeTrialSub(overrides = {}) {
  const trialEnd = overrides.trialEnd ?? new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  return {
    status: 'trialing',
    trial_end: trialEnd,
    grace_period_hours: 24,
    api_access: true,
    autofill_access: true,
    data_read_only: false,
    ...overrides,
  };
}

describe('computeAccess — null / missing subscription', () => {
  test('returns locked access with no_subscription status', () => {
    const access = computeAccess(null);
    expect(access.apiAccess).toBe(false);
    expect(access.autofillAccess).toBe(false);
    expect(access.dataReadOnly).toBe(true);
    expect(access.accessStatus).toBe('no_subscription');
  });
});

describe('computeAccess — active subscription', () => {
  test('full access', () => {
    const access = computeAccess({ status: 'active', trial_end: null, grace_period_hours: 24 });
    expect(access.apiAccess).toBe(true);
    expect(access.autofillAccess).toBe(true);
    expect(access.dataReadOnly).toBe(false);
    expect(access.accessStatus).toBe('full');
    expect(access.reason).toBeNull();
  });
});

describe('computeAccess — trialing (within trial window)', () => {
  test('full access during trial', () => {
    const sub = makeTrialSub({
      trialEnd: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
    const access = computeAccess(sub);
    expect(access.apiAccess).toBe(true);
    expect(access.autofillAccess).toBe(true);
    expect(access.dataReadOnly).toBe(false);
    expect(access.accessStatus).toBe('full');
  });
});

describe('computeAccess — trialing (trial expired, within grace period)', () => {
  test('still has full access during grace window', () => {
    // trial_end was 1 hour ago; grace period is 24h → 23h remaining
    const sub = makeTrialSub({
      trial_end: new Date(Date.now() - 60 * 60 * 1000),
      grace_period_hours: 24,
    });
    const access = computeAccess(sub);
    expect(access.apiAccess).toBe(true);
    expect(access.autofillAccess).toBe(true);
    expect(access.accessStatus).toBe('grace');
    expect(access.reason).toContain('Grace period ends');
  });
});

describe('computeAccess — trialing (trial expired, grace period over)', () => {
  test('access locked — treated as hibernated', () => {
    // trial_end was 2 days ago; grace period is 24h → effectively hibernated
    const sub = makeTrialSub({
      trial_end: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      grace_period_hours: 24,
    });
    const access = computeAccess(sub);
    expect(access.apiAccess).toBe(false);
    expect(access.autofillAccess).toBe(false);
    expect(access.dataReadOnly).toBe(true);
    expect(access.accessStatus).toBe('hibernated');
  });
});

describe('computeAccess — hibernating', () => {
  test('data read-only, API + autofill locked', () => {
    const sub = { status: 'hibernating', trial_end: null, grace_period_hours: 24 };
    const access = computeAccess(sub);
    expect(access.apiAccess).toBe(false);
    expect(access.autofillAccess).toBe(false);
    expect(access.dataReadOnly).toBe(true);
    expect(access.accessStatus).toBe('hibernated');
    expect(access.reason).toContain('data is safe');
  });
});

describe('computeAccess — past_due', () => {
  test('still has access but flagged', () => {
    const sub = { status: 'past_due', trial_end: null, grace_period_hours: 0 };
    const access = computeAccess(sub);
    expect(access.apiAccess).toBe(true);
    expect(access.autofillAccess).toBe(true);
    expect(access.dataReadOnly).toBe(false);
    expect(access.accessStatus).toBe('past_due');
    expect(access.reason).toContain('past due');
  });
});

describe('computeAccess — cancelled', () => {
  test('data read-only, features locked', () => {
    const sub = { status: 'cancelled', trial_end: null, grace_period_hours: 0 };
    const access = computeAccess(sub);
    expect(access.apiAccess).toBe(false);
    expect(access.autofillAccess).toBe(false);
    expect(access.dataReadOnly).toBe(true);
    expect(access.accessStatus).toBe('locked');
  });
});

describe('computeAccess — unpaid', () => {
  test('data read-only, features locked', () => {
    const sub = { status: 'unpaid', trial_end: null, grace_period_hours: 0 };
    const access = computeAccess(sub);
    expect(access.apiAccess).toBe(false);
    expect(access.autofillAccess).toBe(false);
    expect(access.dataReadOnly).toBe(true);
    expect(access.accessStatus).toBe('locked');
  });
});
