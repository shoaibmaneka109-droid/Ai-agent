import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { registerThunk, clearError } from '../store/slices/authSlice';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import Alert from '../components/common/Alert';

const orgTypeOptions = [
  {
    value: 'solo',
    title: 'Solo (Individual)',
    description: 'Freelancer or independent professional managing payments alone.',
  },
  {
    value: 'agency',
    title: 'Agency (Company)',
    description: 'Team or business with multiple members and clients.',
  },
];

const RegisterPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error, isAuthenticated } = useSelector((s) => s.auth);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: { orgType: 'solo' },
  });

  const selectedType = watch('orgType');

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
    return () => dispatch(clearError());
  }, [isAuthenticated, navigate, dispatch]);

  const onSubmit = (data) => dispatch(registerThunk(data));

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 mb-4">
            <span className="text-white font-bold text-xl">SP</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="text-gray-500 mt-1 text-sm">Start managing payments securely today</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {error && (
            <Alert type="error" message={error} onClose={() => dispatch(clearError())} className="mb-4" />
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            {/* Account type selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Account type <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {orgTypeOptions.map(({ value, title, description }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setValue('orgType', value)}
                    className={`text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                      selectedType === value
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-900">{title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-tight">{description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="First name"
                required
                error={errors.firstName?.message}
                {...register('firstName', { required: 'First name required' })}
              />
              <Input
                label="Last name"
                required
                error={errors.lastName?.message}
                {...register('lastName', { required: 'Last name required' })}
              />
            </div>

            <Input
              label="Email address"
              type="email"
              required
              error={errors.email?.message}
              {...register('email', {
                required: 'Email is required',
                pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email' },
              })}
            />

            <Input
              label={selectedType === 'agency' ? 'Company name' : 'Display name'}
              required
              helperText={
                selectedType === 'agency'
                  ? 'Your team members will see this name'
                  : 'A name for your individual workspace'
              }
              error={errors.orgName?.message}
              {...register('orgName', { required: 'Organization name required', minLength: { value: 2, message: 'At least 2 characters' } })}
            />

            <Input
              label="Password"
              type="password"
              required
              helperText="8+ chars with uppercase, lowercase, and a number"
              error={errors.password?.message}
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 8, message: 'At least 8 characters' },
                pattern: {
                  value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
                  message: 'Must include uppercase, lowercase, and a number',
                },
              })}
            />

            <Button type="submit" loading={loading} className="w-full" size="lg">
              Create account
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-indigo-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
