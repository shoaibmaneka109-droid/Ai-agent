import { Routes, Route, Navigate } from "react-router-dom";
import { AgencyLayout } from "../modules/agency/layout/AgencyLayout";
import { SoloDashboard } from "../modules/solo/pages/SoloDashboard";
import { AgencyHome } from "../modules/agency/pages/AgencyHome";
import { IntegrationSettingsPage } from "../modules/agency/pages/IntegrationSettingsPage";
import { AgencyLoginPage } from "../modules/agency/pages/AgencyLoginPage";
import { AgencyDashboardPage } from "../modules/agency/pages/AgencyDashboardPage";
import { EmployeeMyCardPage } from "../modules/agency/pages/EmployeeMyCardPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/solo" replace />} />
      <Route path="/solo" element={<SoloDashboard />} />
      <Route path="/agency" element={<AgencyLayout />}>
        <Route index element={<AgencyHome />} />
        <Route path="dashboard" element={<AgencyDashboardPage />} />
        <Route path="settings/integrations" element={<IntegrationSettingsPage />} />
        <Route path="my-card" element={<EmployeeMyCardPage />} />
      </Route>
      <Route path="/agency/login" element={<AgencyLoginPage />} />
    </Routes>
  );
}
