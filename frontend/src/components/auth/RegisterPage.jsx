import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { registerUser, clearError } from '../../store/slices/authSlice';
import Button from '../common/Button';
import Input from '../common/Input';

export default function RegisterPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error, isAuthenticated } = useSelector((s) => s.auth);

  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    organizationName: '',
    planType: 'solo',
  });
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard');
    return () => dispatch(clearError());
  }, [isAuthenticated, navigate, dispatch]);

  const validate = () => {
    const errs = {};
    if (!form.fullName || form.fullName.length < 2) errs.fullName = 'Name must be at least 2 characters';
    if (!form.email || !/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Valid email required';
    if (form.password.length < 8) errs.password = 'Minimum 8 characters';
    else if (!/[A-Z]/.test(form.password)) errs.password = 'Must contain an uppercase letter';
    else if (!/[0-9]/.test(form.password)) errs.password = 'Must contain a number';
    if (!form.organizationName || form.organizationName.length < 2) errs.organizationName = 'Organization name required';
    return errs;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});
    dispatch(registerUser(form));
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--color-bg)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 52,
              height: 52,
              background: 'var(--color-primary)',
              borderRadius: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              fontWeight: 800,
              color: '#fff',
              margin: '0 auto 16px',
            }}
          >
            S
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text)' }}>Create your account</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 6, fontSize: 14 }}>
            Start securing your payments in minutes
          </p>
        </div>

        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 32,
          }}
        >
          {error && (
            <div
              style={{
                background: 'var(--color-danger-light)',
                border: '1px solid var(--color-danger)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 14px',
                color: 'var(--color-danger)',
                fontSize: 13,
                marginBottom: 20,
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Input
              label="Full Name"
              name="fullName"
              required
              value={form.fullName}
              onChange={set('fullName')}
              error={fieldErrors.fullName}
              placeholder="Jane Smith"
            />
            <Input
              label="Email address"
              type="email"
              name="email"
              required
              value={form.email}
              onChange={set('email')}
              error={fieldErrors.email}
              placeholder="you@example.com"
            />
            <Input
              label="Password"
              type="password"
              name="password"
              required
              value={form.password}
              onChange={set('password')}
              error={fieldErrors.password}
              hint="Min 8 chars, 1 uppercase, 1 number"
            />
            <Input
              label="Organization Name"
              name="organizationName"
              required
              value={form.organizationName}
              onChange={set('organizationName')}
              error={fieldErrors.organizationName}
              placeholder="Acme Corp"
            />

            {/* Plan selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)' }}>
                Account Type <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {['solo', 'agency'].map((plan) => (
                  <button
                    key={plan}
                    type="button"
                    onClick={() => setForm({ ...form, planType: plan })}
                    style={{
                      padding: '12px',
                      border: `2px solid ${form.planType === plan ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      borderRadius: 'var(--radius-sm)',
                      background: form.planType === plan ? 'var(--color-primary-light)' : 'var(--color-surface-2)',
                      color: 'var(--color-text)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'border-color var(--transition), background var(--transition)',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
                      {plan === 'solo' ? '👤 Solo' : '🏢 Agency'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {plan === 'solo' ? 'Individual freelancer' : 'Team / Company'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <Button type="submit" loading={loading} fullWidth size="lg" style={{ marginTop: 4 }}>
              Create Account
            </Button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, color: 'var(--color-text-muted)', fontSize: 14 }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--color-primary)', fontWeight: 500 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
