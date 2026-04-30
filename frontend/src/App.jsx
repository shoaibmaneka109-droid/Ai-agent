import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store';
import './styles/global.css';

import AppLayout from './pages/AppLayout';
import LoginPage from './components/auth/LoginPage';
import RegisterPage from './components/auth/RegisterPage';
import DashboardPage from './components/dashboard/DashboardPage';
import PaymentsPage from './components/payments/PaymentsPage';
import ApiKeysPage from './components/organizations/ApiKeysPage';
import TeamPage from './components/organizations/TeamPage';
import SettingsPage from './components/organizations/SettingsPage';

export default function App() {
  return (
    <Provider store={store}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/payments" element={<PaymentsPage />} />
            <Route path="/api-keys" element={<ApiKeysPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </Provider>
  );
}
