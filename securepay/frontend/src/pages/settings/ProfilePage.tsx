import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { tenantApi } from '../../api/tenant.api';
import { useAuthStore } from '../../store/auth.store';
import Spinner from '../../components/common/Spinner';
import apiClient from '../../api/client';
import { useState } from 'react';

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const { data: tenant } = useQuery({
    queryKey: ['tenant-profile'],
    queryFn: tenantApi.getProfile,
  });

  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    values: { name: tenant?.name, contactPhone: tenant?.contact_phone },
  });

  const {
    register: regPw, handleSubmit: handlePw, reset: resetPw, watch: watchPw,
    formState: { isSubmitting: pwSubmitting },
  } = useForm<{ currentPassword: string; newPassword: string; confirmPassword: string }>();

  const updateMutation = useMutation({
    mutationFn: (d: object) => tenantApi.updateProfile(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant-profile'] }),
  });

  async function onPasswordChange(data: any) {
    setPasswordError(''); setPasswordSuccess('');
    try {
      await apiClient.patch('/users/me/password', data);
      setPasswordSuccess('Password changed successfully. Please log in again on other devices.');
      resetPw();
    } catch (err: any) {
      setPasswordError(err.response?.data?.message || 'Failed to change password');
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profile & Settings</h1>
        <p className="text-gray-500">Manage your workspace and personal settings</p>
      </div>

      {/* Workspace settings */}
      <div className="card space-y-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Workspace</h2>
          <p className="text-sm text-gray-500">Update your organization details</p>
        </div>
        <form onSubmit={handleSubmit((d) => updateMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label mb-1">Workspace name</label>
            <input {...register('name')} className="input" />
          </div>
          <div>
            <label className="label mb-1">Plan</label>
            <input value={tenant?.plan ? tenant.plan.charAt(0).toUpperCase() + tenant.plan.slice(1) : ''} className="input bg-gray-50" readOnly />
          </div>
          <div>
            <label className="label mb-1">Contact phone</label>
            <input {...register('contactPhone')} className="input" placeholder="+1 555 000 0000" />
          </div>
          <button type="submit" disabled={isSubmitting || updateMutation.isPending} className="btn-primary">
            {updateMutation.isPending ? <Spinner size="sm" className="text-white" /> : 'Save changes'}
          </button>
        </form>
      </div>

      {/* Account info */}
      <div className="card space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Account</h2>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{user?.firstName} {user?.lastName}</p>
            <p className="text-sm text-gray-500">{user?.email}</p>
            <span className="badge badge-blue mt-1 capitalize">{user?.role}</span>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="card space-y-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Change Password</h2>
          <p className="text-sm text-gray-500">Use a strong password with 8+ characters</p>
        </div>
        {passwordSuccess && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700 border border-green-200">{passwordSuccess}</p>}
        {passwordError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">{passwordError}</p>}
        <form onSubmit={handlePw(onPasswordChange)} className="space-y-4">
          <div>
            <label className="label mb-1">Current password</label>
            <input {...regPw('currentPassword', { required: true })} type="password" className="input" />
          </div>
          <div>
            <label className="label mb-1">New password</label>
            <input {...regPw('newPassword', { required: true, minLength: 8 })} type="password" className="input" />
          </div>
          <div>
            <label className="label mb-1">Confirm new password</label>
            <input
              {...regPw('confirmPassword', {
                required: true,
                validate: (v) => v === watchPw('newPassword') || 'Passwords do not match',
              })}
              type="password"
              className="input"
            />
          </div>
          <button type="submit" disabled={pwSubmitting} className="btn-primary">
            {pwSubmitting ? <Spinner size="sm" className="text-white" /> : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
