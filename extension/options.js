"use strict";

const DEFAULT_API_BASE = "http://localhost:8000";
const input = document.getElementById("apiBase");
const status = document.getElementById("status");

function say(text, kind) {
  status.textContent = text;
  status.dataset.kind = kind || "";
}

function normalized() {
  const v = input.value.trim().replace(/\/+$/, "");
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? v : null;
  } catch (_) {
    return null;
  }
}

chrome.storage.sync.get({ apiBase: DEFAULT_API_BASE }).then(({ apiBase }) => { input.value = apiBase; });

document.getElementById("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = normalized();
  if (!v) return say("The address must start with http:// or https://", "bad");
  await chrome.storage.sync.set({ apiBase: v });
  input.value = v;
  say("Saved. Refresh the shop page to use the new address.", "ok");
});

document.getElementById("reset").addEventListener("click", async () => {
  input.value = DEFAULT_API_BASE;
  await chrome.storage.sync.set({ apiBase: DEFAULT_API_BASE });
  say("Using " + DEFAULT_API_BASE, "ok");
});

document.getElementById("test").addEventListener("click", async () => {
  const v = normalized();
  if (!v) return say("The address must start with http:// or https://", "bad");
  say("Testing connection…", "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(v + "/api/health", { signal: ctrl.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const h = await res.json();
    say(h.dataset_version ? `Connected. Dataset ${h.dataset_version}, as of ${h.dataset_asof}.` : "Connected, but the v2 dataset is not ready.", h.dataset_version ? "ok" : "bad");
  } catch (err) {
    say("Cannot connect: " + (err && err.message ? err.message : err), "bad");
  } finally {
    clearTimeout(timer);
  }
});
