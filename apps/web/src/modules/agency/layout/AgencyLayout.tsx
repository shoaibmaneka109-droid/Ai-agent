import { Outlet, Link } from "react-router-dom";

export function AgencyLayout() {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside style={{ width: 220, borderRight: "1px solid #e2e8f0", padding: "1rem" }}>
        <strong>Agency</strong>
        <nav style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: 8 }}>
          <Link to="/agency">Overview</Link>
          <Link to="/agency/settings/integrations">Integrations (API keys)</Link>
          <Link to="/agency/login">Sign in</Link>
          <Link to="/solo">Switch to Solo UI</Link>
        </nav>
      </aside>
      <section style={{ flex: 1, padding: "1.5rem" }}>
        <Outlet />
      </section>
    </div>
  );
}
