import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../../../shared/lib/api";

export function EmployeeMyCardPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [payResult, setPayResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadLoading, setLoadLoading] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [amount, setAmount] = useState("100");
  const [merchantRef, setMerchantRef] = useState("test-merchant");

  async function load(ev?: FormEvent) {
    ev?.preventDefault();
    setLoadLoading(true);
    setError(null);
    setData(null);
    try {
      const j = await apiJson<Record<string, unknown>>("/api/v1/virtual-cards/my-virtual-card/details");
      setData(j);
    } catch (err: unknown) {
      const e = err as { status?: number; body?: Record<string, unknown> };
      setError(JSON.stringify(e.body ?? { status: e.status }));
    } finally {
      setLoadLoading(false);
    }
  }

  async function authorizedPayment(ev: FormEvent) {
    ev.preventDefault();
    setPayLoading(true);
    setError(null);
    setPayResult(null);
    try {
      const cents = Math.round(Number(amount) * 100);
      const j = await apiJson<Record<string, unknown>>("/api/v1/virtual-cards/authorized-payment", {
        method: "POST",
        body: JSON.stringify({ amountCents: cents, merchantRef }),
      });
      setPayResult(j);
    } catch (err: unknown) {
      const e = err as { status?: number; body?: Record<string, unknown> };
      setError(JSON.stringify(e.body ?? { status: e.status }));
    } finally {
      setPayLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 560, padding: "1rem" }}>
      <h1>My virtual card</h1>
      <p style={{ color: "#64748b", fontSize: 14 }}>
        Card details and <strong>authorized payments</strong> are only accepted if the request reaches the API from
        your registered <strong>VPS IP</strong>. Use this page from that server or tunnel, or configure{" "}
        <code>TRUST_PROXY</code> behind your load balancer. Your admin must also set an <strong>authorized payment</strong>{" "}
        window for your account.
      </p>
      <form onSubmit={load}>
        <button type="submit" disabled={loadLoading}>
          {loadLoading ? "Loading…" : "Load card details"}
        </button>
      </form>
      <h2 style={{ fontSize: "1.1rem", marginTop: "1.5rem" }}>Simulated authorized payment</h2>
      <form onSubmit={authorizedPayment} style={{ display: "grid", gap: 8, maxWidth: 360 }}>
        <label>
          Amount (USD)
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>
        <label>
          Merchant ref
          <input value={merchantRef} onChange={(e) => setMerchantRef(e.target.value)} style={{ width: "100%", padding: 8, marginTop: 4 }} />
        </label>
        <button type="submit" disabled={payLoading}>
          {payLoading ? "…" : "POST authorized payment"}
        </button>
      </form>
      {error ? (
        <pre style={{ color: "#b91c1c", whiteSpace: "pre-wrap", fontSize: 13 }}>{error}</pre>
      ) : null}
      {data ? <pre style={{ fontSize: 13, background: "#f8fafc", padding: 12 }}>{JSON.stringify(data, null, 2)}</pre> : null}
      {payResult ? (
        <pre style={{ fontSize: 13, background: "#ecfdf5", padding: 12, marginTop: 12 }}>
          {JSON.stringify(payResult, null, 2)}
        </pre>
      ) : null}
      <p>
        <Link to="/agency/dashboard">← Admin dashboard</Link>
      </p>
    </main>
  );
}
