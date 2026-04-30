const STORAGE_TOKEN = "securepay_access_token";
const STORAGE_ORG = "securepay_organization_id";

export function getStoredToken(): string | null {
  return localStorage.getItem(STORAGE_TOKEN);
}

export function setSession(token: string, organizationId: string): void {
  localStorage.setItem(STORAGE_TOKEN, token);
  localStorage.setItem(STORAGE_ORG, organizationId);
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_TOKEN);
  localStorage.removeItem(STORAGE_ORG);
}

export function getStoredOrganizationId(): string | null {
  return localStorage.getItem(STORAGE_ORG);
}

const baseUrl = () => (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export async function apiJson<T>(
  path: string,
  options: RequestInit & { orgId?: string | null } = {}
): Promise<T> {
  const { orgId, ...init } = options;
  const headers = new Headers(init.headers);
  const token = getStoredToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const oid = orgId ?? getStoredOrganizationId();
  if (oid) headers.set("X-Organization-Id", oid);
  if (!headers.has("Content-Type") && init.body != null) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${baseUrl()}${path}`, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = { raw: text };
    }
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`) as Error & { status: number; body: unknown };
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data as T;
}
