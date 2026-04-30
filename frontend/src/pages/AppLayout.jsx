import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';
import TrialBanner from '../components/common/TrialBanner';
import HibernationBanner from '../components/common/HibernationBanner';
import { useAuth } from '../hooks/useAuth';

export default function AppLayout() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)', display: 'flex', flexDirection: 'column' }}>
        {/* Global subscription banners — visible on every page */}
        <TrialBanner />
        <HibernationBanner />
        <div style={{ flex: 1 }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
