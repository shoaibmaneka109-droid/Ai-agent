import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';

import LoginPage        from './pages/auth/LoginPage';
import RegisterPage     from './pages/auth/RegisterPage';
import DashboardPage    from './pages/dashboard/DashboardPage';
import PaymentsPage     from './pages/dashboard/PaymentsPage';
import ApiKeysPage      from './pages/settings/ApiKeysPage';
import OrgSettingsPage  from './pages/settings/OrgSettingsPage';
import TeamPage         from './pages/settings/TeamPage';
import SubscriptionPage from './pages/settings/SubscriptionPage';
import AppLayout        from './components/layout/AppLayout';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user)   return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (user)    return <Navigate to="/dashboard" replace />;
  return children;
}

function FullPageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public */}
        <Route path="/login"    element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

        {/* Protected */}
        <Route
          path="/"
          element={<PrivateRoute><AppLayout /></PrivateRoute>}
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"          element={<DashboardPage />} />
          <Route path="payments"           element={<PaymentsPage />} />
          <Route path="settings/api-keys"      element={<ApiKeysPage />} />
          <Route path="settings/org"           element={<OrgSettingsPage />} />
          <Route path="settings/team"          element={<TeamPage />} />
          <Route path="settings/subscription"  element={<SubscriptionPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
