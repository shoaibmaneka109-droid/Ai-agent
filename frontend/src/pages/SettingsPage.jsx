import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Alert from '../components/common/Alert';
import Badge from '../components/common/Badge';
import { updateProfile, changePassword } from '../services/userService';

const SettingsPage = () => {
  const { user, org } = useSelector((s) => s.auth);
  const [profileAlert, setProfileAlert] = useState(null);
  const [passwordAlert, setPasswordAlert] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const profileForm = useForm({
    defaultValues: { firstName: user?.firstName, lastName: user?.lastName },
  });

  const passwordForm = useForm();

  const onProfileSubmit = async (data) => {
    setProfileLoading(true);
    try {
      await updateProfile(data);
      setProfileAlert({ type: 'success', message: 'Profile updated' });
    } catch (err) {
      setProfileAlert({ type: 'error', message: err.response?.data?.error?.message || 'Failed to update' });
    } finally {
      setProfileLoading(false);
    }
  };

  const onPasswordSubmit = async (data) => {
    if (data.newPassword !== data.confirmPassword) {
      passwordForm.setError('confirmPassword', { message: 'Passwords do not match' });
      return;
    }
    setPasswordLoading(true);
    try {
      await changePassword({ currentPassword: data.currentPassword, newPassword: data.newPassword });
      setPasswordAlert({ type: 'success', message: 'Password changed successfully' });
      passwordForm.reset();
    } catch (err) {
      setPasswordAlert({ type: 'error', message: err.response?.data?.error?.message || 'Failed to change password' });
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your account and organization settings</p>
      </div>

      {/* Organization info */}
      <Card title="Organization">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Name</p>
            <p className="font-medium text-gray-900 mt-0.5">{org?.name}</p>
          </div>
          <div>
            <p className="text-gray-500">Slug</p>
            <p className="font-mono text-gray-900 mt-0.5">{org?.slug}</p>
          </div>
          <div>
            <p className="text-gray-500">Type</p>
            <Badge color="blue" className="mt-0.5">
              {org?.type === 'solo' ? 'Solo (Individual)' : 'Agency (Company)'}
            </Badge>
          </div>
          <div>
            <p className="text-gray-500">Plan</p>
            <Badge color="indigo" className="mt-0.5">{org?.plan}</Badge>
          </div>
        </div>
      </Card>

      {/* Profile */}
      <Card title="Profile">
        {profileAlert && (
          <Alert type={profileAlert.type} message={profileAlert.message}
            onClose={() => setProfileAlert(null)} className="mb-4" />
        )}
        <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4 max-w-sm">
          <Input
            label="First name"
            error={profileForm.formState.errors.firstName?.message}
            {...profileForm.register('firstName', { required: 'Required' })}
          />
          <Input
            label="Last name"
            error={profileForm.formState.errors.lastName?.message}
            {...profileForm.register('lastName', { required: 'Required' })}
          />
          <div>
            <p className="text-sm text-gray-500">Email</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">{user?.email}</p>
          </div>
          <Button type="submit" loading={profileLoading}>Save profile</Button>
        </form>
      </Card>

      {/* Change password */}
      <Card title="Change Password">
        {passwordAlert && (
          <Alert type={passwordAlert.type} message={passwordAlert.message}
            onClose={() => setPasswordAlert(null)} className="mb-4" />
        )}
        <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4 max-w-sm">
          <Input
            label="Current password"
            type="password"
            required
            error={passwordForm.formState.errors.currentPassword?.message}
            {...passwordForm.register('currentPassword', { required: 'Required' })}
          />
          <Input
            label="New password"
            type="password"
            required
            helperText="8+ chars with uppercase, lowercase, and a number"
            error={passwordForm.formState.errors.newPassword?.message}
            {...passwordForm.register('newPassword', {
              required: 'Required',
              minLength: { value: 8, message: 'At least 8 characters' },
              pattern: {
                value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
                message: 'Must include uppercase, lowercase, and number',
              },
            })}
          />
          <Input
            label="Confirm new password"
            type="password"
            required
            error={passwordForm.formState.errors.confirmPassword?.message}
            {...passwordForm.register('confirmPassword', { required: 'Required' })}
          />
          <Button type="submit" loading={passwordLoading}>Update password</Button>
        </form>
      </Card>
    </div>
  );
};

export default SettingsPage;
