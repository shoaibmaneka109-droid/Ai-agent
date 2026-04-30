import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiJson, setSession } from "../../../shared/lib/api";

export function AgencyLoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiJson<{
        accessToken: string;
        defaultOrganizationId: string;
        userType: string;
      }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        orgId: null,
      });
      setSession(data.accessToken, data.defaultOrganizationId);
      nav("/agency/settings/integrations", { replace: true });
    } catch (err: unknown) {
      const e = err as { body?: { error?: string }; message?: string };
      setError(e.body && typeof e.body === "object" && "error" in e.body ? String((e.body as { error: string }).error) : e.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 400, margin: "3rem auto", padding: "0 1rem" }}>
      <h1>Agency sign in</h1>
      <p style={{ color: "#64748b", fontSize: 14 }}>
        Use the account you created with <code>POST /api/v1/auth/register/agency</code>, or register first via the API.
      </p>
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            required
            style={{ width: "100%", marginTop: 4, padding: 8 }}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            required
            style={{ width: "100%", marginTop: 4, padding: 8 }}
          />
        </label>
        {error ? <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p> : null}
        <button type="submit" disabled={loading} style={{ padding: "10px 16px" }}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p style={{ marginTop: 24 }}>
        <Link to="/agency">Back to agency home</Link>
      </p>
    </main>
  );
}
