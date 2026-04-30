import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, CreditCard, Key, Settings, Users,
  LogOut, Menu, X, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const navItems = [
  { to: '/dashboard',         label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/payments',          label: 'Payments',   icon: CreditCard },
  { to: '/settings/api-keys', label: 'API Keys',   icon: Key },
  { to: '/settings/team',     label: 'Team',       icon: Users },
  { to: '/settings/org',      label: 'Settings',   icon: Settings },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const [open, setOpen]  = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-primary-900 text-white
                    transition-transform duration-200 lg:relative lg:translate-x-0
                    ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-6 py-5 border-b border-primary-800">
          <ShieldCheck className="h-7 w-7 text-primary-300" />
          <span className="text-xl font-bold tracking-tight">SecurePay</span>
        </div>

        {/* Org badge */}
        <div className="px-6 py-3 border-b border-primary-800">
          <p className="text-xs text-primary-400 uppercase tracking-wider">Organization</p>
          <p className="mt-0.5 text-sm font-medium truncate">{user?.org_slug || user?.orgSlug}</p>
          <span className="mt-1 inline-block rounded bg-primary-700 px-2 py-0.5 text-xs capitalize">
            {user?.org_plan || user?.orgPlan || 'free'}
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition
                 ${isActive
                   ? 'bg-primary-700 text-white'
                   : 'text-primary-200 hover:bg-primary-800 hover:text-white'
                 }`
              }
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-primary-800 px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-sm font-bold">
              {(user?.first_name || user?.firstName || '?')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {user?.first_name || user?.firstName} {user?.last_name || user?.lastName}
              </p>
              <p className="truncate text-xs text-primary-400">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm
                       text-primary-300 hover:bg-primary-800 hover:text-white transition"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile topbar */}
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary-600" />
            <span className="font-bold text-primary-900">SecurePay</span>
          </div>
          <button onClick={() => setOpen(true)}>
            <Menu className="h-6 w-6 text-gray-600" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
