import { FormEvent, useMemo, useState } from "react";
import type { ApiKeyEnvironment, PaymentProvider } from "@securepay/shared";

import { securePayRequest } from "../lib/api-client";

type IntegrationSummary = {
  id: string;
  provider: PaymentProvider;
  environment: ApiKeyEnvironment;
  apiKeyPreview: string;
  webhookSecretPreview: string | null;
  cardIssuingEnabled: boolean;
  lastConnectionStatus: "untested" | "success" | "failed";
  lastConnectionMessage: string | null;
  lastConnectionCheckedAt: string | null;
  updatedAt: string;
};

type SaveIntegrationResponse = {
  data: IntegrationSummary;
};

type ListIntegrationsResponse = {
  data: IntegrationSummary[];
};

type TestConnectionResponse = {
  data: {
    provider: PaymentProvider;
    environment: ApiKeyEnvironment;
    status: "success" | "failed";
    message: string;
    checkedAt: string;
  };
};

const providers: Array<{ value: PaymentProvider; label: string }> = [
  { value: "stripe", label: "Stripe" },
  { value: "airwallex", label: "Airwallex" },
  { value: "wise", label: "Wise" }
];

const environments: ApiKeyEnvironment[] = ["test", "live"];

export function ProviderSettings() {
  const [accessToken, setAccessToken] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [provider, setProvider] = useState<PaymentProvider>("stripe");
  const [environment, setEnvironment] = useState<ApiKeyEnvironment>("test");
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [cardIssuingEnabled, setCardIssuingEnabled] = useState(true);
  const [integrations, setIntegrations] = useState<IntegrationSummary[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const requestContext = useMemo(
    () => ({
      accessToken: accessToken || undefined,
      organizationId: organizationId || undefined
    }),
    [accessToken, organizationId]
  );

  const loadIntegrations = async () => {
    setIsBusy(true);
    setMessage(null);

    try {
      const response = await securePayRequest<ListIntegrationsResponse>(
        "/v1/provider-integrations",
        requestContext
      );
      setIntegrations(response.data);
      setMessage("Provider settings loaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load integrations.");
    } finally {
      setIsBusy(false);
    }
  };

  const saveIntegration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsBusy(true);
    setMessage(null);

    try {
      const response = await securePayRequest<SaveIntegrationResponse>("/v1/provider-integrations", {
        ...requestContext,
        method: "PUT",
        body: {
          provider,
          environment,
          apiKey,
          webhookSecret: webhookSecret || undefined,
          cardIssuingEnabled
        }
      });

      setIntegrations((current) => [
        response.data,
        ...current.filter(
          (integration) =>
            integration.provider !== response.data.provider ||
            integration.environment !== response.data.environment
        )
      ]);
      setApiKey("");
      setWebhookSecret("");
      setMessage("Encrypted provider credentials saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save provider credentials.");
    } finally {
      setIsBusy(false);
    }
  };

  const testConnection = async (integration: IntegrationSummary) => {
    setIsBusy(true);
    setMessage(null);

    try {
      const response = await securePayRequest<TestConnectionResponse>(
        `/v1/provider-integrations/${integration.id}/test`,
        {
          ...requestContext,
          body: {}
        }
      );

      setIntegrations((current) =>
        current.map((item) =>
          item.id === integration.id
            ? {
                ...item,
                lastConnectionStatus: response.data.status,
                lastConnectionCheckedAt: response.data.checkedAt
              }
            : item
        )
      );
      setMessage(response.data.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Connection test failed.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <main className="settings-shell">
      <section className="hero compact">
        <div className="eyebrow">Admin settings</div>
        <h1>Self-service card issuing integrations</h1>
        <p>
          Admins can add Stripe, Airwallex, or Wise API keys and webhook secrets for their own
          organization. SecurePay encrypts secrets before saving them and lets admins test each
          provider connection without manual platform intervention.
        </p>
      </section>

      <section className="settings-grid">
        <form className="card form-stack" onSubmit={saveIntegration}>
          <h2>Save encrypted credentials</h2>
          <label>
            JWT access token
            <input
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              placeholder="Paste admin JWT"
              type="password"
            />
          </label>
          <label>
            Organization ID
            <input
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
              placeholder="Organization UUID"
            />
          </label>
          <label>
            Provider
            <select value={provider} onChange={(event) => setProvider(event.target.value as PaymentProvider)}>
              {providers.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Environment
            <select
              value={environment}
              onChange={(event) => setEnvironment(event.target.value as ApiKeyEnvironment)}
            >
              {environments.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            API key
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Provider API key"
              type="password"
            />
          </label>
          <label>
            Webhook secret
            <input
              value={webhookSecret}
              onChange={(event) => setWebhookSecret(event.target.value)}
              placeholder="Optional webhook signing secret"
              type="password"
            />
          </label>
          <label className="checkbox-row">
            <input
              checked={cardIssuingEnabled}
              onChange={(event) => setCardIssuingEnabled(event.target.checked)}
              type="checkbox"
            />
            Enable card issuing for this provider
          </label>
          <button disabled={isBusy} type="submit">
            Save credentials
          </button>
          <button disabled={isBusy} onClick={loadIntegrations} type="button">
            Load saved integrations
          </button>
          {message ? <p className="status-message">{message}</p> : null}
        </form>

        <section className="card">
          <h2>Saved integrations</h2>
          <div className="integration-list">
            {integrations.length === 0 ? (
              <p className="muted">No provider credentials loaded yet.</p>
            ) : (
              integrations.map((integration) => (
                <article className="integration-row" key={integration.id}>
                  <div>
                    <strong>
                      {integration.provider} / {integration.environment}
                    </strong>
                    <p className="muted">
                      API key {integration.apiKeyPreview}
                      {integration.webhookSecretPreview
                        ? `, webhook ${integration.webhookSecretPreview}`
                        : ", no webhook secret"}
                    </p>
                    <p className="muted">
                      Card issuing {integration.cardIssuingEnabled ? "enabled" : "disabled"}
                    </p>
                    <p className={`connection-status ${integration.lastConnectionStatus}`}>
                      {integration.lastConnectionStatus}
                      {integration.lastConnectionMessage ? `: ${integration.lastConnectionMessage}` : ""}
                    </p>
                  </div>
                  <button disabled={isBusy} onClick={() => testConnection(integration)} type="button">
                    Test connection
                  </button>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
