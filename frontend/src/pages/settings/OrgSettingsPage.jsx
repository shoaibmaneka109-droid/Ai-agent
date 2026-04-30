import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Zap, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

const PLANS = [
  { id: 'free',         name: 'Free',         price: '$0',   features: ['1 user', '100 transactions/mo', 'Community support'] },
  { id: 'starter',      name: 'Starter',      price: '$29',  features: ['5 users', '1,000 transactions/mo', 'Email support'] },
  { id: 'professional', name: 'Professional', price: '$99',  features: ['25 users', 'Unlimited transactions', 'Priority support'] },
  { id: 'enterprise',   name: 'Enterprise',   price: 'Custom', features: ['Unlimited users', 'SLA guarantee', 'Dedicated support'] },
];

export default function OrgSettingsPage() {
  const { user }  = useAuth();
  const orgSlug   = user?.org_slug || user?.orgSlug;
  const qc        = useQueryClient();
  const [saved, setSaved] = useState(false);

  const { data: org, isLoading } = useQuery({
    queryKey: ['org', orgSlug],
    queryFn:  () => api.get(`/orgs/${orgSlug}`).then((r) => r.data.data),
    enabled:  !!orgSlug,
  });

  const updateOrg = useMutation({
    mutationFn: (payload) => api.patch(`/orgs/${orgSlug}`, payload),
    onSuccess: () => {
      qc.invalidateQueries(['org', orgSlug]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const upgradePlan = useMutation({
    mutationFn: (plan) => api.post(`/orgs/${orgSlug}/plan`, { plan }),
    onSuccess: () => qc.invalidateQueries(['org', orgSlug]),
  });

  const [name, setName] = useState('');

  React.useEffect(() => {
    if (org) setName(org.name);
  }, [org]);

  if (isLoading) return <div className="py-16 text-center text-gray-400">Loading…</div>;

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Organization Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your organization profile and subscription.</p>
      </div>

      {/* Profile */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <Building2 className="h-5 w-5 text-gray-400" />
          <h2 className="font-semibold text-gray-900">Profile</h2>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500 text-xs mb-1">Slug</p>
            <p className="font-mono font-medium">{org?.slug}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs mb-1">Type</p>
            <p className="capitalize">{org?.type}</p>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Organization name</label>
          <div className="flex gap-2">
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              onClick={() => updateOrg.mutate({ name })}
              disabled={updateOrg.isPending || name === org?.name}
              className="btn-primary whitespace-nowrap"
            >
              {saved ? <><Check className="h-4 w-4" /> Saved</> : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Plans */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <Zap className="h-5 w-5 text-gray-400" />
          <h2 className="font-semibold text-gray-900">Subscription Plan</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PLANS.map((plan) => {
            const isCurrent = org?.plan === plan.id;
            return (
              <div
                key={plan.id}
                className={`rounded-xl border-2 p-4 transition
                            ${isCurrent ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-semibold text-sm">{plan.name}</p>
                    <p className="text-primary-600 font-bold">{plan.price}<span className="text-gray-400 text-xs font-normal">/mo</span></p>
                  </div>
                  {isCurrent && (
                    <span className="badge-green text-xs px-2 py-0.5 rounded-full">Current</span>
                  )}
                </div>
                <ul className="text-xs text-gray-500 space-y-1 mb-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-1">
                      <Check className="h-3 w-3 text-green-500" /> {f}
                    </li>
                  ))}
                </ul>
                {!isCurrent && (
                  <button
                    onClick={() => upgradePlan.mutate(plan.id)}
                    disabled={upgradePlan.isPending}
                    className="btn-primary w-full text-xs py-1.5"
                  >
                    {upgradePlan.isPending ? 'Upgrading…' : 'Switch to ' + plan.name}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
