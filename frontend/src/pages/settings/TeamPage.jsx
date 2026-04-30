import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, UserPlus, Trash2, Crown, Shield, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

const ROLE_ICONS = {
  owner:  <Crown  className="h-3 w-3 text-yellow-500" />,
  admin:  <Shield className="h-3 w-3 text-blue-500" />,
  member: <User   className="h-3 w-3 text-gray-400" />,
};

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const { user }  = useAuth();
  const orgSlug   = user?.org_slug || user?.orgSlug;
  const qc        = useQueryClient();
  const isOwnerAdmin = ['owner', 'admin'].includes(user?.role);

  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState({ email: '', firstName: '', lastName: '', role: 'member', tempPassword: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['members', orgSlug],
    queryFn:  () => api.get(`/orgs/${orgSlug}/members`).then((r) => r.data),
    enabled:  !!orgSlug,
  });

  const members = data?.data || [];
  const meta    = data?.meta || {};

  const inviteMutation = useMutation({
    mutationFn: (payload) => api.post(`/orgs/${orgSlug}/users/invite`, payload),
    onSuccess: () => {
      qc.invalidateQueries(['members']);
      setShowInvite(false);
      setInvite({ email: '', firstName: '', lastName: '', role: 'member', tempPassword: '' });
    },
  });

  const deactivate = useMutation({
    mutationFn: (userId) => api.delete(`/orgs/${orgSlug}/users/${userId}`),
    onSuccess: () => qc.invalidateQueries(['members']),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="mt-1 text-sm text-gray-500">
            {meta.total || members.length} member{members.length !== 1 ? 's' : ''}
          </p>
        </div>
        {isOwnerAdmin && (
          <button onClick={() => setShowInvite(true)} className="btn-primary">
            <UserPlus className="h-4 w-4" /> Invite member
          </button>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
          </div>
        ) : members.length === 0 ? (
          <div className="py-14 text-center">
            <Users className="mx-auto h-10 w-10 text-gray-200 mb-3" />
            <p className="text-sm text-gray-500">No team members yet.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Login</th>
                {isOwnerAdmin && <th className="px-4 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-bold">
                        {(m.first_name || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{m.first_name} {m.last_name}</p>
                        <p className="text-xs text-gray-400">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 capitalize">
                      {ROLE_ICONS[m.role]}
                      {m.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={m.is_active ? 'badge-green' : 'badge-red'}>
                      {m.is_active ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {m.last_login_at ? new Date(m.last_login_at).toLocaleDateString() : '—'}
                  </td>
                  {isOwnerAdmin && (
                    <td className="px-4 py-3">
                      {m.id !== user?.id && m.role !== 'owner' && (
                        <button
                          onClick={() => deactivate.mutate(m.id)}
                          disabled={deactivate.isPending}
                          className="text-xs text-red-500 hover:underline disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3 inline-block mr-1" />Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showInvite && (
        <Modal title="Invite Team Member" onClose={() => setShowInvite(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">First name</label>
                <input
                  type="text" className="input"
                  value={invite.firstName}
                  onChange={(e) => setInvite({ ...invite, firstName: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Last name</label>
                <input
                  type="text" className="input"
                  value={invite.lastName}
                  onChange={(e) => setInvite({ ...invite, lastName: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Email</label>
              <input
                type="email" className="input"
                value={invite.email}
                onChange={(e) => setInvite({ ...invite, email: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Role</label>
              <select
                className="input"
                value={invite.role}
                onChange={(e) => setInvite({ ...invite, role: e.target.value })}
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Temporary password</label>
              <input
                type="password" className="input"
                placeholder="Min 8 characters"
                value={invite.tempPassword}
                onChange={(e) => setInvite({ ...invite, tempPassword: e.target.value })}
              />
            </div>
            {inviteMutation.error && (
              <p className="text-xs text-red-600">
                {inviteMutation.error.response?.data?.error?.message || 'Invite failed'}
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <button className="btn-secondary flex-1" onClick={() => setShowInvite(false)}>Cancel</button>
              <button
                className="btn-primary flex-1"
                disabled={inviteMutation.isPending}
                onClick={() => inviteMutation.mutate(invite)}
              >
                {inviteMutation.isPending ? 'Sending…' : 'Send Invite'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
