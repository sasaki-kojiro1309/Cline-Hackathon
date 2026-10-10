"use client";
import { useEffect, useState } from "react";
import { z } from "zod/v4";
import { requestJson, errorMessage } from "@/lib/client-api";
import { accountResponseSchema, accountInputSchema } from "@/lib/account-schemas";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [checkingError, setCheckingError] = useState("");
  const [registering, setRegistering] = useState(false);
  const [loginId, setLoginId] = useState(""); const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState(""); const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void requestJson("/api/account", accountResponseSchema).then((data) => { if (active) setAuthenticated(data.authenticated); })
      .catch((error: unknown) => { if (active) setCheckingError(errorMessage(error)); });
    const expire = () => window.location.reload();
    window.addEventListener("afterclass:unauthorized", expire);
    return () => { active = false; window.removeEventListener("afterclass:unauthorized", expire); };
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setError("");
    if (registering && password !== confirmation) { setError("Passwords do not match."); return; }
    const parsed = accountInputSchema.safeParse(registering ? { action: "register", loginId, password, displayName } : { action: "login", loginId, password });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true);
    try { await requestJson("/api/account", z.object({ success: z.literal(true) }), parsed.data); window.location.reload(); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  if (authenticated) return children;
  if (checkingError) return <section className="panel"><p className="error" role="alert">{checkingError}</p><button onClick={() => window.location.reload()}>Retry</button></section>;
  if (authenticated === null) return <p role="status">Checking your account…</p>;
  return <section className="panel login-panel"><p className="eyebrow">Your long-term learning companion</p>
    <h1>{registering ? "Create your account" : "Welcome back"}</h1>
    <p className="intro">Log in to keep your discoveries and next steps together over time. Each student has a private account. There is no guest mode.</p>
    <div className="actions mb-6"><button type="button" className={registering ? "secondary" : ""} aria-pressed={!registering} onClick={() => { setRegistering(false); setError(""); setPassword(""); }}>Log in</button>
      <button type="button" className={registering ? "" : "secondary"} aria-pressed={registering} onClick={() => { setRegistering(true); setError(""); setPassword(""); setConfirmation(""); }}>Create account</button></div>
    <form onSubmit={submit}>
      <label htmlFor="login-id">Login ID</label><input id="login-id" autoComplete="username" required minLength={3} maxLength={32} value={loginId} onChange={(event) => setLoginId(event.target.value)} disabled={busy} aria-describedby="login-help" />
      <p id="login-help" className="small">3–32 letters, numbers, underscores or hyphens. Login IDs are case-insensitive.</p>
      {registering && <><label htmlFor="new-display-name">Display name (optional)</label><input id="new-display-name" value={displayName} maxLength={60} onChange={(event) => setDisplayName(event.target.value)} disabled={busy} /></>}
      <label htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete={registering ? "new-password" : "current-password"} minLength={registering ? 12 : 1} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} />
      {registering && <><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} /><p className="small">Use at least 12 characters. Remember your Login ID and password: password recovery is not available in this local prototype.</p></>}
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "Please wait…" : registering ? "Create my account" : "Log in to AfterClass"}</button>
    </form><p className="small mt-5">Accounts and history are stored in this server&apos;s local SQLite database. Keep a backup; this is not a cloud sync service.</p>
  </section>;
}