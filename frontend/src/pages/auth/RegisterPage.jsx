import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ShieldCheck, Building2, User } from 'lucide-react';
import { register as registerService } from '../../services/auth.service';

export default function RegisterPage() {
  const navigate              = useNavigate();
  const [apiError, setApiError] = useState('');
  const [success, setSuccess] = useState(false);

  const {
    register, handleSubmit, watch,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { orgType: 'solo' } });

  const orgType = watch('orgType');

  const onSubmit = async (data) => {
    setApiError('');
    try {
      await registerService(data);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setApiError(err.response?.data?.error?.message || 'Registration failed.');
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-900 to-primary-700 px-4">
        <div className="card text-center max-w-md w-full">
          <div className="text-green-500 text-5xl mb-4">✓</div>
          <h2 className="text-xl font-semibold">Account created!</h2>
          <p className="mt-2 text-gray-500 text-sm">Redirecting you to login…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-900 to-primary-700 px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex flex-col items-center gap-2 text-white">
          <ShieldCheck className="h-12 w-12 text-primary-200" />
          <h1 className="text-3xl font-bold">SecurePay</h1>
          <p className="text-primary-200 text-sm">Create your organization</p>
        </div>

        <div className="card">
          <h2 className="mb-6 text-xl font-semibold text-gray-900">Get started for free</h2>

          {apiError && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {apiError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {/* Account type */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Account type</label>
              <div className="grid grid-cols-2 gap-3">
                <label
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-4 transition
                               ${orgType === 'solo' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-primary-300'}`}
                >
                  <input type="radio" value="solo" {...register('orgType')} className="sr-only" />
                  <User className={`h-6 w-6 ${orgType === 'solo' ? 'text-primary-600' : 'text-gray-400'}`} />
                  <div className="text-center">
                    <p className="font-medium text-sm">Solo</p>
                    <p className="text-xs text-gray-500">Individual freelancer</p>
                  </div>
                </label>

                <label
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-4 transition
                               ${orgType === 'agency' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-primary-300'}`}
                >
                  <input type="radio" value="agency" {...register('orgType')} className="sr-only" />
                  <Building2 className={`h-6 w-6 ${orgType === 'agency' ? 'text-primary-600' : 'text-gray-400'}`} />
                  <div className="text-center">
                    <p className="font-medium text-sm">Agency</p>
                    <p className="text-xs text-gray-500">Company / Team</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Org name */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {orgType === 'solo' ? 'Your name / business name' : 'Company name'}
              </label>
              <input
                type="text"
                className={`input ${errors.orgName ? 'border-red-400' : ''}`}
                placeholder={orgType === 'solo' ? 'Alice Freelance' : 'Acme Payments'}
                {...register('orgName', { required: 'Organization name is required' })}
              />
              {errors.orgName && <p className="mt-1 text-xs text-red-600">{errors.orgName.message}</p>}
            </div>

            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">First name</label>
                <input
                  type="text"
                  className={`input ${errors.firstName ? 'border-red-400' : ''}`}
                  {...register('firstName', { required: 'Required' })}
                />
                {errors.firstName && <p className="mt-1 text-xs text-red-600">{errors.firstName.message}</p>}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Last name</label>
                <input
                  type="text"
                  className={`input ${errors.lastName ? 'border-red-400' : ''}`}
                  {...register('lastName', { required: 'Required' })}
                />
                {errors.lastName && <p className="mt-1 text-xs text-red-600">{errors.lastName.message}</p>}
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                className={`input ${errors.email ? 'border-red-400' : ''}`}
                placeholder="you@example.com"
                {...register('email', { required: 'Email is required' })}
              />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                className={`input ${errors.password ? 'border-red-400' : ''}`}
                placeholder="At least 8 characters"
                {...register('password', {
                  required: 'Password is required',
                  minLength: { value: 8, message: 'Minimum 8 characters' },
                })}
              />
              {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full mt-2">
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary-600 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
