"use client";
import { useState } from "react";
import { z } from "zod/v4";
import { DataState, useApiData } from "./data-state";
import { ensureSession, errorMessage, requestJson } from "@/lib/client-api";
import { profileSchema } from "@/lib/schemas";
import { accountResponseSchema } from "@/lib/account-schemas";

const successSchema = z.object({ success: z.literal(true) });
export function AccountPanel() {
  const [open, setOpen] = useState(false);
  const { data, error, loading, reload } = useApiData("/api/account", accountResponseSchema);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState(""); const [confirmation, setConfirmation] = useState("");
  async function accountAction(body: unknown, notice: string, refresh = false) {
    setBusy(true); setActionError(""); setMessage("");
    try {
      // Signing out must work even when /api/session rejects an expired account.
      const signingOut = typeof body === "object" && body !== null && "action" in body && body.action === "sign_out";
      if (!signingOut) await ensureSession();
      await requestJson("/api/account", successSchema, body);
      setMessage(notice);
      if (refresh) window.location.reload(); else await reload();
      return true;
    } catch (error) { setActionError(errorMessage(error)); return false; }
    finally { setBusy(false); }
  }
  async function exportData() {
    setBusy(true); setActionError("");
    try {
      await ensureSession();
      const result = await requestJson("/api/privacy", z.object({ exportedAt: z.string(), reflections: z.array(z.unknown()), feedback: z.array(z.unknown()), profile: profileSchema, retentionDays: z.number() }));
      const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = "afterclass-my-data.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage("Your data export has been downloaded.");
    } catch (error) { setActionError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function deleteData() {
    setBusy(true); setActionError("");
    try { await ensureSession(); await requestJson("/api/privacy", successSchema, { confirmation }); window.location.reload(); }
    catch (error) { setActionError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <section className="panel account-panel"><button type="button" className="secondary" aria-expanded={open} aria-controls="account-content" onClick={() => setOpen(!open)}>Account & privacy</button>
    <div id="account-content" hidden={!open}>
    <p className="small mt-4">Your account keeps your history between visits. Sign out before another student uses this browser.</p>
    <DataState error={error} loading={loading} retry={reload} />
    {error && <button className="secondary" disabled={busy} onClick={() => void accountAction({ action: "sign_out" }, "Signed out.", true)}>Clear expired sign-in</button>}
    {data && !error && <>
      <p className="small">Storage: local SQLite database. History is {data.retentionDays === 0 ? "kept until you delete it" : `retained for ${data.retentionDays} days`}.</p>
      {data.authenticated ? <>
        <p>Logged in as {data.loginId}. {data.profile.displayName && `Hello, ${data.profile.displayName}.`}</p>
        <form onSubmit={(event) => { event.preventDefault(); void accountAction({ action: "profile", displayName: name }, "Profile saved."); }}>
          <label htmlFor="display-name">Display name (optional)</label><input id="display-name" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder={data.profile.displayName || "What should we call you?"} />
          <div className="actions"><button disabled={busy}>Save profile</button><button type="button" className="secondary" disabled={busy} onClick={() => void accountAction({ action: "sign_out" }, "Signed out.", true)}>Sign out</button></div>
        </form>
      </> : <p>Please log in again.</p>}
      <hr className="my-6" /><h2>Your data, your choice</h2>
      <p className="small">AI reflection processing requires consent. Next Steps uses a local catalogue of exploration ideas, without web search. Export or delete your reflections, analyses, feedback and display name below. Any stored results from the retired web-search feature are also included in exports and deletion. Deleting data keeps your Login ID and password account. Provider copies and backups are not deleted.</p>
      <button className="secondary" disabled={busy} onClick={() => void exportData()}>Export my data</button>
      <form className="mt-5" onSubmit={(event) => { event.preventDefault(); void deleteData(); }}>
        <label htmlFor="delete-confirmation">Type DELETE to permanently remove my AfterClass data</label>
        <input id="delete-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        <div className="actions"><button className="danger" disabled={busy || confirmation !== "DELETE"}>Delete my data</button></div>
      </form>
    </>}
    {actionError && <p role="alert" className="error">{actionError}</p>}
    <p role="status" className="status">{busy ? "Working…" : message}</p>
    </div>
  </section>;
}