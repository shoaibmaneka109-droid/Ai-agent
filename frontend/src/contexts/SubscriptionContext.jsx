/**
 * SubscriptionContext
 *
 * Provides the current subscription snapshot to all components.
 * Sources:
 *   1. user.subscription from AuthContext (set on login, cheapest path)
 *   2. Refreshed from GET /subscription on mount (always live)
 *   3. Updated whenever a `securepay:hibernated` DOM event fires (from 402 responses)
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { getSubscriptionStatus } from '../services/subscription.service';

const SubscriptionContext = createContext(null);

export function SubscriptionProvider({ children }) {
  const { user }  = useAuth();
  const orgSlug   = user?.orgSlug || user?.org_slug;

  const [subscription, setSubscription] = useState(user?.subscription ?? null);
  const [loading, setLoading]           = useState(false);

  const refresh = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const sub = await getSubscriptionStatus(orgSlug);
      setSubscription(sub);
    } catch {
      // silently ignore — subscription from auth token still shows
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  // Fresh fetch on mount / org change
  useEffect(() => {
    if (orgSlug) refresh();
  }, [orgSlug, refresh]);

  // Listen for 402 events dispatched by the Axios interceptor
  useEffect(() => {
    const handler = (e) => {
      if (e.detail) setSubscription((prev) => ({ ...prev, ...e.detail }));
      else refresh();
    };
    window.addEventListener('securepay:hibernated', handler);
    return () => window.removeEventListener('securepay:hibernated', handler);
  }, [refresh]);

  // Sync if user object changes (e.g. after re-login)
  useEffect(() => {
    if (user?.subscription) setSubscription(user.subscription);
  }, [user]);

  return (
    <SubscriptionContext.Provider value={{ subscription, loading, refresh }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider');
  return ctx;
}
