"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod/v4";
import { ensureSession, errorMessage, requestJson } from "@/lib/client-api";

export function useApiData<T>(url: string, schema: z.ZodType<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    await ensureSession();
    return requestJson(url, schema);
  }, [url, schema]);
  const reload = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true); setError("");
    try {
      const result = await load();
      if (version === requestVersion.current) setData(result);
      return true;
    } catch (error) { if (version === requestVersion.current) setError(errorMessage(error)); return false; }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, [load]);
  useEffect(() => {
    let active = true;
    const version = ++requestVersion.current;
    void load().then((result) => {
      if (active && version === requestVersion.current) { setData(result); setError(""); setLoading(false); }
    }).catch((error: unknown) => {
      if (active && version === requestVersion.current) { setError(errorMessage(error)); setLoading(false); }
    });
    return () => { active = false; };
  }, [load]);
  useEffect(() => {
    const update = () => { void reload(); };
    const storage = (event: StorageEvent) => { if (event.key === "afterclass:data-version") update(); };
    const focus = () => { if (document.visibilityState === "visible") update(); };
    window.addEventListener("afterclass:data-changed", update);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", focus);
    return () => { window.removeEventListener("afterclass:data-changed", update); window.removeEventListener("storage", storage); document.removeEventListener("visibilitychange", focus); };
  }, [reload]);
  return { data, error, loading, reload };
}
export function DataState({ error, loading, retry }: { error: string; loading: boolean; retry: () => unknown }) {
  if (error) return <div className="error" role="alert"><p>{error}</p><button onClick={retry}>Retry</button></div>;
  if (loading) return <p role="status" className="muted">Loading your reflections…</p>;
  return null;
}
export function EmptyState() {
  return <div className="panel"><h2>Start with one small reflection</h2><p className="muted">Your discoveries and next steps will appear after your first check-in.</p><Link className="button" href="/">Write a reflection</Link></div>;
}