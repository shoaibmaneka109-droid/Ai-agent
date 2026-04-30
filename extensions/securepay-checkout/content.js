/**
 * SecurePay checkout content script: detect checkout, whitelist via API, autofill with masked PAN.
 */
(function () {
  const CHECKOUT_PATH = /checkout|payment|pay|order|cart|billing|subscribe|donate/i;
  const PAN_ATTR = /card.*number|cardnumber|pan|cc-?number|credit.*card|payment.*card/i;
  const EXP_ATTR = /exp|expiry|expiration|valid/i;
  const CVC_ATTR = /cvc|cvv|security/i;
  const NAME_ATTR = /name.*card|cardholder|billing.*name|cc-?name/i;

  function injectMaskStyles() {
    if (document.getElementById("securepay-checkout-styles")) return;
    const style = document.createElement("style");
    style.id = "securepay-checkout-styles";
    style.textContent = `
      .securepay-mask-wrap { position: relative; display: inline-block; max-width: 100%; vertical-align: middle; }
      .securepay-pan-mask { caret-color: transparent !important; color: transparent !important; }
      .securepay-pan-mask::selection { background: rgba(148,163,184,0.4); color: transparent; }
      .securepay-mask-overlay {
        position: absolute; inset: 0; pointer-events: none;
        backdrop-filter: blur(14px) saturate(1.2);
        -webkit-backdrop-filter: blur(14px) saturate(1.2);
        background: rgba(241,245,249,0.45);
        border-radius: 6px;
        user-select: none;
      }
      .securepay-soft-mask { filter: blur(5px); user-select: none; }
    `;
    document.documentElement.appendChild(style);
  }

  function looksLikeCheckoutPage() {
    const path = `${location.pathname}${location.search}`;
    if (CHECKOUT_PATH.test(path)) return true;
    const inputs = document.querySelectorAll("input");
    let cardish = 0;
    inputs.forEach((el) => {
      const hay = `${el.name} ${el.id} ${el.placeholder} ${el.autocomplete || ""}`.toLowerCase();
      if (PAN_ATTR.test(hay) || el.autocomplete === "cc-number") cardish++;
    });
    return cardish >= 1;
  }

  function findField(matchers, autocomplete) {
    const inputs = Array.from(document.querySelectorAll("input:not([type=hidden])"));
    for (const el of inputs) {
      if (autocomplete && el.autocomplete === autocomplete) return el;
      const hay = `${el.name} ${el.id} ${el.placeholder}`.toLowerCase();
      if (matchers.some((re) => re.test(hay))) return el;
    }
    return null;
  }

  function maskPanField(input) {
    injectMaskStyles();
    if (input.dataset.securepayMasked === "1") return;
    const wrap = document.createElement("span");
    wrap.className = "securepay-mask-wrap";
    const parent = input.parentNode;
    if (!parent) return;
    parent.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.classList.add("securepay-pan-mask");
    const overlay = document.createElement("span");
    overlay.className = "securepay-mask-overlay";
    overlay.setAttribute("aria-hidden", "true");
    wrap.appendChild(overlay);
    input.dataset.securepayMasked = "1";

    const blockLeak = (ev) => {
      if (wrap.contains(ev.target)) ev.preventDefault();
    };
    wrap.addEventListener("copy", blockLeak, true);
    wrap.addEventListener("cut", blockLeak, true);
    wrap.addEventListener("contextmenu", blockLeak, true);
  }

  function softMask(el) {
    if (!el || el.dataset.securepaySoftMasked === "1") return;
    injectMaskStyles();
    el.classList.add("securepay-soft-mask");
    el.addEventListener(
      "copy",
      (e) => {
        if (e.target === el) e.preventDefault();
      },
      true
    );
    el.dataset.securepaySoftMasked = "1";
  }

  function setValue(el, value) {
    if (!el) return;
    el.focus();
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (proto?.set) proto.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function runAutofill() {
    if (!looksLikeCheckoutPage()) return;
    if (document.querySelector(".securepay-mask-wrap")) return;
    const hostname = location.hostname.toLowerCase();

    const allowed = await chrome.runtime.sendMessage({
      type: "SECUREPAY_CHECK_MERCHANT",
      hostname,
    });
    if (!allowed?.ok || !allowed.body?.allowed) {
      console.info("[SecurePay] Merchant not on admin whitelist:", hostname);
      return;
    }

    const status = await chrome.runtime.sendMessage({
      type: "SECUREPAY_CARD_FILL_STATUS",
      hostname,
    });
    if (!status?.ok) {
      console.warn("[SecurePay] Card status check failed:", status?.body || status?.error);
      return;
    }
    const st = status.body;
    if (!st?.canFill) {
      console.info("[SecurePay] Autofill blocked:", st?.reason || st?.message || st);
      return;
    }

    const card = await chrome.runtime.sendMessage({
      type: "SECUREPAY_FETCH_CHECKOUT_CARD",
      hostname,
    });
    if (!card?.ok) {
      console.warn("[SecurePay] Could not load card:", card?.body || card?.error);
      return;
    }
    const d = card.body;
    if (!d?.pan) return;

    const panEl =
      findField([PAN_ATTR], "cc-number") ||
      document.querySelector('input[inputmode="numeric"][autocomplete="cc-number"]');
    const expCombined = findField([/^cc-?exp$/i, /exp.*date/i], "cc-exp");
    const expMonth = document.querySelector('input[autocomplete="cc-exp-month"]');
    const expYear = document.querySelector('input[autocomplete="cc-exp-year"]');
    const cvcEl = findField([CVC_ATTR], "cc-csc");
    const nameEl = findField([NAME_ATTR], "cc-name");

    if (panEl) {
      setValue(panEl, d.pan);
      maskPanField(panEl);
    }
    if (expMonth && expYear && d.expiryMonth && d.expiryYear) {
      setValue(expMonth, String(Number(d.expiryMonth)));
      setValue(expYear, String(d.expiryYear));
    } else if (expCombined) {
      setValue(expCombined, `${d.expiryMonth}/${String(d.expiryYear).slice(-2)}`);
      softMask(expCombined);
    }
    if (cvcEl && d.cvc) setValue(cvcEl, d.cvc);
    if (nameEl && d.nameOnCard) setValue(nameEl, d.nameOnCard);

    softMask(cvcEl);
    softMask(nameEl);
  }

  let debounceT;
  function scheduleAutofill() {
    clearTimeout(debounceT);
    debounceT = setTimeout(() => void runAutofill(), 400);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scheduleAutofill(), { once: true });
  } else {
    scheduleAutofill();
  }

  const obs = new MutationObserver(() => {
    scheduleAutofill();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
