import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { apiJson, getStoredOrganizationId } from "../../../shared/lib/api";

type Provider = "stripe" | "airwallex" | "wise";

interface CredentialRow {
  provider: string;
  kind: string;
  updatedAt: string;
}

interface ConnectionOk {
  ok: true;
  provider: string;
  message: string;
  webhook?: { ok: boolean; message: string };
}

interface ConnectionFail {
  ok: false;
  provider: string;
  message: string;
  statusCode?: number;
  webhook?: { ok: boolean; message: string };
}

function ProviderCard(props: {
  title: string;
  provider: Provider;
  children: ReactNode;
  onSave: () => Promise<void>;
  onTestDraft: () => Promise<void>;
  onTestSaved: () => Promise<void>;
  busy: boolean;
  lastResult: ConnectionOk | ConnectionFail | null;
}) {
  return (
    <section
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        padding: "1rem 1.25rem",
        marginBottom: "1.25rem",
        background: "#fff",
      }}
    >
      <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>{props.title}</h2>
      {props.children}
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button type="button" onClick={() => void props.onTestDraft()} disabled={props.busy}>
          Test connection (form)
        </button>
        <button type="button" onClick={() => void props.onTestSaved()} disabled={props.busy}>
          Test saved keys
        </button>
        <button type="button" onClick={() => void props.onSave()} disabled={props.busy}>
          Save encrypted
        </button>
      </div>
      {props.lastResult ? (
        <p
          style={{
            marginTop: 12,
            marginBottom: 0,
            color: props.lastResult.ok ? "#15803d" : "#b91c1c",
            fontSize: 14,
          }}
        >
          {props.lastResult.ok ? "✓ " : "✗ "}
          {props.lastResult.message}
          {props.lastResult.webhook ? (
            <>
              <br />
              <span style={{ color: props.lastResult.webhook.ok ? "#15803d" : "#b91c1c" }}>
                Webhook: {props.lastResult.webhook.message}
              </span>
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}

export function IntegrationSettingsPage() {
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<CredentialRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [stripeApi, setStripeApi] = useState("");
  const [stripeWh, setStripeWh] = useState("");
  const [stripeRes, setStripeRes] = useState<ConnectionOk | ConnectionFail | null>(null);

  const [awClient, setAwClient] = useState("");
  const [awKey, setAwKey] = useState("");
  const [awBase, setAwBase] = useState("");
  const [awWh, setAwWh] = useState("");
  const [awRes, setAwRes] = useState<ConnectionOk | ConnectionFail | null>(null);

  const [wiseToken, setWiseToken] = useState("");
  const [wiseLive, setWiseLive] = useState(false);
  const [wiseWh, setWiseWh] = useState("");
  const [wiseRes, setWiseRes] = useState<ConnectionOk | ConnectionFail | null>(null);

  const refreshRows = useCallback(async () => {
    setLoadErr(null);
    try {
      const data = await apiJson<{ credentials: CredentialRow[] }>("/api/v1/integrations", {
        method: "GET",
      });
      setRows(data.credentials ?? []);
    } catch (e: unknown) {
      const err = e as { status?: number; body?: { error?: string } };
      if (err.status === 401) {
        setLoadErr("Not signed in. Open Agency login.");
      } else if (err.status === 403) {
        setLoadErr("Only organization admins/owners can manage integrations.");
      } else {
        setLoadErr(String(err.body?.error ?? "Failed to load"));
      }
    }
  }, []);

  useEffect(() => {
    void refreshRows();
  }, [refreshRows]);

  async function saveProvider(provider: Provider, body: Record<string, unknown>) {
    setBusy(true);
    try {
      await apiJson(`/api/v1/integrations/${provider}`, { method: "PUT", body: JSON.stringify(body) });
      await refreshRows();
    } finally {
      setBusy(false);
    }
  }

  const orgHint = getStoredOrganizationId();

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ marginTop: 0 }}>Card issuing &amp; payouts</h1>
      <p style={{ color: "#64748b", fontSize: 14 }}>
        Keys are encrypted on the server (AES-256-GCM) before storage. Each tenant configures their own Stripe,
        Airwallex, and Wise credentials—no operator intervention required.
      </p>
      {orgHint ? (
        <p style={{ fontSize: 13, color: "#475569" }}>
          Organization: <code>{orgHint}</code>
        </p>
      ) : (
        <p style={{ color: "#b91c1c" }}>Missing organization id—sign in again.</p>
      )}
      {loadErr ? <p style={{ color: "#b91c1c" }}>{loadErr}</p> : null}
      <p style={{ fontSize: 13 }}>
        Saved rows:{" "}
        {rows.length === 0 ? (
          <em>none</em>
        ) : (
          rows.map((r) => (
            <span key={`${r.provider}-${r.kind}`} style={{ marginRight: 8 }}>
              <code>
                {r.provider}/{r.kind}
              </code>
            </span>
          ))
        )}
      </p>

      <ProviderCard
        title="Stripe"
        provider="stripe"
        busy={busy}
        lastResult={stripeRes}
        onSave={() =>
          saveProvider("stripe", {
            apiSecret: stripeApi,
            webhookSecret: stripeWh || undefined,
          })
        }
        onTestDraft={async () => {
          setBusy(true);
          setStripeRes(null);
          try {
            const r = await apiJson<ConnectionOk | ConnectionFail>(`/api/v1/integrations/stripe/connection-test`, {
              method: "POST",
              body: JSON.stringify({
                apiSecret: stripeApi,
                webhookSecret: stripeWh || undefined,
              }),
            });
            setStripeRes(r);
          } catch (e: unknown) {
            const err = e as { body?: unknown; status?: number };
            setStripeRes({
              ok: false,
              provider: "stripe",
              message: JSON.stringify(err.body ?? err),
              statusCode: err.status,
            });
          } finally {
            setBusy(false);
          }
        }}
        onTestSaved={async () => {
          setBusy(true);
          setStripeRes(null);
          try {
            const r = await apiJson<ConnectionOk | ConnectionFail>(
              `/api/v1/integrations/stripe/connection-test`,
              { method: "GET" }
            );
            setStripeRes(r);
          } catch (e: unknown) {
            const err = e as { body?: unknown; status?: number };
            setStripeRes({
              ok: false,
              provider: "stripe",
              message: JSON.stringify(err.body ?? err),
              statusCode: err.status,
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        <label style={{ display: "block", marginBottom: 8 }}>
          Secret key (sk_live_… / sk_test_…)
          <input
            type="password"
            autoComplete="off"
            value={stripeApi}
            onChange={(ev) => setStripeApi(ev.target.value)}
            style={{ width: "100%", marginTop: 4, padding: 8 }}
          />
        </label>
        <label style={{ display: "block" }}>
          Webhook signing secret (whsec_…)
          <input
            type="password"
            autoComplete="off"
            value={stripeWh}
            onChange={(ev) => setStripeWh(ev.target.value)}
            style={{ width: "100%", marginTop: 4, padding: 8 }}
          />
        </label>
      </ProviderCard>

      <ProviderCard
        title="Airwallex"
        provider="airwallex"
        busy={busy}
        lastResult={awRes}
        onSave={() =>
          saveProvider("airwallex", {
            clientId: awClient,
            apiKey: awKey,
            baseUrl: awBase || undefined,
            webhookSecret: awWh || undefined,
          })
        }
        onTestDraft={async () => {
          setBusy(true);
          setAwRes(null);
          try {
            const r = await apiJson<ConnectionOk | ConnectionFail>(
              `/api/v1/integrations/airwallex/connection-test`,
              {
                method: "POST",
                body: JSON.stringify({
                  clientId: awClient,
                  apiKey: awKey,
                  baseUrl: awBase || undefined,
                  webhookSecret: awWh || undefined,
                }),
              }
            );
            setAwRes(r);
          } catch (e: unknown) {
            const err = e as { body?: unknown; status?: number };
            setAwRes({
              ok: false,
              provider: "airwallex",
              message: JSON.stringify(err.body ?? err),
              statusCode: err.status,
            });
          } finally {
            setBusy(false);
          }
        }}
        onTestSaved={async () => {
          setBusy(true);
          setAwRes(null);
          try {
            const r = await apiJson<ConnectionOk | ConnectionFail>(
              `/api/v1/integrations/airwallex/connection-test`,
              { method: "GET" }
            );
            setAwRes(r);
          } catch (e: unknown) {
            const err = e as { body?: unknown; status?: number };
            setAwRes({
              ok: false,
              provider: "airwallex",
              message: JSON.stringify(err.body ?? err),
              statusCode: err.status,
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        <label style={{ display: "block", marginBottom: 8 }}>
          Client ID
          <input
            value={awClient}
            onChange={(ev) => setAwClient(ev.target.value)}
            style={{ width: "100%", marginTop: 4, padding: 8 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 8 }}>
          API key
          <input
            type="password"
            value={awKey}
            onChange={(ev) => setAwKey(ev.target.value)}
            style={{ width: "100%", marginTop: 4, padding: 8 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 8 }}>
          API base (optional, e.g. https://api-demo.airwallex.com/api/v1)
          <input
            value={awBase}
            onChange={(ev) => setAwBase(ev.target.value)}
            style={{ width: "100%", marginTop: 4, padding: 8 }}
          />
        </label>
        <label style={{ display: "block" }}>
          Webhook secret
          <input
            type="password"
            value={awWh}
            onChange={(ev) => setAwWh(ev.target.value)}
            style={{ width: "100%", marginTop: 4, padding: 8 }}
          />
        </label>
      </ProviderCard>

      <ProviderCard
        title="Wise"
        provider="wise"
        busy={busy}
        lastResult={wiseRes}
        onSave={() =>
          saveProvider("wise", {
            apiSecret: wiseToken,
            live: wiseLive,
            webhookSecret: wiseWh || undefined,
          })
        }
        onTestDraft={async () => {
          setBusy(true);
          setWiseRes(null);
          try {
            const r = await apiJson<ConnectionOk | ConnectionFail>(`/api/v1/integrations/wise/connection-test`, {
              method: "POST",
              body: JSON.stringify({
                apiSecret: wiseToken,
                live: wiseLive,
                webhookSecret: wiseWh || undefined,
              }),
            });
            setWiseRes(r);
          } catch (e: unknown) {
            const err = e as { body?: unknown; status?: number };
            setWiseRes({
              ok: false,
              provider: "wise",
              message: JSON.stringify(err.body ?? err),
              statusCode: err.status,
            });
          } finally {
            setBusy(false);
          }
        }}
        onTestSaved={async () => {
          setBusy(true);
          setWiseRes(null);
          try {
            const r = await apiJson<ConnectionOk | ConnectionFail>(`/api/v1/integrations/wise/connection-test`, {
              method: "GET",
            });
            setWiseRes(r);
          } catch (e: unknown) {
            const err = e as { body?: unknown; status?: number };
            setWiseRes({
              ok: false,
              provider: "wise",
              message: JSON.stringify(err.body ?? err),
              statusCode: err.status,
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <input type="checkbox" checked={wiseLive} onChange={(ev) => setWiseLive(ev.target.checked)} />
          Live Wise API (otherwise sandbox)
        </label>
        <label style={{ display: "block", marginBottom: 8 }}>
          API token
          <input
            type="password"
            value={wiseToken}
            onChange={(ev) => setWiseToken(ev.target.value)}
            style={{ width: "100%", marginTop: 4, padding: 8 }}
          />
        </label>
        <label style={{ display: "block" }}>
          Webhook secret
          <input
            type="password"
            value={wiseWh}
            onChange={(ev) => setWiseWh(ev.target.value)}
            style={{ width: "100%", marginTop: 4, padding: 8 }}
          />
        </label>
      </ProviderCard>

      <p>
        <Link to="/agency">← Agency home</Link>
        {" · "}
        <Link to="/agency/login">Sign in</Link>
      </p>
    </div>
  );
}
