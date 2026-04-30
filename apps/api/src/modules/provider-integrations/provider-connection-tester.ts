import type { ApiKeyEnvironment, PaymentProvider } from "@securepay/shared";

export type ConnectionTestResult = {
  provider: PaymentProvider;
  environment: ApiKeyEnvironment;
  ok: boolean;
  status: number | null;
  message: string;
};

type ProviderProbe = {
  url: string;
  headers: (apiKey: string) => Record<string, string>;
};

const probes: Record<PaymentProvider, ProviderProbe> = {
  stripe: {
    url: "https://api.stripe.com/v1/account",
    headers: (apiKey) => ({
      authorization: `Bearer ${apiKey}`
    })
  },
  airwallex: {
    url: "https://api.airwallex.com/api/v1/account",
    headers: (apiKey) => ({
      authorization: `Bearer ${apiKey}`
    })
  },
  wise: {
    url: "https://api.transferwise.com/v1/profiles",
    headers: (apiKey) => ({
      authorization: `Bearer ${apiKey}`
    })
  }
};

export async function testProviderConnection(
  provider: PaymentProvider,
  environment: ApiKeyEnvironment,
  apiKey: string
): Promise<ConnectionTestResult> {
  const probe = probes[provider];
  const response = await fetch(probe.url, {
    method: "GET",
    headers: {
      accept: "application/json",
      ...probe.headers(apiKey)
    }
  });

  if (response.ok) {
    return {
      provider,
      environment,
      ok: true,
      status: response.status,
      message: `${provider} credentials verified successfully.`
    };
  }

  return {
    provider,
    environment,
    ok: false,
    status: response.status,
    message: `${provider} rejected the configured API key.`
  };
}
