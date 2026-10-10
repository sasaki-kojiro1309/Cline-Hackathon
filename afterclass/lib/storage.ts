import "server-only";
import { z } from "zod/v4";
import * as local from "./local-store";
import { adminClient, storageMode } from "./supabase";
import { ApiError } from "./errors";
import { analysisSchema, feedbackRecordSchema, reflectionRecordSchema, profileSchema, type Analysis, type FeedbackStatus, type Profile } from "./schemas";

const dbReflection = z.object({ id: z.uuid(), session_id: z.uuid(), reflection_text: z.string(), analysis: analysisSchema, created_at: z.string() });
const dbFeedback = z.object({ session_id: z.uuid(), opportunity_id: z.string(), status: z.enum(["saved", "not_interested", "completed"]), updated_at: z.string() });
export function retentionDays() {
  const days = Number(process.env.DATA_RETENTION_DAYS || 0);
  if (!Number.isInteger(days) || days < 0 || days > 3650) throw new ApiError(503, "INVALID_RETENTION", "DATA_RETENTION_DAYS must be 0 (keep until deletion) or between 1 and 3650.");
  return days;
}
function check(error: { code?: string } | null) {
  if (error) { console.error("AfterClass database operation failed", { code: error.code }); throw new ApiError(503, "DATABASE_UNAVAILABLE", "Your data could not be read or saved. Please retry later."); }
}
async function prune(ownerId: string) {
  if (retentionDays() === 0) return;
  const cutoff = new Date(Date.now() - retentionDays() * 86400000).toISOString();
  const db = adminClient();
  const { error } = await db.from("reflections").delete().eq("session_id", ownerId).lt("created_at", cutoff); check(error);
  const feedback = await db.from("opportunity_feedback").delete().eq("session_id", ownerId).lt("updated_at", cutoff); check(feedback.error);
}
export async function listReflections(ownerId: string, all = false) {
  if (storageMode() === "local") return local.listReflections(ownerId, all);
  await prune(ownerId);
  const db = adminClient();
  const records = [];
  // Pagination allows full data exports, while discovery work remains bounded.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("reflections").select("id,session_id,reflection_text,analysis,created_at")
      .eq("session_id", ownerId).order("created_at", { ascending: false }).order("id", { ascending: true }).range(offset, offset + (all ? 499 : 199));
    check(error);
    const page = z.array(dbReflection).parse(data);
    records.push(...page.map((r) => reflectionRecordSchema.parse({ id: r.id, sessionId: r.session_id, text: r.reflection_text, analysis: r.analysis, createdAt: new Date(r.created_at).toISOString() })));
    if (!all || page.length < 500) break;
  }
  return records;
}
export async function insertReflection(ownerId: string, text: string, analysis: Analysis) {
  if (storageMode() === "local") return local.insertReflection(ownerId, text, analysis);
  const { data, error } = await adminClient().from("reflections").insert({ session_id: ownerId, reflection_text: text, analysis }).select("id,session_id,reflection_text,analysis,created_at").single();
  check(error); const row = dbReflection.parse(data);
  return reflectionRecordSchema.parse({ id: row.id, sessionId: row.session_id, text: row.reflection_text, analysis: row.analysis, createdAt: new Date(row.created_at).toISOString() });
}
export async function listFeedback(ownerId: string) {
  if (storageMode() === "local") return local.listFeedback(ownerId);
  const { data, error } = await adminClient().from("opportunity_feedback").select("session_id,opportunity_id,status,updated_at").eq("session_id", ownerId);
  check(error);
  return z.array(dbFeedback).parse(data).map((r) => feedbackRecordSchema.parse({ sessionId: r.session_id, opportunityId: r.opportunity_id, status: r.status, updatedAt: new Date(r.updated_at).toISOString() }));
}
export async function upsertFeedback(ownerId: string, opportunityId: string, status: FeedbackStatus) {
  if (storageMode() === "local") return local.upsertFeedback(ownerId, opportunityId, status);
  const { error } = await adminClient().from("opportunity_feedback").upsert({ session_id: ownerId, opportunity_id: opportunityId, status, updated_at: new Date().toISOString() }, { onConflict: "session_id,opportunity_id" });
  check(error); return { opportunityId, status };
}
export async function getProfile(ownerId: string): Promise<Profile> {
  if (storageMode() === "local") return local.getProfile(ownerId);
  const { data, error } = await adminClient().from("student_profiles").select("display_name,consent_at").eq("owner_id", ownerId).maybeSingle(); check(error);
  const parsed = z.object({ display_name: z.string(), consent_at: z.string().nullable() }).nullable().parse(data);
  return profileSchema.parse({ displayName: parsed?.display_name ?? "", consentAt: parsed?.consent_at ?? null });
}
export async function saveProfile(ownerId: string, profile: Profile) {
  if (storageMode() === "local") return local.saveProfile(ownerId, profile);
  const { error } = await adminClient().from("student_profiles").upsert({ owner_id: ownerId, display_name: profile.displayName, consent_at: profile.consentAt, updated_at: new Date().toISOString() }); check(error);
  return profile;
}
export async function deleteStudentData(ownerId: string) {
  if (storageMode() === "local") return local.deleteStudentData(ownerId);
  const { error } = await adminClient().rpc("delete_student_data", { p_owner: ownerId }); check(error);
}
export async function claimAnonymousData(anonymousId: string, userId: string) {
  if (anonymousId === userId) return;
  const { error } = await adminClient().rpc("claim_anonymous_data", { p_anonymous: anonymousId, p_user: userId }); check(error);
}