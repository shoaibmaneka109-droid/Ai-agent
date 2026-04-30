/**
 * Provider Adapter Registry
 *
 * Each adapter exposes a single `test(credentials)` method that returns:
 * {
 *   success:    boolean,
 *   latencyMs:  number,
 *   httpStatus: number | null,
 *   summary:    string,        // safe to store / show in UI
 *   errorCode:  string | null,
 * }
 *
 * Adapters never log secret key values. They log only safe metadata.
 * The HTTP calls use Node's built-in `https` module to avoid adding
 * heavy provider SDKs as hard dependencies (keeps the Docker image lean).
 * In production, swap the adapters to use the official SDKs.
 */

const stripeAdapter   = require('./stripe.adapter');
const airwallexAdapter = require('./airwallex.adapter');
const wiseAdapter     = require('./wise.adapter');

const ADAPTERS = {
  stripe:    stripeAdapter,
  airwallex: airwallexAdapter,
  wise:      wiseAdapter,
};

/**
 * Returns the adapter for the given provider slug.
 * Throws if the provider is not supported.
 */
const getAdapter = (provider) => {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new Error(`Unsupported provider: ${provider}`);
  return adapter;
};

/**
 * Provider metadata shown in the UI (no secrets).
 */
const PROVIDER_META = {
  stripe: {
    label: 'Stripe',
    logo: '💳',
    color: '#635BFF',
    keyLabel: 'Secret Key',
    keyPlaceholder: 'sk_live_... or sk_test_...',
    publishableKeyLabel: 'Publishable Key',
    publishableKeyPlaceholder: 'pk_live_... or pk_test_...',
    webhookSecretLabel: 'Webhook Signing Secret',
    webhookSecretPlaceholder: 'whsec_...',
    extraCredentialLabel: null,
    docsUrl: 'https://stripe.com/docs/keys',
    testEndpoint: 'https://api.stripe.com/v1/balance',
  },
  airwallex: {
    label: 'Airwallex',
    logo: '🌐',
    color: '#00AFAA',
    keyLabel: 'API Key',
    keyPlaceholder: 'api_key_...',
    publishableKeyLabel: null,
    webhookSecretLabel: 'Webhook Secret',
    webhookSecretPlaceholder: 'whsec_...',
    extraCredentialLabel: 'Client ID',
    extraCredentialPlaceholder: 'client_id_...',
    docsUrl: 'https://www.airwallex.com/docs/api',
    testEndpoint: 'https://api.airwallex.com/api/v1/authentication/login',
  },
  wise: {
    label: 'Wise (TransferWise)',
    logo: '💚',
    color: '#37517E',
    keyLabel: 'API Token',
    keyPlaceholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    publishableKeyLabel: null,
    webhookSecretLabel: 'Webhook Public Key (PEM)',
    webhookSecretPlaceholder: '-----BEGIN PUBLIC KEY-----\n...',
    extraCredentialLabel: 'Profile ID',
    extraCredentialPlaceholder: '12345678',
    docsUrl: 'https://docs.wise.com/api-docs',
    testEndpoint: 'https://api.wise.com/v1/profiles',
  },
};

module.exports = { getAdapter, PROVIDER_META, ADAPTERS };
