import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';
import { useAuth } from '../hooks/useAuth';

export default function AppLayout() {
  const { isAuthenticated, loading } = useAuth();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>
        <Outlet />
      </main>
    </div>
  );
}
