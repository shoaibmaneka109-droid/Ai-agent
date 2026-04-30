import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import SubscriptionBanner from '../common/SubscriptionBanner';

const AppLayout = () => (
  <div className="flex min-h-screen bg-gray-50">
    <Sidebar />
    <div className="flex-1 flex flex-col overflow-hidden">
      <SubscriptionBanner />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  </div>
);

export default AppLayout;
