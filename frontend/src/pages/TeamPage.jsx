import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Alert from '../components/common/Alert';
import { listMembers, inviteMember } from '../services/organizationService';

const roleColors = { owner: 'indigo', admin: 'blue', member: 'gray' };

const TeamPage = () => {
  const { org, user } = useSelector((s) => s.auth);
  const [members, setMembers] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [alert, setAlert] = useState(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { role: 'member' },
  });

  const load = async () => {
    try {
      const res = await listMembers(org.id, { limit: 50 });
      setMembers(res.data.data.members || []);
      setMeta(res.data.data.meta);
    } catch {
      setAlert({ type: 'error', message: 'Failed to load team members' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (org?.id) load(); }, [org?.id]);

  const onInvite = async (data) => {
    setInviteLoading(true);
    try {
      await inviteMember(org.id, data);
      setAlert({ type: 'success', message: `Invitation sent to ${data.email}` });
      setShowInvite(false);
      reset();
    } catch (err) {
      setAlert({ type: 'error', message: err.response?.data?.error?.message || 'Failed to send invite' });
    } finally {
      setInviteLoading(false);
    }
  };

  const canInvite = ['owner', 'admin'].includes(user?.role);
  const isAgency = org?.type === 'agency';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-gray-500 text-sm mt-1">
            {meta ? `${meta.total} member${meta.total !== 1 ? 's' : ''}` : '…'}
            {!isAgency && (
              <span className="ml-2 text-yellow-600">
                · Upgrade to Agency to add team members
              </span>
            )}
          </p>
        </div>
        {canInvite && isAgency && (
          <Button onClick={() => setShowInvite(!showInvite)}>
            {showInvite ? 'Cancel' : 'Invite member'}
          </Button>
        )}
      </div>

      {alert && (
        <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} className="mb-4" />
      )}

      {showInvite && (
        <Card title="Send Invitation" className="mb-6">
          <form onSubmit={handleSubmit(onInvite)} className="flex items-end gap-4 max-w-lg">
            <Input
              label="Email address"
              type="email"
              required
              className="flex-1"
              error={errors.email?.message}
              {...register('email', {
                required: 'Email required',
                pattern: { value: /^\S+@\S+\.\S+$/, message: 'Invalid email' },
              })}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                {...register('role')}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <Button type="submit" loading={inviteLoading} className="mb-0">Send</Button>
          </form>
        </Card>
      )}

      <Card>
        {loading ? (
          <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-700">
                    {m.first_name?.[0]}{m.last_name?.[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {m.first_name} {m.last_name}
                      {m.id === user?.id && (
                        <span className="ml-2 text-xs text-gray-400">(you)</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">{m.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge color={roleColors[m.role] || 'gray'}>{m.role}</Badge>
                  <Badge color={m.is_active ? 'green' : 'gray'}>
                    {m.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default TeamPage;
