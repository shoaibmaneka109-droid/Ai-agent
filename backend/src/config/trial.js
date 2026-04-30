/**
 * Central trial & subscription configuration.
 * All business rules for trial periods and plan limits live here.
 */

const TRIAL_CONFIG = {
  solo: {
    trialDays: 15,
    memberLimit: 1,      // solo = just the owner
  },
  agency: {
    trialDays: 30,
    memberLimit: 9,      // owner + 8 employees during trial
  },
};

/**
 * Return the trial end date given an org type and start timestamp.
 */
const getTrialEndDate = (orgType, startsAt = new Date()) => {
  const days = TRIAL_CONFIG[orgType]?.trialDays ?? 15;
  const end = new Date(startsAt);
  end.setDate(end.getDate() + days);
  return end;
};

/**
 * Return the member (seat) limit that applies during a trial.
 * Agency trial: owner counts as 1 of 9 (i.e. up to 8 additional employees).
 */
const getTrialMemberLimit = (orgType) => TRIAL_CONFIG[orgType]?.memberLimit ?? 1;

/**
 * Days remaining until the trial ends (negative when expired).
 */
const trialDaysRemaining = (trialEndsAt) => {
  if (!trialEndsAt) return 0;
  return Math.ceil((new Date(trialEndsAt) - Date.now()) / (1000 * 60 * 60 * 24));
};

module.exports = { TRIAL_CONFIG, getTrialEndDate, getTrialMemberLimit, trialDaysRemaining };
