/* Service worker: the only place that talks to the API. Shop pages are https and the demo API is
 * http://localhost, so a fetch from the content script would hit mixed-content / private-network
 * blocks; the extension's own origin with host_permissions does not. */
"use strict";

const DEFAULT_API_BASE = "http://localhost:8000";
const TIMEOUT_MS = 6000;

async function apiBase() {
  try {
    const { apiBase } = await chrome.storage.sync.get({ apiBase: DEFAULT_API_BASE });
    return (apiBase || DEFAULT_API_BASE).replace(/\/+$/, "");
  } catch (_) {
    return DEFAULT_API_BASE;
  }
}

async function fetchVerdict(title, price, msg = {}) {
  const base = await apiBase();
  const url = new URL(base + "/api/v2/assessment");
  url.searchParams.set("title", String(title).slice(0, 500));
  if (typeof price === "number" && Number.isFinite(price) && price > 0) url.searchParams.set("price", String(price));
  if (msg.ambiguous) url.searchParams.set("ambiguous", "true");
  if (msg.title_source) url.searchParams.set("title_source", String(msg.title_source).slice(0, 40));
  if (msg.price_source) url.searchParams.set("price_source", String(msg.price_source).slice(0, 40));
  if (msg.variant_title) url.searchParams.set("variant_title", String(msg.variant_title).slice(0,500));
  if (msg.variant_label) url.searchParams.set("variant_label", String(msg.variant_label).slice(0,200));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.href, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true, apiBase: base, data: await res.json() };
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return false;
  if (msg.type === "verdict") {
    fetchVerdict(msg.title, msg.price, msg)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
    return true; // async sendResponse
  }
  if (msg.type === "open") {
    let url = null;
    try { url = new URL(msg.url); } catch (_) { /* invalid */ }
    if (url && (url.protocol === "http:" || url.protocol === "https:")) {
      chrome.tabs.create({ url: url.href }).then(() => sendResponse({ ok: true }), (e) => sendResponse({ ok: false, error: String(e) }));
      return true;
    }
    sendResponse({ ok: false, error: "bad url" });
  }
  return false;
});
