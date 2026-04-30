import type { CredentialProvider } from "./index.js";

export type ConnectionTestResult =
  | { ok: true; provider: CredentialProvider; message: string }
  | { ok: false; provider: CredentialProvider; message: string; statusCode?: number };

export async function testStripeConnection(secretKey: string): Promise<ConnectionTestResult> {
  const key = secretKey.trim();
  if (!key.startsWith("sk_") && !key.startsWith("rk_")) {
    return { ok: false, provider: "stripe", message: "Stripe secret key should start with sk_ or rk_" };
  }
  const res = await fetch("https://api.stripe.com/v1/balance", {
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false,
      provider: "stripe",
      message: text.slice(0, 200) || res.statusText,
      statusCode: res.status,
    };
  }
  return { ok: true, provider: "stripe", message: "Stripe API accepted the key (balance retrieved)." };
}

export interface AirwallexCreds {
  clientId: string;
  apiKey: string;
  /** Sandbox: api-demo.airwallex.com; production: api.airwallex.com */
  baseUrl?: string;
}

export async function testAirwallexConnection(creds: AirwallexCreds): Promise<ConnectionTestResult> {
  const base =
    creds.baseUrl?.replace(/\/$/, "") ||
    (creds.apiKey.includes("_demo_") || creds.clientId.toLowerCase().includes("demo")
      ? "https://api-demo.airwallex.com/api/v1"
      : "https://api.airwallex.com/api/v1");
  const loginUrl = `${base}/authentication/login`;
  const res = await fetch(loginUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-client-id": creds.clientId.trim(),
      "x-api-key": creds.apiKey.trim(),
    },
    body: "{}",
  });
  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false,
      provider: "airwallex",
      message: text.slice(0, 200) || res.statusText,
      statusCode: res.status,
    };
  }
  const data = (await res.json()) as { token?: string };
  if (!data?.token) {
    return { ok: false, provider: "airwallex", message: "Login succeeded but no token in response" };
  }
  return { ok: true, provider: "airwallex", message: "Airwallex authentication/login succeeded." };
}

export async function testWiseConnection(apiToken: string, live: boolean): Promise<ConnectionTestResult> {
  const host = live ? "https://api.wise.com" : "https://api.sandbox.transferwise.tech";
  const res = await fetch(`${host}/v1/me`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiToken.trim()}` },
  });
  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false,
      provider: "wise",
      message: text.slice(0, 200) || res.statusText,
      statusCode: res.status,
    };
  }
  return { ok: true, provider: "wise", message: "Wise API accepted the token (GET /v1/me)." };
}
