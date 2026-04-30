const KEYS = {
  apiBase: "securepay_api_base",
  orgId: "securepay_org_id",
  token: "securepay_access_token",
};

async function load() {
  const s = await chrome.storage.sync.get([KEYS.apiBase, KEYS.orgId, KEYS.token]);
  document.getElementById("apiBase").value = s[KEYS.apiBase] || "";
  document.getElementById("orgId").value = s[KEYS.orgId] || "";
  document.getElementById("token").value = s[KEYS.token] || "";
}

document.getElementById("save").addEventListener("click", async () => {
  const apiBase = document.getElementById("apiBase").value.trim().replace(/\/$/, "");
  const orgId = document.getElementById("orgId").value.trim();
  const token = document.getElementById("token").value.trim();
  const status = document.getElementById("status");
  if (!apiBase || !orgId || !token) {
    status.textContent = "Fill all fields.";
    return;
  }
  await chrome.storage.sync.set({
    [KEYS.apiBase]: apiBase,
    [KEYS.orgId]: orgId,
    [KEYS.token]: token,
  });
  status.textContent = "Saved.";
});

void load();
