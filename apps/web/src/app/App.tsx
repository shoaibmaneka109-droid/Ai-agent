import { Routes, Route, Navigate } from "react-router-dom";
import { AgencyLayout } from "../modules/agency/layout/AgencyLayout";
import { SoloDashboard } from "../modules/solo/pages/SoloDashboard";
import { AgencyHome } from "../modules/agency/pages/AgencyHome";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/solo" replace />} />
      <Route path="/solo" element={<SoloDashboard />} />
      <Route path="/agency" element={<AgencyLayout />}>
        <Route index element={<AgencyHome />} />
      </Route>
    </Routes>
  );
}
