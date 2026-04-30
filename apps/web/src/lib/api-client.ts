const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

type RequestOptions = {
  tenantId?: string;
  organizationId?: string;
  body?: unknown;
};

export async function securePayRequest<T>(
  path: string,
  { tenantId, organizationId, body }: RequestOptions = {},
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      ...(tenantId ? { "x-tenant-id": tenantId } : {}),
      ...(organizationId ? { "x-organization-id": organizationId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`SecurePay API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}
