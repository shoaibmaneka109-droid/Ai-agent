import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logoutUser } from '../../store/slices/authSlice';

const navItems = [
  { to: '/dashboard', icon: '⬛', label: 'Dashboard' },
  { to: '/payments', icon: '💳', label: 'Payments' },
  { to: '/api-keys', icon: '🔑', label: 'API Keys' },
  { to: '/team', icon: '👥', label: 'Team', agencyOnly: true },
  { to: '/settings', icon: '⚙️', label: 'Settings' },
];

export default function Sidebar() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, organization } = useSelector((s) => s.auth);

  const handleLogout = async () => {
    await dispatch(logoutUser());
    navigate('/login');
  };

  const isAgency = organization?.planType === 'agency';

  return (
    <aside
      style={{
        width: 220,
        minHeight: '100vh',
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            background: 'var(--color-primary)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            fontWeight: 700,
            color: '#fff',
          }}
        >
          S
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)' }}>SecurePay</div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--color-text-muted)',
              background: 'var(--color-primary-light)',
              color: 'var(--color-primary)',
              padding: '1px 6px',
              borderRadius: 4,
              fontWeight: 500,
              marginTop: 2,
              display: 'inline-block',
            }}
          >
            {isAgency ? 'Agency' : 'Solo'}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 12px' }}>
        {navItems
          .filter((item) => !item.agencyOnly || isAgency)
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderRadius: 'var(--radius-sm)',
                color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
                background: isActive ? 'var(--color-primary-light)' : 'transparent',
                fontWeight: isActive ? 600 : 400,
                fontSize: 14,
                marginBottom: 2,
                transition: 'background var(--transition), color var(--transition)',
                textDecoration: 'none',
              })}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
      </nav>

      {/* User footer */}
      <div
        style={{
          padding: '16px',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
              color: '#fff',
              flexShrink: 0,
            }}
          >
            {user?.fullName?.[0]?.toUpperCase() || 'U'}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--color-text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user?.fullName || 'User'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{user?.role}</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            padding: '7px 12px',
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-muted)',
            fontSize: 13,
            cursor: 'pointer',
            transition: 'background var(--transition)',
          }}
          onMouseEnter={(e) => (e.target.style.background = 'var(--color-danger-light)')}
          onMouseLeave={(e) => (e.target.style.background = 'transparent')}
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}
