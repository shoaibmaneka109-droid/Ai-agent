import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiJson, getStoredOrganizationId } from "../../../shared/lib/api";

interface VirtualCard {
  id: string;
  externalRef: string;
  last4: string;
  label: string | null;
}

interface EmployeeRow {
  userId: string;
  email: string;
  virtualCard: { id: string; externalRef: string; last4: string; label: string | null } | null;
  allowedVpsIp: string | null;
}

export function AgencyDashboardPage() {
  const orgId = getStoredOrganizationId();
  const [cards, setCards] = useState<VirtualCard[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newCardRef, setNewCardRef] = useState("");
  const [newCardLast4, setNewCardLast4] = useState("");
  const [newCardLabel, setNewCardLabel] = useState("");

  const [empEmail, setEmpEmail] = useState("");
  const [empPassword, setEmpPassword] = useState("");
  const [empCardId, setEmpCardId] = useState("");
  const [empIp, setEmpIp] = useState("");

  const load = useCallback(async () => {
    if (!orgId) return;
    setError(null);
    try {
      const [c, e] = await Promise.all([
        apiJson<{ virtualCards: VirtualCard[] }>(`/api/v1/organizations/${orgId}/virtual-cards`),
        apiJson<{ employees: EmployeeRow[] }>(`/api/v1/organizations/${orgId}/employees`),
      ]);
      setCards(c.virtualCards ?? []);
      setEmployees(e.employees ?? []);
    } catch (err: unknown) {
      const e = err as { status?: number; body?: { error?: string } };
      setError(e.body?.error ?? "Failed to load dashboard (sign in as admin?)");
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (cards.length > 0 && !empCardId) {
      setEmpCardId(cards[0]!.id);
    }
  }, [cards, empCardId]);

  async function createCard(ev: FormEvent) {
    ev.preventDefault();
    if (!orgId) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/api/v1/organizations/${orgId}/virtual-cards`, {
        method: "POST",
        body: JSON.stringify({
          externalRef: newCardRef,
          last4: newCardLast4,
          label: newCardLabel || undefined,
        }),
      });
      setNewCardRef("");
      setNewCardLast4("");
      setNewCardLabel("");
      await load();
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e.body?.error ?? "Create card failed");
    } finally {
      setBusy(false);
    }
  }

  async function addEmployee(ev: FormEvent) {
    ev.preventDefault();
    if (!orgId) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/api/v1/organizations/${orgId}/members/employees`, {
        method: "POST",
        body: JSON.stringify({
          email: empEmail,
          password: empPassword,
          virtualCardId: empCardId,
          allowedVpsIp: empIp,
        }),
      });
      setEmpEmail("");
      setEmpPassword("");
      setEmpIp("");
      await load();
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e.body?.error ?? "Add employee failed");
    } finally {
      setBusy(false);
    }
  }

  async function updateEmployeeMapping(userId: string, virtualCardId: string, allowedVpsIp: string) {
    if (!orgId) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/api/v1/organizations/${orgId}/employees/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ virtualCardId, allowedVpsIp }),
      });
      await load();
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e.body?.error ?? "Update failed");
    } finally {
      setBusy(false);
    }
  }

  if (!orgId) {
    return (
      <p>
        No organization in session. <Link to="/agency/login">Sign in</Link>
      </p>
    );
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ marginTop: 0 }}>Agency dashboard</h1>
      <p style={{ color: "#64748b", fontSize: 14 }}>
        Register each issued virtual card, then add employees with a <strong>mandatory VPS IP</strong>. Employees
        can only load full card details when their request comes from that IP (see API{' '}
        <code>TRUST_PROXY</code> behind a load balancer).
      </p>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

      <section style={{ marginBottom: "2rem" }}>
        <h2>Virtual cards</h2>
        <form onSubmit={createCard} style={{ display: "grid", gap: 8, maxWidth: 420 }}>
          <input
            placeholder="Issuer card id / external ref"
            value={newCardRef}
            onChange={(e) => setNewCardRef(e.target.value)}
            required
            style={{ padding: 8 }}
          />
          <input
            placeholder="Last 4 digits"
            value={newCardLast4}
            onChange={(e) => setNewCardLast4(e.target.value)}
            maxLength={4}
            required
            style={{ padding: 8 }}
          />
          <input placeholder="Label (optional)" value={newCardLabel} onChange={(e) => setNewCardLabel(e.target.value)} style={{ padding: 8 }} />
          <button type="submit" disabled={busy}>
            Register card
          </button>
        </form>
        <ul>
          {cards.map((c) => (
            <li key={c.id}>
              <code>{c.externalRef}</code> · **** {c.last4}
              {c.label ? ` — ${c.label}` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2>Employees</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
              <th style={{ padding: "8px 4px" }}>Email</th>
              <th>Card</th>
              <th>VPS IP</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <EmployeeMappingRow
                key={emp.userId}
                emp={emp}
                cards={cards}
                busy={busy}
                onSave={(cardId, ip) => void updateEmployeeMapping(emp.userId, cardId, ip)}
              />
            ))}
          </tbody>
        </table>

        <h3 style={{ marginTop: "1.5rem" }}>Add employee</h3>
        <form onSubmit={addEmployee} style={{ display: "grid", gap: 8, maxWidth: 420 }}>
          <input type="email" placeholder="Email" value={empEmail} onChange={(e) => setEmpEmail(e.target.value)} required style={{ padding: 8 }} />
          <input type="password" placeholder="Password" value={empPassword} onChange={(e) => setEmpPassword(e.target.value)} required style={{ padding: 8 }} />
          <label>
            Virtual card
            <select value={empCardId} onChange={(e) => setEmpCardId(e.target.value)} required style={{ width: "100%", marginTop: 4, padding: 8 }}>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.externalRef} (…{c.last4})
                </option>
              ))}
            </select>
          </label>
          <input placeholder="VPS IP (e.g. 203.0.113.10)" value={empIp} onChange={(e) => setEmpIp(e.target.value)} required style={{ padding: 8 }} />
          <button type="submit" disabled={busy || cards.length === 0}>
            Create employee
          </button>
        </form>
        {cards.length === 0 ? <p style={{ color: "#b45309" }}>Register at least one virtual card before adding employees.</p> : null}
      </section>

      <p>
        <Link to="/agency">Home</Link> · <Link to="/agency/settings/integrations">Integrations</Link> ·{" "}
        <Link to="/agency/my-card">Employee: my card</Link>
      </p>
    </div>
  );
}

function EmployeeMappingRow(props: {
  emp: EmployeeRow;
  cards: VirtualCard[];
  busy: boolean;
  onSave: (virtualCardId: string, ip: string) => void;
}) {
  const [cardId, setCardId] = useState(props.emp.virtualCard?.id ?? props.cards[0]?.id ?? "");
  const [ip, setIp] = useState(props.emp.allowedVpsIp ?? "");
  return (
    <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
      <td style={{ padding: "8px 4px" }}>{props.emp.email}</td>
      <td>
        <select value={cardId} onChange={(e) => setCardId(e.target.value)} style={{ maxWidth: 200 }}>
          {props.cards.map((c) => (
            <option key={c.id} value={c.id}>
              …{c.last4}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input value={ip} onChange={(e) => setIp(e.target.value)} style={{ width: 140, padding: 4 }} />
      </td>
      <td>
        <button type="button" disabled={props.busy} onClick={() => props.onSave(cardId, ip)}>
          Save
        </button>
      </td>
    </tr>
  );
}
