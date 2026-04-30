import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ShieldCheck, Building2, User } from 'lucide-react';
import { authApi, RegisterPayload } from '../../api/auth.api';
import { useAuthStore } from '../../store/auth.store';
import Spinner from '../../components/common/Spinner';
import clsx from 'clsx';

interface RegisterForm extends RegisterPayload {
  confirmPassword: string;
}

export default function RegisterPage() {
  const [serverError, setServerError] = useState('');
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<RegisterForm>({
    defaultValues: { plan: 'solo' },
  });
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const selectedPlan = watch('plan');

  async function onSubmit({ confirmPassword, ...data }: RegisterForm) {
    setServerError('');
    try {
      const result = await authApi.register(data);
      setAuth(result.user, result.accessToken, result.refreshToken);
      navigate('/dashboard');
    } catch (err: any) {
      setServerError(err.response?.data?.message || 'Registration failed. Please try again.');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-blue-50 p-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <ShieldCheck className="h-12 w-12 text-brand-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Create your workspace</h1>
          <p className="mt-2 text-gray-600">Get started with SecurePay in minutes</p>
        </div>

        <div className="card">
          {serverError && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Plan selection */}
            <div>
              <label className="label mb-2">Account type</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'solo', label: 'Solo', description: 'Individual freelancer', icon: User },
                  { value: 'agency', label: 'Agency', description: 'Team & company', icon: Building2 },
                ].map(({ value, label, description, icon: Icon }) => (
                  <label
                    key={value}
                    className={clsx(
                      'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all',
                      selectedPlan === value
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-gray-200 hover:border-gray-300',
                    )}
                  >
                    <input type="radio" value={value} {...register('plan')} className="sr-only" />
                    <Icon className={clsx('h-6 w-6', selectedPlan === value ? 'text-brand-600' : 'text-gray-400')} />
                    <span className={clsx('text-sm font-medium', selectedPlan === value ? 'text-brand-700' : 'text-gray-700')}>{label}</span>
                    <span className="text-center text-xs text-gray-500">{description}</span>
                  </label>
                ))}
              </div>
            </div>

            {selectedPlan === 'agency' && (
              <div>
                <label className="label mb-1">Company name</label>
                <input {...register('companyName')} className="input" placeholder="Acme Inc." />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label mb-1">First name</label>
                <input {...register('firstName', { required: 'Required' })} className="input" placeholder="Jane" />
                {errors.firstName && <p className="mt-1 text-xs text-red-600">{errors.firstName.message}</p>}
              </div>
              <div>
                <label className="label mb-1">Last name</label>
                <input {...register('lastName', { required: 'Required' })} className="input" placeholder="Smith" />
                {errors.lastName && <p className="mt-1 text-xs text-red-600">{errors.lastName.message}</p>}
              </div>
            </div>

            <div>
              <label className="label mb-1">Work email</label>
              <input {...register('email', { required: 'Required' })} type="email" className="input" placeholder="jane@company.com" />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label mb-1">Workspace name</label>
              <input {...register('tenantName', { required: 'Required' })} className="input" placeholder="Acme Payments" />
              {errors.tenantName && <p className="mt-1 text-xs text-red-600">{errors.tenantName.message}</p>}
            </div>

            <div>
              <label className="label mb-1">Workspace slug</label>
              <div className="flex">
                <span className="inline-flex items-center rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500">
                  securepay.io/
                </span>
                <input
                  {...register('tenantSlug', {
                    required: 'Required',
                    pattern: { value: /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, message: 'Lowercase letters, numbers, and hyphens only' },
                  })}
                  className="input rounded-l-none"
                  placeholder="acme-payments"
                />
              </div>
              {errors.tenantSlug && <p className="mt-1 text-xs text-red-600">{errors.tenantSlug.message}</p>}
            </div>

            <div>
              <label className="label mb-1">Password</label>
              <input
                {...register('password', { required: 'Required', minLength: { value: 8, message: 'Min 8 characters' } })}
                type="password"
                className="input"
                placeholder="••••••••"
              />
              {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
            </div>

            <div>
              <label className="label mb-1">Confirm password</label>
              <input
                {...register('confirmPassword', {
                  required: 'Required',
                  validate: (v) => v === watch('password') || 'Passwords do not match',
                })}
                type="password"
                className="input"
                placeholder="••••••••"
              />
              {errors.confirmPassword && <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>}
            </div>

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-2.5">
              {isSubmitting ? <Spinner size="sm" className="text-white" /> : 'Create workspace'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
