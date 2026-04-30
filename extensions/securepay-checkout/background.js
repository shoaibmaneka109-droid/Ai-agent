/**
 * SecurePay MV3 background: proxies API calls so CORS uses chrome-extension:// origin.
 */
const STORAGE = {
  apiBase: "securepay_api_base",
  orgId: "securepay_org_id",
  token: "securepay_access_token",
};

async function getConfig() {
  const s = await chrome.storage.sync.get([STORAGE.apiBase, STORAGE.orgId, STORAGE.token]);
  return {
    apiBase: (s[STORAGE.apiBase] || "").replace(/\/$/, ""),
    orgId: s[STORAGE.orgId] || "",
    token: s[STORAGE.token] || "",
  };
}

async function apiFetch(pathWithQuery) {
  const { apiBase, orgId, token } = await getConfig();
  if (!apiBase || !orgId || !token) {
    return { ok: false, status: 0, error: "Configure API URL, organization ID, and token in the SecurePay popup." };
  }
  const url = `${apiBase}${pathWithQuery}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Organization-Id": orgId,
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, body };
  }
  return { ok: true, status: res.status, body };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "SECUREPAY_CHECK_MERCHANT") {
    const hostname = encodeURIComponent(msg.hostname || "");
    void apiFetch(`/api/v1/extension/merchant-allowed?hostname=${hostname}`).then(sendResponse);
    return true;
  }
  if (msg?.type === "SECUREPAY_FETCH_CHECKOUT_CARD") {
    const hostname = encodeURIComponent(msg.hostname || "");
    void apiFetch(`/api/v1/extension/checkout-card?hostname=${hostname}`).then(sendResponse);
    return true;
  }
  if (msg?.type === "SECUREPAY_CARD_FILL_STATUS") {
    const hostname = encodeURIComponent(msg.hostname || "");
    void apiFetch(`/api/v1/extension/card-fill-status?hostname=${hostname}`).then(sendResponse);
    return true;
  }
  return false;
});
