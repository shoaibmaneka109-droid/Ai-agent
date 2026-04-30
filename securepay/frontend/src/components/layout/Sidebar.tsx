import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, CreditCard, Key, Users, Settings, LogOut, ShieldCheck, Zap,
} from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import { authApi } from '../../api/auth.api';
import clsx from 'clsx';

const navItems = [
  { to: '/dashboard',              label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/payments',               label: 'Payments',     icon: CreditCard },
  { to: '/settings/api-keys',      label: 'Integrations', icon: Key },
  { to: '/settings/team',          label: 'Team',         icon: Users },
  { to: '/settings/subscription',  label: 'Subscription', icon: Zap },
  { to: '/settings/profile',       label: 'Profile',      icon: Settings },
];

export default function Sidebar() {
  const { user, clearAuth } = useAuthStore();

  async function handleLogout() {
    try { await authApi.logout(); } catch {}
    clearAuth();
  }

  return (
    <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-gray-200 px-6 py-5">
        <ShieldCheck className="h-8 w-8 text-brand-600" />
        <span className="text-xl font-bold tracking-tight text-gray-900">SecurePay</span>
      </div>

      {/* Plan badge */}
      {user && (
        <div className="px-4 py-3">
          <span className={clsx(
            'badge text-xs capitalize',
            user.role === 'owner' ? 'badge-blue' : 'badge-gray',
          )}>
            {user.role}
          </span>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              )
            }
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-gray-200 p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="truncate text-xs text-gray-500">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
