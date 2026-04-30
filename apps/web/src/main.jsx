import React, { useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

const API_BASE_URL = "http://localhost:4000";

const PROVIDERS = [
  {
    key: "stripe",
    name: "Stripe",
    description: "Card issuing and webhook credentials for Stripe-managed programs.",
    environmentOptions: ["sandbox", "live"],
    fields: [
      { key: "api_key", label: "API Key", placeholder: "sk_test_..." },
      { key: "webhook_secret", label: "Webhook Secret", placeholder: "whsec_..." },
    ],
  },
  {
    key: "airwallex",
    name: "Airwallex",
    description: "Store client authentication and webhook settings for Airwallex issuing APIs.",
    environmentOptions: ["sandbox", "live"],
    fields: [
      { key: "client_id", label: "Client ID", placeholder: "client-id" },
      { key: "api_key", label: "API Key", placeholder: "api-key" },
      { key: "webhook_secret", label: "Webhook Secret", placeholder: "webhook secret" },
    ],
  },
  {
    key: "wise",
    name: "Wise",
    description: "Configure Wise API token and webhook secret for tenant self-service issuing setup.",
    environmentOptions: ["sandbox", "live"],
    fields: [
      { key: "api_key", label: "API Token", placeholder: "sandbox token" },
      { key: "webhook_secret", label: "Webhook Secret", placeholder: "webhook secret" },
    ],
  },
];

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

function maskStoredValue(value) {
  if (!value) {
    return "Not configured";
  }

  return value;
}

function IntegrationCard({
  provider,
  formValues,
  onChange,
  onEnvironmentChange,
  onSave,
  onTest,
  isSaving,
  isTesting,
  persistedState,
}) {
  return (
    <section className="card integration-card">
      <div className="integration-card__header">
        <div>
          <h2>{provider.name}</h2>
          <p>{provider.description}</p>
        </div>
        <span
          className={`status-pill status-pill--${
            persistedState?.lastTestStatus || "not_tested"
          }`}
        >
          {persistedState?.lastTestStatus || "not_tested"}
        </span>
      </div>

      <div className="integration-meta">
        <div>
          <span className="meta-label">Environment</span>
          <select
            value={formValues.environment || persistedState?.environment || "sandbox"}
            onChange={(event) => onEnvironmentChange(provider.key, event.target.value)}
          >
            {provider.environmentOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="meta-label">Last tested</span>
          <strong>{persistedState?.lastTestedAt || "Never"}</strong>
        </div>
      </div>

      <div className="integration-fields">
        {provider.fields.map((field) => {
          const storedEntry = persistedState?.credentials?.[field.key];

          return (
            <label className="field" key={field.key}>
              <span>{field.label}</span>
              <input
                type="password"
                value={formValues[field.key] || ""}
                placeholder={field.placeholder}
                onChange={(event) => onChange(provider.key, field.key, event.target.value)}
              />
              <small>
                Stored: {maskStoredValue(storedEntry?.maskedValue || storedEntry?.publicValue)}{" "}
                {storedEntry?.keyFingerprint ? `(${storedEntry.keyFingerprint})` : ""}
              </small>
            </label>
          );
        })}
      </div>

      <div className="integration-actions">
        <button type="button" onClick={() => onSave(provider.key)} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save encrypted settings"}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => onTest(provider.key)}
          disabled={isTesting}
        >
          {isTesting ? "Testing..." : "Run connection test"}
        </button>
      </div>

      <p className="integration-message">
        {persistedState?.lastErrorMessage ||
          "Admins can self-service these credentials without manual platform intervention."}
      </p>
    </section>
  );
}

function App() {
  const [tenantId, setTenantId] = useState("replace-with-tenant-id");
  const [accessToken, setAccessToken] = useState("replace-with-jwt-access-token");
  const [message, setMessage] = useState(
    "Enter an access token and tenant id, then save/test provider credentials.",
  );
  const [persisted, setPersisted] = useState({});
  const [savingProvider, setSavingProvider] = useState(null);
  const [testingProvider, setTestingProvider] = useState(null);
  const [formState, setFormState] = useState(() =>
    PROVIDERS.reduce((accumulator, provider) => {
      accumulator[provider.key] = provider.fields.reduce(
        (fieldAccumulator, field) => {
          fieldAccumulator[field.key] = "";
          return fieldAccumulator;
        },
        { environment: "sandbox" },
      );
      return accumulator;
    }, {}),
  );

  const providerState = useMemo(() => {
    return PROVIDERS.reduce((accumulator, provider) => {
      accumulator[provider.key] =
        persisted[provider.key] || {
          provider: provider.key,
          credentials: {},
          lastTestStatus: "not_tested",
          lastTestedAt: null,
          lastErrorMessage: null,
          environment: "sandbox",
        };
      return accumulator;
    }, {});
  }, [persisted]);

  function handleFieldChange(providerKey, fieldKey, value) {
    setFormState((current) => ({
      ...current,
      [providerKey]: {
        ...current[providerKey],
        [fieldKey]: value,
      },
    }));
  }

  function handleEnvironmentChange(providerKey, value) {
    setFormState((current) => ({
      ...current,
      [providerKey]: {
        ...current[providerKey],
        environment: value,
      },
    }));
  }

  async function handleFetchIntegrations() {
    try {
      const response = await fetch(`${API_BASE_URL}/integrations`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-tenant-id": tenantId,
        },
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Unable to fetch integrations.");
      }

      const grouped = {};
      (payload.integrations || []).forEach((integration) => {
        grouped[integration.provider] = integration;
      });
      setPersisted(grouped);
      setMessage("Loaded saved provider settings.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleSave(providerKey) {
    const credentials = Object.entries(formState[providerKey])
      .filter(([, value]) => value.trim())
      .map(([secretType, value]) => ({
        secretType,
        label: `${providerKey}-${secretType}`,
        value,
        publicValue:
          value.length <= 8 ? "********" : `${value.slice(0, 4)}...${value.slice(-4)}`,
      }));

    if (credentials.length === 0) {
      setMessage(`Enter at least one ${providerKey} credential before saving.`);
      return;
    }

    setSavingProvider(providerKey);
    try {
      const response = await fetch(`${API_BASE_URL}/integrations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          "x-tenant-id": tenantId,
        },
        body: JSON.stringify({
          provider: providerKey,
          credentials,
          environment: formState[providerKey].environment || "sandbox",
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Unable to save integration settings.");
      }

      setPersisted((current) => ({
        ...current,
        [providerKey]: payload.integration,
      }));
      setFormState((current) => ({
        ...current,
        [providerKey]: Object.keys(current[providerKey]).reduce(
          (accumulator, key) => {
            accumulator[key] =
              key === "environment" ? current[providerKey].environment : "";
            return accumulator;
          },
          {},
        ),
      }));
      setMessage(`${providerKey} settings saved with encryption.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingProvider(null);
    }
  }

  async function handleTest(providerKey) {
    setTestingProvider(providerKey);
    try {
      const response = await fetch(`${API_BASE_URL}/integrations/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          "x-tenant-id": tenantId,
        },
        body: JSON.stringify({
          provider: providerKey,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Connection test failed.");
      }

      setPersisted((current) => ({
        ...current,
        [providerKey]: {
          ...(current[providerKey] || providerState[providerKey]),
          lastTestStatus: payload.result.success ? "connected" : "failed",
          lastTestedAt: new Date().toISOString(),
          lastErrorMessage: payload.result.success ? null : payload.result.message,
        },
      }));
      setMessage(payload.result.message);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setTestingProvider(null);
    }
  }

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

      <section className="card settings-shell">
        <div className="settings-shell__header">
          <div>
            <h2>Admin integration settings</h2>
            <p>
              Self-service vault for Stripe, Airwallex, and Wise card issuing keys
              plus webhook secrets.
            </p>
          </div>
          <button type="button" className="secondary" onClick={handleFetchIntegrations}>
            Refresh saved integrations
          </button>
        </div>

        <div className="credential-bar">
          <label className="field">
            <span>Tenant ID</span>
            <input
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              placeholder="tenant uuid"
            />
          </label>
          <label className="field credential-bar__token">
            <span>Admin access token</span>
            <input
              type="password"
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              placeholder="Bearer token"
            />
          </label>
        </div>

        <p className="integration-message">{message}</p>
      </section>

      <div className="grid integrations-grid">
        {PROVIDERS.map((provider) => (
          <IntegrationCard
            key={provider.key}
            provider={provider}
            formValues={formState[provider.key]}
            persistedState={providerState[provider.key]}
            isSaving={savingProvider === provider.key}
            isTesting={testingProvider === provider.key}
            onChange={handleFieldChange}
            onEnvironmentChange={handleEnvironmentChange}
            onSave={handleSave}
            onTest={handleTest}
          />
        ))}
      </div>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
