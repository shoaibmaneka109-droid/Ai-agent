import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "../../../shared/lib/api";

export function EmployeeMyCardPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(ev?: FormEvent) {
    ev?.preventDefault();
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const j = await apiJson<Record<string, unknown>>("/api/v1/virtual-cards/my-virtual-card/details");
      setData(j);
    } catch (err: unknown) {
      const e = err as { status?: number; body?: Record<string, unknown> };
      setError(JSON.stringify(e.body ?? { status: e.status }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 560, padding: "1rem" }}>
      <h1>My virtual card</h1>
      <p style={{ color: "#64748b", fontSize: 14 }}>
        Card details are returned only if your browser request reaches the API from the <strong>VPS IP</strong> your
        admin configured. Use this page from that server or tunnel, or configure <code>TRUST_PROXY</code> behind your
        load balancer.
      </p>
      <form onSubmit={load}>
        <button type="submit" disabled={loading}>
          {loading ? "Loading…" : "Load card details"}
        </button>
      </form>
      {error ? (
        <pre style={{ color: "#b91c1c", whiteSpace: "pre-wrap", fontSize: 13 }}>{error}</pre>
      ) : null}
      {data ? <pre style={{ fontSize: 13, background: "#f8fafc", padding: 12 }}>{JSON.stringify(data, null, 2)}</pre> : null}
      <p>
        <Link to="/agency/dashboard">← Admin dashboard</Link>
      </p>
    </main>
  );
}
