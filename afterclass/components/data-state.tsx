"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod/v4";
import { ensureSession, errorMessage, requestJson } from "@/lib/client-api";

export function useApiData<T>(url: string, schema: z.ZodType<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    await ensureSession();
    return requestJson(url, schema);
  }, [url, schema]);
  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await load();
      setData(result);
      return true;
    } catch (error) { setError(errorMessage(error)); return false; }
    finally { setLoading(false); }
  }, [load]);
  useEffect(() => {
    let active = true;
    void load().then((result) => {
      if (active) { setData(result); setError(""); setLoading(false); }
    }).catch((error: unknown) => {
      if (active) { setError(errorMessage(error)); setLoading(false); }
    });
    return () => { active = false; };
  }, [load]);
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