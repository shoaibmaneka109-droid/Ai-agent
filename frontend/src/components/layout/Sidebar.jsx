import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logoutThunk } from '../../store/slices/authSlice';
import TrialProgress from '../common/TrialProgress';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '▦' },
  { to: '/payments', label: 'Payments', icon: '💳' },
  { to: '/integrations', label: 'Integrations', icon: '🔌' },
  { to: '/api-keys', label: 'API Keys (Legacy)', icon: '🔑' },
  { to: '/team', label: 'Team', icon: '👥' },
  { to: '/settings/billing', label: 'Billing', icon: '📋' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

const Sidebar = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, org } = useSelector((s) => s.auth);

  const handleLogout = async () => {
    await dispatch(logoutThunk());
    navigate('/login');
  };

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-gray-900 text-white">
      {/* Logo / Brand */}
      <div className="px-6 py-5 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center font-bold text-sm">
            SP
          </div>
          <div>
            <p className="font-semibold text-sm leading-tight">SecurePay</p>
            <p className="text-xs text-gray-400 truncate max-w-[140px]">{org?.name}</p>
          </div>
        </div>
      </div>

      {/* Org type badge */}
      <div className="px-6 pt-3 pb-1">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
          {org?.type === 'solo' ? 'Individual' : 'Agency'} · {org?.plan}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <span className="text-base">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Trial progress bar */}
      <TrialProgress />

      {/* User info + logout */}
      <div className="px-4 py-4 border-t border-gray-700">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-indigo-400 flex items-center justify-center text-xs font-bold">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs text-gray-400 truncate">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-400
            hover:bg-gray-800 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
