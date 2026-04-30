/**
 * Provider adapter registry.
 *
 * Each adapter exports { testConnection(params) → TestResult }.
 * Adding a new provider: create ./providerName.adapter.js and register it here.
 * No other code changes required (self-service).
 */
const stripe    = require('./stripe.adapter');
const airwallex = require('./airwallex.adapter');
const wise      = require('./wise.adapter');
const paypal    = require('./paypal.adapter');

const ADAPTERS = {
  stripe,
  airwallex,
  wise,
  paypal,
};

/**
 * Run a connection test for the given provider.
 *
 * @param {string} provider   - provider slug (must match ADAPTERS key)
 * @param {object} params     - { secretKey, clientId?, environment? }
 * @returns {Promise<TestResult>}
 *
 * TestResult shape:
 *   { success: boolean, message: string, httpStatus: number|null, detail: object }
 */
async function runConnectionTest(provider, params) {
  const adapter = ADAPTERS[provider.toLowerCase()];
  if (!adapter) {
    return {
      success:    false,
      message:    `No connection test available for provider "${provider}".`,
      httpStatus: null,
      detail:     {},
    };
  }
  return adapter.testConnection(params);
}

/**
 * List all registered provider slugs.
 */
function listSupportedProviders() {
  return Object.keys(ADAPTERS);
}

module.exports = { runConnectionTest, listSupportedProviders, ADAPTERS };
