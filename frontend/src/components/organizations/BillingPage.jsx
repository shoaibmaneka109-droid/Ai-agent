import React, { useEffect, useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { subscriptionApi } from '../../services/api';
import { updateSubscription } from '../../store/slices/authSlice';
import Card from '../common/Card';
import Button from '../common/Button';
import Badge from '../common/Badge';

const STATUS_BADGE = {
  trialing: 'primary',
  active: 'success',
  hibernating: 'danger',
  cancelled: 'default',
};

const STATUS_LABEL = {
  trialing: '🕐 Free Trial',
  active: '✅ Active',
  hibernating: '🔒 Hibernating',
  cancelled: '⛔ Cancelled',
};

function InfoRow({ label, value, valueStyle = {} }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, ...valueStyle }}>{value}</span>
    </div>
  );
}

function ProgressBar({ value, max, color = 'var(--color-primary)' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ background: 'var(--color-surface-2)', borderRadius: 4, height: 8, overflow: 'hidden', marginTop: 6 }}>
      <div style={{ width: `${pct}%`, background: pct >= 80 ? 'var(--color-danger)' : color, height: '100%', borderRadius: 4, transition: 'width 0.3s ease' }} />
    </div>
  );
}

export default function BillingPage() {
  const dispatch = useDispatch();
  const org = useSelector((s) => s.auth.organization);
  const sub = useSelector((s) => s.auth.subscription);
  const { role } = useSelector((s) => s.auth.user) || {};

  const [fullSub, setFullSub] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [actionErr, setActionErr] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, eventsRes] = await Promise.all([
        subscriptionApi.getStatus(),
        subscriptionApi.getEvents(),
      ]);
      setFullSub(statusRes.data);
      setEvents(eventsRes.data);
      dispatch(updateSubscription(statusRes.data));
    } catch {}
    setLoading(false);
  }, [dispatch]);

  useEffect(() => { loadData(); }, [loadData]);

  const data = fullSub || sub;

  const handleActivate = async () => {
    setActivating(true);
    setActionMsg('');
    setActionErr('');
    try {
      const res = await subscriptionApi.activate({ durationDays: 30 });
      dispatch(updateSubscription(res.data.subscription));
      setActionMsg('Subscription activated for 30 days.');
      loadData();
    } catch (err) {
      setActionErr(err.response?.data?.error || 'Activation failed');
    }
    setActivating(false);
  };

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel your subscription? Your data will be preserved in hibernation.')) return;
    setCancelling(true);
    setActionErr('');
    try {
      await subscriptionApi.cancel({ note: 'Cancelled via billing page' });
      setActionMsg('Subscription cancelled. Your data is safe in hibernation.');
      loadData();
    } catch (err) {
      setActionErr(err.response?.data?.error || 'Cancellation failed');
    }
    setCancelling(false);
  };

  const handleSimulateExpire = async () => {
    if (!window.confirm('[DEV] Simulate subscription expiry and enter hibernation?')) return;
    setSimulating(true);
    try {
      await subscriptionApi.simulateExpire();
      setActionMsg('Hibernation simulated. Refresh to see the locked state.');
      loadData();
    } catch (err) {
      setActionErr(err.response?.data?.error || 'Simulation failed');
    }
    setSimulating(false);
  };

  if (loading || !data) {
    return (
      <div style={{ padding: '32px 36px', color: 'var(--color-text-muted)', fontSize: 14 }}>
        Loading billing information…
      </div>
    );
  }

  const isOwner = role === 'owner';
  const daysBar = data.status === 'trialing'
    ? { value: data.trialDurationDays - (data.trialDaysRemaining || 0), max: data.trialDurationDays, label: `${data.trialDaysRemaining ?? 0} days remaining` }
    : data.status === 'active'
    ? { value: 30 - (data.subscriptionDaysRemaining || 0), max: 30, label: `${data.subscriptionDaysRemaining ?? 0} days remaining` }
    : null;

  const eventTypeLabelMap = {
    trial_started: 'Trial Started',
    trial_expired: 'Trial Expired',
    subscription_activated: 'Subscription Activated',
    subscription_renewed: 'Subscription Renewed',
    subscription_expired: 'Subscription Expired',
    hibernation_entered: 'Hibernation Entered',
    subscription_cancelled: 'Subscription Cancelled',
    subscription_reactivated: 'Subscription Reactivated',
  };

  return (
    <div style={{ padding: '32px 36px', maxWidth: 800 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Billing & Subscription</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 4 }}>
          Manage your plan, trial, and payment status
        </p>
      </div>

      {actionMsg && (
        <div style={{ background: 'var(--color-success-light)', border: '1px solid var(--color-success)', borderRadius: 6, padding: '10px 14px', color: 'var(--color-success)', fontSize: 13, marginBottom: 16 }}>
          {actionMsg}
        </div>
      )}
      {actionErr && (
        <div style={{ background: 'var(--color-danger-light)', border: '1px solid var(--color-danger)', borderRadius: 6, padding: '10px 14px', color: 'var(--color-danger)', fontSize: 13, marginBottom: 16 }}>
          {actionErr}
        </div>
      )}

      {/* Current status card */}
      <Card title="Current Plan" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div
            style={{
              width: 52,
              height: 52,
              background: data.status === 'hibernating' ? 'var(--color-danger-light)' : 'var(--color-primary-light)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
            }}
          >
            {org?.planType === 'agency' ? '🏢' : '👤'}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>
              {org?.planType === 'agency' ? 'Agency Plan' : 'Solo Plan'}
            </div>
            <Badge variant={STATUS_BADGE[data.status] || 'default'}>
              {STATUS_LABEL[data.status] || data.status}
            </Badge>
          </div>
        </div>

        {daysBar && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4 }}>
              <span>{data.status === 'trialing' ? 'Trial usage' : 'Subscription period'}</span>
              <span>{daysBar.label}</span>
            </div>
            <ProgressBar value={daysBar.value} max={daysBar.max} />
          </div>
        )}

        <InfoRow label="Plan" value={org?.planType === 'agency' ? 'Agency (Team)' : 'Solo (Individual)'} />
        <InfoRow label="Status" value={STATUS_LABEL[data.status] || data.status} />
        {data.status === 'trialing' && (
          <>
            <InfoRow
              label="Trial Ends"
              value={data.trialEndsAt ? new Date(data.trialEndsAt).toLocaleDateString() : '—'}
              valueStyle={(data.trialDaysRemaining ?? 0) <= 3 ? { color: 'var(--color-warning)' } : {}}
            />
            <InfoRow label="Trial Duration" value={`${data.trialDurationDays} days`} />
            {org?.planType === 'agency' && (
              <InfoRow label="Trial Seat Limit" value={`${data.trialMemberLimit} members`} />
            )}
          </>
        )}
        {data.status === 'active' && (
          <InfoRow
            label="Subscription Ends"
            value={data.subscriptionEndsAt ? new Date(data.subscriptionEndsAt).toLocaleDateString() : '—'}
          />
        )}
        {data.status === 'hibernating' && (
          <InfoRow
            label="Hibernated Since"
            value={data.hibernatedAt ? new Date(data.hibernatedAt).toLocaleDateString() : '—'}
            valueStyle={{ color: 'var(--color-danger)' }}
          />
        )}

        {/* Hibernation explanation */}
        {data.status === 'hibernating' && (
          <div
            style={{
              marginTop: 16,
              padding: '12px 14px',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid var(--color-danger)',
              borderRadius: 6,
              fontSize: 13,
              color: 'var(--color-text-muted)',
              lineHeight: 1.7,
            }}
          >
            <strong style={{ color: 'var(--color-danger)' }}>Data Hibernation Mode</strong> — Your account is in a
            read-only state. You can view all historical payments, API keys, and team data.
            Creating payments, using provider APIs, and adding team members are{' '}
            <strong>locked until you reactivate</strong>.
          </div>
        )}
      </Card>

      {/* Actions */}
      {isOwner && (
        <Card title="Actions" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(data.status === 'hibernating' || data.status === 'trialing') && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--color-border)' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>
                    {data.status === 'hibernating' ? 'Reactivate Subscription' : 'Upgrade to Paid Plan'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    Unlock all features for 30 days
                  </div>
                </div>
                <Button loading={activating} onClick={handleActivate}>
                  {data.status === 'hibernating' ? '⚡ Reactivate' : '⬆ Upgrade'}
                </Button>
              </div>
            )}
            {data.status === 'active' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--color-border)' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>Renew Subscription</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Extend by another 30 days</div>
                </div>
                <Button variant="secondary" loading={activating} onClick={handleActivate}>Renew</Button>
              </div>
            )}
            {data.status !== 'cancelled' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2, color: 'var(--color-danger)' }}>Cancel Subscription</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    Data is preserved in hibernation mode
                  </div>
                </div>
                <Button variant="danger" loading={cancelling} onClick={handleCancel}>Cancel Plan</Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Dev tools */}
      {process.env.NODE_ENV !== 'production' && isOwner && (
        <Card title="Developer Tools" subtitle="Not available in production" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 2 }}>Simulate Expiry</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Fast-forward to hibernation state for testing
              </div>
            </div>
            <Button variant="ghost" size="sm" loading={simulating} onClick={handleSimulateExpire}>
              🧪 Simulate Expire
            </Button>
          </div>
        </Card>
      )}

      {/* Event log */}
      <Card title="Subscription History">
        {events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-muted)', fontSize: 13 }}>
            No subscription events yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {events.map((ev, i) => (
              <div
                key={ev.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                  padding: '12px 0',
                  borderBottom: i < events.length - 1 ? '1px solid var(--color-border)' : 'none',
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: ev.to_status === 'active' ? 'var(--color-success)'
                      : ev.to_status === 'hibernating' ? 'var(--color-danger)'
                      : ev.to_status === 'cancelled' ? 'var(--color-text-subtle)'
                      : 'var(--color-primary)',
                    marginTop: 5,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
                    {eventTypeLabelMap[ev.event_type] || ev.event_type}
                  </div>
                  {ev.note && (
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{ev.note}</div>
                  )}
                  {ev.triggered_by_name && (
                    <div style={{ fontSize: 11, color: 'var(--color-text-subtle)', marginTop: 2 }}>
                      by {ev.triggered_by_name}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-subtle)', flexShrink: 0 }}>
                  {new Date(ev.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
