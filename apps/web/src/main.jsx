import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

function TenantCard({ title, description, bullets }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <p>{description}</p>
      <ul>
        {bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
    </section>
  );
}

function App() {
  return (
    <main className="page">
      <header className="hero">
        <span className="badge">SecurePay</span>
        <h1>Multi-tenant payments platform scaffold</h1>
        <p>
          SecurePay is designed for Solo operators and Agency organizations with
          strict tenant boundaries, encrypted provider credentials, and modular
          backend services.
        </p>
      </header>

      <div className="grid">
        <TenantCard
          title="Solo"
          description="Single-owner tenant optimized for freelancers and independent operators."
          bullets={[
            "One default owner membership",
            "Personal billing profile",
            "Provider keys limited to the tenant",
          ]}
        />
        <TenantCard
          title="Agency"
          description="Company tenant with member roles, team billing, and delegated provider management."
          bullets={[
            "Multiple memberships and roles",
            "Company metadata and invoicing settings",
            "Centralized provider credential vault",
          ]}
        />
      </div>

      <section className="card architecture">
        <h2>Architecture at a glance</h2>
        <ol>
          <li>React frontend calls tenant-aware API endpoints.</li>
          <li>Express middleware resolves the active tenant from headers.</li>
          <li>Modules enforce tenant scoping on every query.</li>
          <li>Provider secrets are encrypted with AES-256 before persistence.</li>
        </ol>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
