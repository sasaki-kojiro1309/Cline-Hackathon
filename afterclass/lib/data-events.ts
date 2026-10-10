"use client";
export function notifyDataChanged() {
  window.dispatchEvent(new Event("afterclass:data-changed"));
  try { localStorage.setItem("afterclass:data-version", `${Date.now()}:${Math.random()}`); } catch { /* Restricted browser storage must not turn a saved check-in into a failure. */ }
}