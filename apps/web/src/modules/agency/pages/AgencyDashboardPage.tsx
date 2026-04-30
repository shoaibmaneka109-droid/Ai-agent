import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiJson, getStoredOrganizationId } from "../../../shared/lib/api";
import { subscribeOrgCardEvents } from "../../../shared/lib/cardEventsSocket";

interface VirtualCard {
  id: string;
  externalRef: string;
  last4: string;
  label: string | null;
  frozen?: boolean;
  fullTimeFreeze?: boolean;
  isAutoFreezeEnabled?: boolean;
}

type OrgRole = "owner" | "admin" | "sub_admin" | "member";

interface MePermissions {
  manageEmployees: boolean;
  viewCardsHideKeys: boolean;
  cardAdminFundTransfer: boolean;
}

interface SubAdminRow {
  userId: string;
  email: string;
  permissions: MePermissions;
  joinedAt: string | null;
}

interface EmployeeRow {
  userId: string;
  email: string;
  virtualCard: { id: string; externalRef: string; last4: string; label: string | null; frozen?: boolean } | null;
  allowedVpsIp: string | null;
  cardFrozen?: boolean;
  paymentsAuthorizedUntil: string | null;
}

export function AgencyDashboardPage() {
  const orgId = getStoredOrganizationId();
  const [cards, setCards] = useState<VirtualCard[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [organizationRole, setOrganizationRole] = useState<OrgRole | null | undefined>(undefined);
  const [permissions, setPermissions] = useState<MePermissions | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  const isMainAdmin = organizationRole === "owner" || organizationRole === "admin";
  const isSubAdmin = organizationRole === "sub_admin";
  const canDashboard = isMainAdmin || isSubAdmin;
  const permA = permissions?.manageEmployees ?? false;
  const permB = permissions?.viewCardsHideKeys ?? false;
  const permC = permissions?.cardAdminFundTransfer ?? false;

  const [subAdmins, setSubAdmins] = useState<SubAdminRow[]>([]);
  const [whitelistMerchants, setWhitelistMerchants] = useState<{ id: string; hostname: string; label: string | null }[]>(
    []
  );
  const [wlHost, setWlHost] = useState("");
  const [wlLabel, setWlLabel] = useState("");
  const [emergencyLockdown, setEmergencyLockdown] = useState(false);
  const [cardFrozenToast, setCardFrozenToast] = useState<string | null>(null);
  const [mgrEmail, setMgrEmail] = useState("");
  const [mgrPassword, setMgrPassword] = useState("");
  const [mgrA, setMgrA] = useState(true);
  const [mgrB, setMgrB] = useState(false);
  const [mgrC, setMgrC] = useState(false);

  const [ftCardId, setFtCardId] = useState("");
  const [ftAmount, setFtAmount] = useState("10000");
  const [ftNote, setFtNote] = useState("");

  const [newCardRef, setNewCardRef] = useState("");
  const [newCardLast4, setNewCardLast4] = useState("");
  const [newCardLabel, setNewCardLabel] = useState("");

  const [empEmail, setEmpEmail] = useState("");
  const [empPassword, setEmpPassword] = useState("");
  const [empCardId, setEmpCardId] = useState("");
  const [empIp, setEmpIp] = useState("");

  const loadDashboard = useCallback(async () => {
    if (!orgId || !canDashboard || permissions == null) return;
    setError(null);
    try {
      const promises: Promise<unknown>[] = [];
      if (permA || permB) {
        promises.push(
          apiJson<{ virtualCards: VirtualCard[] }>(`/api/v1/organizations/${orgId}/virtual-cards`).then((c) => {
            setCards(c.virtualCards ?? []);
          })
        );
      } else {
        setCards([]);
      }
      if (permA) {
        promises.push(
          apiJson<{ employees: EmployeeRow[] }>(`/api/v1/organizations/${orgId}/employees`).then((e) => {
            setEmployees(e.employees ?? []);
          })
        );
      } else {
        setEmployees([]);
      }
      await Promise.all(promises);
      if (isMainAdmin) {
        const s = await apiJson<{ subAdmins: SubAdminRow[] }>(`/api/v1/organizations/${orgId}/sub-admins`);
        setSubAdmins(s.subAdmins ?? []);
        const w = await apiJson<{ merchants: { id: string; hostname: string; label: string | null }[] }>(
          `/api/v1/organizations/${orgId}/checkout-allowed-merchants`
        );
        setWhitelistMerchants(w.merchants ?? []);
        const lock = await apiJson<{ emergencyLockdown: boolean }>(
          `/api/v1/organizations/${orgId}/emergency-lockdown`
        );
        setEmergencyLockdown(lock.emergencyLockdown ?? false);
      } else {
        setSubAdmins([]);
        setWhitelistMerchants([]);
        setEmergencyLockdown(false);
      }
    } catch (err: unknown) {
      const e = err as { status?: number; body?: { error?: string } };
      setError(e.body?.error ?? "Failed to load dashboard");
    }
  }, [orgId, canDashboard, permissions, permA, permB, isMainAdmin]);

  const loadMe = useCallback(async () => {
    if (!orgId) {
      setOrganizationRole(undefined);
      setMeLoading(false);
      return;
    }
    setMeLoading(true);
    try {
      const me = await apiJson<{
        user?: {
          organizationRole?: OrgRole | null;
          organizationPermissions?: MePermissions | null;
        };
      }>("/api/v1/auth/me");
      setOrganizationRole(me.user?.organizationRole ?? null);
      setPermissions(me.user?.organizationPermissions ?? null);
    } catch {
      setOrganizationRole(null);
      setPermissions(null);
    } finally {
      setMeLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!canDashboard || !orgId) return;
    const unsub = subscribeOrgCardEvents((p) => {
      if (p.organizationId !== orgId) return;
      setCardFrozenToast(
        `Card …${p.last4} frozen via webhook (${p.provider}). Session freeze applied — refresh list if needed.`
      );
      void loadDashboard();
    });
    return unsub;
  }, [canDashboard, orgId, loadDashboard]);

  useEffect(() => {
    if (cards.length > 0 && !empCardId) {
      setEmpCardId(cards[0]!.id);
    }
  }, [cards, empCardId]);

  useEffect(() => {
    if (cards.length > 0 && !ftCardId && permC) {
      setFtCardId(cards[0]!.id);
    }
  }, [cards, ftCardId, permC]);

  async function addWhitelistMerchant(ev: FormEvent) {
    ev.preventDefault();
    if (!orgId) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/api/v1/organizations/${orgId}/checkout-allowed-merchants`, {
        method: "POST",
        body: JSON.stringify({ hostname: wlHost.trim().toLowerCase(), label: wlLabel.trim() || undefined }),
      });
      setWlHost("");
      setWlLabel("");
      await loadDashboard();
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e.body?.error ?? "Whitelist add failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeWhitelistMerchant(id: string) {
    if (!orgId) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/api/v1/organizations/${orgId}/checkout-allowed-merchants/${id}`, { method: "DELETE" });
      await loadDashboard();
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e.body?.error ?? "Remove failed");
    } finally {
      setBusy(false);
    }
  }

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
      await loadDashboard();
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
      await loadDashboard();
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e.body?.error ?? "Add employee failed");
    } finally {
      setBusy(false);
    }
  }

  async function setCardFrozen(cardId: string, frozen: boolean) {
    if (!orgId) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/api/v1/organizations/${orgId}/virtual-cards/${cardId}/freeze`, {
        method: "POST",
        body: JSON.stringify({ frozen }),
      });
      await loadDashboard();
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e.body?.error ?? "Freeze update failed");
    } finally {
      setBusy(false);
    }
  }

  async function setFullTimeFreeze(cardId: string, fullTimeFreeze: boolean) {
    if (!orgId) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/api/v1/organizations/${orgId}/virtual-cards/${cardId}/full-time-freeze`, {
        method: "PATCH",
        body: JSON.stringify({ fullTimeFreeze }),
      });
      await loadDashboard();
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e.body?.error ?? "Master freeze update failed");
    } finally {
      setBusy(false);
    }
  }

  async function applyEmergencyLockdown(active: boolean) {
    if (!orgId) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/api/v1/organizations/${orgId}/emergency-lockdown`, {
        method: "POST",
        body: JSON.stringify({ active }),
      });
      setEmergencyLockdown(active);
      await loadDashboard();
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e.body?.error ?? "Emergency lockdown failed");
    } finally {
      setBusy(false);
    }
  }

  async function setAutoFreeze(cardId: string, isAutoFreezeEnabled: boolean) {
    if (!orgId) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/api/v1/organizations/${orgId}/virtual-cards/${cardId}/auto-freeze`, {
        method: "PATCH",
        body: JSON.stringify({ isAutoFreezeEnabled }),
      });
      await loadDashboard();
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e.body?.error ?? "Auto-freeze update failed");
    } finally {
      setBusy(false);
    }
  }

  async function setPaymentsAuthorization(userId: string, untilIso: string | null) {
    if (!orgId) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/api/v1/organizations/${orgId}/employees/${userId}/payments-authorization`, {
        method: "PATCH",
        body: JSON.stringify({ until: untilIso }),
      });
      await loadDashboard();
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e.body?.error ?? "Authorization update failed");
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
      await loadDashboard();
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e.body?.error ?? "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function createSubAdmin(ev: FormEvent) {
    ev.preventDefault();
    if (!orgId) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/api/v1/organizations/${orgId}/sub-admins`, {
        method: "POST",
        body: JSON.stringify({
          email: mgrEmail,
          password: mgrPassword,
          canManageEmployees: mgrA,
          canViewCardsHideKeys: mgrB,
          canCardAdminFundTransfer: mgrC,
        }),
      });
      setMgrEmail("");
      setMgrPassword("");
      await loadDashboard();
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e.body?.error ?? "Create manager failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitFundTransfer(ev: FormEvent) {
    ev.preventDefault();
    if (!orgId || !ftCardId) return;
    setBusy(true);
    setError(null);
    try {
      const amount = Number(ftAmount);
      await apiJson(`/api/v1/organizations/${orgId}/fund-transfers`, {
        method: "POST",
        body: JSON.stringify({
          fromVirtualCardId: ftCardId,
          amountCents: amount,
          note: ftNote || undefined,
        }),
      });
      setFtNote("");
      await loadDashboard();
    } catch (err: unknown) {
      const e = err as { body?: { error?: string } };
      setError(e.body?.error ?? "Fund transfer failed");
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

  if (meLoading) {
    return (
      <div style={{ maxWidth: 900 }}>
        <p style={{ color: "#64748b" }}>Loading…</p>
      </div>
    );
  }

  if (!canDashboard) {
    return (
      <div style={{ maxWidth: 720 }}>
        <h1 style={{ marginTop: 0 }}>Agency dashboard</h1>
        <p style={{ color: "#64748b", fontSize: 15 }}>
          This page is for <strong>organization admins and managers</strong>. Employees map cards and VPS IP from here
          only when granted access — use <Link to="/agency/my-card">My virtual card</Link> for your assigned card.
        </p>
        <p>
          <Link to="/agency">Home</Link> · <Link to="/agency/my-card">My card</Link>
        </p>
      </div>
    );
  }

  if (!permA && !permB && !permC) {
    return (
      <div style={{ maxWidth: 720 }}>
        <h1 style={{ marginTop: 0 }}>Agency dashboard</h1>
        <p style={{ color: "#b45309" }}>
          Your manager account has no permissions enabled. Ask a main admin to grant at least one of: Manage employees,
          View cards, or Fund transfers.
        </p>
        <p>
          <Link to="/agency">Home</Link>
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ marginTop: 0 }}>Agency dashboard</h1>
      <p style={{ color: "#64748b", fontSize: 14 }}>
        {isMainAdmin ? (
          <>
            As <strong>main admin</strong>, register virtual cards and create <strong>managers (sub-admins)</strong> with
            granular permissions. Employees need a mapped card and <strong>mandatory VPS IP</strong>;{" "}
            <code>requireEmployeeVpsIpForCardAccess</code> compares the request IP to <code>allowed_vps_ip</code>.
          </>
        ) : (
          <>
            Signed in as <strong>manager (sub-admin)</strong>. Sections below match your assigned permissions (A: employees,
            B: cards without API keys, C: fund transfers).
          </>
        )}
      </p>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {cardFrozenToast ? (
        <p style={{ background: "#fef3c7", border: "1px solid #fcd34d", padding: "10px 12px", borderRadius: 6, fontSize: 14 }}>
          {cardFrozenToast}{" "}
          <button type="button" onClick={() => setCardFrozenToast(null)} style={{ marginLeft: 8 }}>
            Dismiss
          </button>
        </p>
      ) : null}

      {isMainAdmin ? (
        <section
          style={{
            marginBottom: "2rem",
            padding: "1rem",
            background: emergencyLockdown ? "#fef2f2" : "#fff7ed",
            borderRadius: 8,
            border: emergencyLockdown ? "2px solid #ef4444" : "1px solid #fed7aa",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Emergency lockdown</h2>
          <p style={{ fontSize: 14, color: "#64748b" }}>
            One click freezes <strong>all</strong> agency cards for employees and the Chrome extension (session toggles
            still apply for admins). Clear when safe.
          </p>
          {emergencyLockdown ? (
            <p style={{ color: "#b91c1c", fontWeight: 600 }}>Lockdown is ACTIVE — all employee card fills blocked.</p>
          ) : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={busy || emergencyLockdown}
              onClick={() => void applyEmergencyLockdown(true)}
              style={{
                padding: "10px 18px",
                background: "#dc2626",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: busy || emergencyLockdown ? "not-allowed" : "pointer",
              }}
            >
              Emergency lockdown (freeze all)
            </button>
            <button
              type="button"
              disabled={busy || !emergencyLockdown}
              onClick={() => void applyEmergencyLockdown(false)}
              style={{ padding: "10px 18px", borderRadius: 6, cursor: busy || !emergencyLockdown ? "not-allowed" : "pointer" }}
            >
              Clear lockdown
            </button>
          </div>
        </section>
      ) : null}

      {isMainAdmin ? (
        <section style={{ marginBottom: "2rem", padding: "1rem", background: "#f8fafc", borderRadius: 8 }}>
          <h2 style={{ marginTop: 0 }}>Managers (sub-admins)</h2>
          <p style={{ fontSize: 14, color: "#64748b" }}>
            Permission A: manage employees · B: view/freeze cards (no Stripe/Airwallex API keys) · C: card-to-admin fund
            transfers (simulated).
          </p>
          <ul style={{ fontSize: 14 }}>
            {subAdmins.map((s) => (
              <li key={s.userId}>
                <strong>{s.email}</strong> — A:{s.permissions.manageEmployees ? "✓" : "—"} B:
                {s.permissions.viewCardsHideKeys ? "✓" : "—"} C:{s.permissions.cardAdminFundTransfer ? "✓" : "—"}
              </li>
            ))}
          </ul>
          <h3 style={{ fontSize: "1rem" }}>Add manager</h3>
          <form onSubmit={createSubAdmin} style={{ display: "grid", gap: 8, maxWidth: 440 }}>
            <input type="email" placeholder="Email" value={mgrEmail} onChange={(e) => setMgrEmail(e.target.value)} required style={{ padding: 8 }} />
            <input type="password" placeholder="Password" value={mgrPassword} onChange={(e) => setMgrPassword(e.target.value)} required style={{ padding: 8 }} />
            <label style={{ fontSize: 14 }}>
              <input type="checkbox" checked={mgrA} onChange={(e) => setMgrA(e.target.checked)} /> A — Manage employees
            </label>
            <label style={{ fontSize: 14 }}>
              <input type="checkbox" checked={mgrB} onChange={(e) => setMgrB(e.target.checked)} /> B — View cards (hide API keys)
            </label>
            <label style={{ fontSize: 14 }}>
              <input type="checkbox" checked={mgrC} onChange={(e) => setMgrC(e.target.checked)} /> C — Card-to-admin fund transfers
            </label>
            <button type="submit" disabled={busy || (!mgrA && !mgrB && !mgrC)}>
              Create manager
            </button>
          </form>
        </section>
      ) : null}

      {isMainAdmin ? (
        <section style={{ marginBottom: "2rem", padding: "1rem", background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0" }}>
          <h2 style={{ marginTop: 0 }}>Chrome extension — checkout whitelist</h2>
          <p style={{ fontSize: 14, color: "#166534" }}>
            Employees use the SecurePay extension on checkout pages. Add each payment page <strong>hostname</strong>{" "}
            (e.g. <code>buy.stripe.com</code>, <code>pay.example.com</code>) so the extension will fetch card data only
            on those sites.
          </p>
          <form onSubmit={addWhitelistMerchant} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
            <label>
              Hostname
              <input value={wlHost} onChange={(e) => setWlHost(e.target.value)} placeholder="buy.stripe.com" required style={{ display: "block", marginTop: 4, padding: 8, minWidth: 220 }} />
            </label>
            <label>
              Label (optional)
              <input value={wlLabel} onChange={(e) => setWlLabel(e.target.value)} placeholder="Stripe Checkout" style={{ display: "block", marginTop: 4, padding: 8, minWidth: 160 }} />
            </label>
            <button type="submit" disabled={busy}>
              Add hostname
            </button>
          </form>
          <ul style={{ fontSize: 14, margin: 0, paddingLeft: "1.2rem" }}>
            {whitelistMerchants.map((m) => (
              <li key={m.id} style={{ marginBottom: 6 }}>
                <code>{m.hostname}</code>
                {m.label ? ` — ${m.label}` : ""}{" "}
                <button type="button" disabled={busy} onClick={() => void removeWhitelistMerchant(m.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 0 }}>
            Install from <code>extensions/securepay-checkout</code> in this repo (load unpacked). Set API URL + token
            in the extension popup.
            <br />
            <strong>Payment webhooks</strong> (Stripe / Airwallex):{" "}
            <code>POST /api/webhooks/payments?organization_id=&lt;ORG_UUID&gt;</code> — Stripe sends{" "}
            <code>Stripe-Signature</code>; Airwallex sends signed JSON. On <code>payment_intent.succeeded</code>, set
            PaymentIntent metadata <code>organization_virtual_card_id</code> to the virtual card UUID. Enable{" "}
            <strong>Auto-freeze after payment</strong> per card below.
          </p>
        </section>
      ) : null}

      {permA || permB ? (
        <section style={{ marginBottom: "2rem" }}>
          <h2>Virtual cards</h2>
          {permA && !permB ? (
            <p style={{ fontSize: 14, color: "#64748b" }}>
              You can map employees to cards listed below. Registering new cards or freezing requires permission B.
            </p>
          ) : null}
          {permB ? (
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
          ) : null}
          <ul>
            {cards.map((c) => (
              <li key={c.id} style={{ marginBottom: 8 }}>
                <code>{c.externalRef}</code> · **** {c.last4}
                {c.label ? ` — ${c.label}` : ""}
                {c.frozen ? (
                  <span style={{ color: "#b91c1c", marginLeft: 8 }}>Session freeze</span>
                ) : null}
                {c.fullTimeFreeze ? (
                  <span style={{ color: "#7c2d12", marginLeft: 8 }}>Master freeze</span>
                ) : null}
                {c.isAutoFreezeEnabled ? (
                  <span style={{ color: "#0369a1", marginLeft: 8 }}>Auto-freeze on pay</span>
                ) : null}
                {permB ? (
                  <span style={{ marginLeft: 12, display: "inline-flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <button type="button" disabled={busy} onClick={() => void setCardFrozen(c.id, !c.frozen)}>
                      {c.frozen ? "Unfreeze session" : "Freeze session"}
                    </button>
                    <label style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(c.fullTimeFreeze)}
                        disabled={busy}
                        onChange={(e) => void setFullTimeFreeze(c.id, e.target.checked)}
                      />
                      Master freeze (full-time)
                    </label>
                    <label style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(c.isAutoFreezeEnabled)}
                        disabled={busy}
                        onChange={(e) => void setAutoFreeze(c.id, e.target.checked)}
                      />
                      Auto-freeze after successful payment
                    </label>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {permA ? (
        <section style={{ marginBottom: "2rem" }}>
          <h2>Employees</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "8px 4px" }}>Email</th>
                <th>Card</th>
                <th>VPS IP</th>
                <th>Pay auth until</th>
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
                  onSetPayAuth={(untilIso) => void setPaymentsAuthorization(emp.userId, untilIso)}
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
          {cards.length === 0 ? (
            <p style={{ color: "#b45309" }}>Register at least one virtual card before adding employees.</p>
          ) : null}
        </section>
      ) : null}

      {permC && cards.length > 0 ? (
        <section style={{ marginBottom: "2rem" }}>
          <h2>Card → admin fund transfer (simulated)</h2>
          <p style={{ fontSize: 14, color: "#64748b" }}>
            Records a transfer intent for reconciliation. Wire to your issuer API in production.
          </p>
          <form onSubmit={submitFundTransfer} style={{ display: "grid", gap: 8, maxWidth: 420 }}>
            <label>
              From card
              <select value={ftCardId} onChange={(e) => setFtCardId(e.target.value)} style={{ width: "100%", marginTop: 4, padding: 8 }}>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.externalRef} (…{c.last4})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Amount (cents)
              <input type="number" min={1} value={ftAmount} onChange={(e) => setFtAmount(e.target.value)} style={{ width: "100%", marginTop: 4, padding: 8 }} />
            </label>
            <input placeholder="Note (optional)" value={ftNote} onChange={(e) => setFtNote(e.target.value)} style={{ padding: 8 }} />
            <button type="submit" disabled={busy}>
              Record transfer
            </button>
          </form>
        </section>
      ) : null}

      <p>
        <Link to="/agency">Home</Link>
        {isMainAdmin ? (
          <>
            {" "}
            · <Link to="/agency/settings/integrations">Integrations (main admin)</Link>
          </>
        ) : null}
        {" "}
        · <Link to="/agency/my-card">Employee: my card</Link>
      </p>
    </div>
  );
}

function EmployeeMappingRow(props: {
  emp: EmployeeRow;
  cards: VirtualCard[];
  busy: boolean;
  onSave: (virtualCardId: string, ip: string) => void;
  onSetPayAuth: (untilIso: string | null) => void;
}) {
  const [cardId, setCardId] = useState(props.emp.virtualCard?.id ?? props.cards[0]?.id ?? "");
  const [ip, setIp] = useState(props.emp.allowedVpsIp ?? "");
  const [authLocal, setAuthLocal] = useState(() => {
    if (!props.emp.paymentsAuthorizedUntil) return "";
    const d = new Date(props.emp.paymentsAuthorizedUntil);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  useEffect(() => {
    setCardId(props.emp.virtualCard?.id ?? props.cards[0]?.id ?? "");
    setIp(props.emp.allowedVpsIp ?? "");
    if (!props.emp.paymentsAuthorizedUntil) {
      setAuthLocal("");
      return;
    }
    const d = new Date(props.emp.paymentsAuthorizedUntil);
    if (Number.isNaN(d.getTime())) {
      setAuthLocal("");
      return;
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    setAuthLocal(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  }, [
    props.emp.userId,
    props.emp.paymentsAuthorizedUntil,
    props.emp.allowedVpsIp,
    props.emp.virtualCard?.id,
    props.cards,
  ]);
  return (
    <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
      <td style={{ padding: "8px 4px" }}>{props.emp.email}</td>
      <td>
        <select value={cardId} onChange={(e) => setCardId(e.target.value)} style={{ maxWidth: 200 }}>
          {props.cards.map((c) => (
            <option key={c.id} value={c.id}>
              …{c.last4}
              {c.frozen ? " (frozen)" : ""}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input value={ip} onChange={(e) => setIp(e.target.value)} style={{ width: 140, padding: 4 }} />
      </td>
      <td style={{ fontSize: 12 }}>
        <input
          type="datetime-local"
          value={authLocal}
          onChange={(e) => setAuthLocal(e.target.value)}
          style={{ maxWidth: 180 }}
        />
        <div style={{ marginTop: 4 }}>
          <button type="button" disabled={props.busy} onClick={() => props.onSetPayAuth(authLocal ? new Date(authLocal).toISOString() : null)}>
            Set window
          </button>{" "}
          <button type="button" disabled={props.busy} onClick={() => props.onSetPayAuth(null)}>
            Clear
          </button>
        </div>
        {props.emp.paymentsAuthorizedUntil ? (
          <div style={{ color: "#64748b", marginTop: 4 }}>API: {props.emp.paymentsAuthorizedUntil}</div>
        ) : null}
      </td>
      <td>
        <button type="button" disabled={props.busy} onClick={() => props.onSave(cardId, ip)}>
          Save
        </button>
      </td>
    </tr>
  );
}
