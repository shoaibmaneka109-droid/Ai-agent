import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantApi } from '../../api/tenant.api';
import { useAuthStore } from '../../store/auth.store';
import { format } from 'date-fns';
import { Users, Trash2 } from 'lucide-react';
import EmptyState from '../../components/common/EmptyState';
import Spinner from '../../components/common/Spinner';
import clsx from 'clsx';

const ROLES = ['owner', 'admin', 'member', 'viewer'];

const roleColors: Record<string, string> = {
  owner: 'badge-blue',
  admin: 'badge-green',
  member: 'badge-gray',
  viewer: 'badge-gray',
};

export default function TeamPage() {
  const currentUser = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['team'],
    queryFn: () => tenantApi.getTeam(),
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      tenantApi.updateMemberRole(userId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }),
  });

  const removeMutation = useMutation({
    mutationFn: tenantApi.removeMember,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }),
  });

  const canManage = ['owner', 'admin'].includes(currentUser?.role ?? '');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Team</h1>
        <p className="text-gray-500">Manage members and their roles</p>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center"><Spinner /></div>
      ) : !data?.members?.length ? (
        <EmptyState icon={Users} title="No team members yet" description="Invite team members to collaborate." />
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Member', 'Role', 'Status', 'Joined', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.members.map((member: any) => (
                <tr key={member.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                        {member.first_name?.[0]}{member.last_name?.[0]}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{member.first_name} {member.last_name}</p>
                        <p className="text-xs text-gray-500">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {canManage && member.role !== 'owner' && member.id !== currentUser?.id ? (
                      <select
                        value={member.role}
                        onChange={(e) => roleMutation.mutate({ userId: member.id, role: e.target.value })}
                        className="input py-1 text-xs w-28"
                      >
                        {ROLES.filter((r) => r !== 'owner').map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={clsx('badge capitalize', roleColors[member.role] ?? 'badge-gray')}>
                        {member.role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('badge capitalize', member.status === 'active' ? 'badge-green' : 'badge-gray')}>
                      {member.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{format(new Date(member.created_at), 'MMM d, yyyy')}</td>
                  <td className="px-4 py-3">
                    {canManage && member.role !== 'owner' && member.id !== currentUser?.id && (
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${member.first_name} from the team?`)) removeMutation.mutate(member.id);
                        }}
                        className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
