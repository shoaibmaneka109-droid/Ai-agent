import { userTypeLabel } from "../../shared/lib/userType";

export function SoloDashboard() {
  return (
    <main style={{ padding: "2rem", maxWidth: 720 }}>
      <h1>Solo workspace</h1>
      <p>{userTypeLabel("solo")} — one user, typically one organization.</p>
    </main>
  );
}
