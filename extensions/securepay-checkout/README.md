# SecurePay Checkout (Chrome MV3)

Connects to the SecurePay API for employees on **admin-whitelisted** checkout pages. Card number fields are **visually masked** (blur overlay + transparent text + copy blocked) so the employee can submit payment without easily reading or copying the full PAN.

## Load in Chrome

1. Open `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this folder (`extensions/securepay-checkout`).
3. Click the extension icon → set **API base URL** (e.g. `http://localhost:4000`), **Organization ID**, **JWT** (same token the web app stores after login).

## Backend

- Run migrations **`006_checkout_merchant_whitelist.sql`** and **`007_master_freeze_emergency_lockdown.sql`**.
- Main admin adds hostnames under **Agency dashboard → Chrome extension — checkout whitelist** (e.g. `buy.stripe.com`).
- Extension calls **`GET /api/v1/extension/card-fill-status?hostname=...`** before autofill (live freeze / lockdown / whitelist / VPS).
- Optional: set **`EXTENSION_CORS_ORIGIN`** in `apps/api/.env` to your extension id, e.g. `chrome-extension://abcdefghijklmnop` (otherwise dev allows reflecting `chrome-extension://` origin).

## Flow

1. Content script detects likely checkout (URL keywords or `cc-number`-style fields).
2. Calls background → **`GET /api/v1/extension/merchant-allowed?hostname=...`**
3. Calls background → **`GET /api/v1/extension/card-fill-status?hostname=...`** — if `canFill` is false, **no autofill** (master freeze, session freeze, or agency emergency lockdown).
4. If allowed → **`GET /api/v1/extension/checkout-card?hostname=...`** (employee + VPS IP + subscription + whitelist + not frozen).
5. Fills PAN/CVC/expiry/name; PAN input gets **mask overlay** and copy/cut blocked on that control.

## Limitations

- **Defense in depth**: a determined user can still read values via DevTools or memory; combine with issuer controls and short-lived tokens in production.
- Heuristic checkout detection may misfire on unusual sites; tune keywords or gate on explicit user action if needed.
