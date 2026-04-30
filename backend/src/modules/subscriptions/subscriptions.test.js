/**
 * Unit tests for trial config and subscription business logic.
 * These tests do NOT require a database connection.
 */

const {
  getTrialEndDate,
  getTrialMemberLimit,
  trialDaysRemaining,
  TRIAL_CONFIG,
} = require('../../config/trial');

describe('TRIAL_CONFIG', () => {
  test('solo trial is 15 days with member limit 1', () => {
    expect(TRIAL_CONFIG.solo.trialDays).toBe(15);
    expect(TRIAL_CONFIG.solo.memberLimit).toBe(1);
  });

  test('agency trial is 30 days with member limit 9', () => {
    expect(TRIAL_CONFIG.agency.trialDays).toBe(30);
    expect(TRIAL_CONFIG.agency.memberLimit).toBe(9);
  });
});

describe('getTrialEndDate', () => {
  test('solo trial ends 15 days from start', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const end = getTrialEndDate('solo', start);
    expect(end.toISOString().slice(0, 10)).toBe('2026-01-16');
  });

  test('agency trial ends 30 days from start', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const end = getTrialEndDate('agency', start);
    expect(end.toISOString().slice(0, 10)).toBe('2026-01-31');
  });

  test('unknown type defaults to 15 days', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const end = getTrialEndDate('unknown_type', start);
    expect(end.toISOString().slice(0, 10)).toBe('2026-01-16');
  });

  test('uses current date when no start provided', () => {
    const before = Date.now();
    const end = getTrialEndDate('solo');
    const after = Date.now();
    // end should be ~15 days from now
    const expectedMs15 = 15 * 24 * 60 * 60 * 1000;
    expect(end.getTime() - before).toBeGreaterThanOrEqual(expectedMs15 - 1000);
    expect(end.getTime() - after).toBeLessThanOrEqual(expectedMs15 + 1000);
  });
});

describe('getTrialMemberLimit', () => {
  test('solo limit is 1', () => expect(getTrialMemberLimit('solo')).toBe(1));
  test('agency limit is 9', () => expect(getTrialMemberLimit('agency')).toBe(9));
  test('unknown defaults to 1', () => expect(getTrialMemberLimit('other')).toBe(1));
});

describe('trialDaysRemaining', () => {
  test('returns positive days for future date', () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const days = trialDaysRemaining(future);
    expect(days).toBeGreaterThanOrEqual(9);
    expect(days).toBeLessThanOrEqual(11);
  });

  test('returns 0 or negative for past date', () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(trialDaysRemaining(past)).toBeLessThanOrEqual(0);
  });

  test('returns 0 for null', () => {
    expect(trialDaysRemaining(null)).toBe(0);
  });

  test('returns 0 for undefined', () => {
    expect(trialDaysRemaining(undefined)).toBe(0);
  });
});

describe('Business rules derived from config', () => {
  test('agency trial allows up to 9 members (owner + 8 employees)', () => {
    // The owner occupies 1 seat, so 8 employees can be added
    const limit = getTrialMemberLimit('agency');
    const additionalEmployees = limit - 1; // subtract owner
    expect(additionalEmployees).toBe(8);
  });

  test('solo trial allows no additional members (owner only)', () => {
    const limit = getTrialMemberLimit('solo');
    expect(limit).toBe(1);
    expect(limit - 1).toBe(0); // no employees can be added
  });

  test('agency trial is exactly twice as long as solo trial', () => {
    expect(TRIAL_CONFIG.agency.trialDays).toBe(TRIAL_CONFIG.solo.trialDays * 2);
  });
});
