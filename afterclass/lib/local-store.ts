import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod/v4";
import { feedbackRecordSchema, reflectionRecordSchema, type Analysis, type FeedbackStatus } from "./schemas";

const storeSchema = z.object({ reflections: z.array(reflectionRecordSchema), feedback: z.array(feedbackRecordSchema) });
type Store = z.infer<typeof storeSchema>;
export function dataDirectory() { return process.env.AFTERCLASS_DATA_DIR || join(process.cwd(), ".afterclass"); }
// Serialize all operations in this one Node process; writes use atomic rename.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation);
  queue = result.catch(() => undefined);
  return result;
}
async function readStore(): Promise<Store> {
  try { return storeSchema.parse(JSON.parse(await readFile(join(dataDirectory(), "store.json"), "utf8"))); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return { reflections: [], feedback: [] };
    throw error; // Corrupt or inaccessible data must not look like a successful empty store.
  }
}
async function writeStore(store: Store) {
  await mkdir(dataDirectory(), { recursive: true, mode: 0o700 });
  const path = join(dataDirectory(), "store.json");
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(store), { mode: 0o600 });
  await rename(temporary, path);
}
export function listReflections(sessionId: string) {
  return serial(async () => (await readStore()).reflections.filter((r) => r.sessionId === sessionId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50));
}
export function listFeedback(sessionId: string) {
  return serial(async () => (await readStore()).feedback.filter((f) => f.sessionId === sessionId));
}
export function insertReflection(sessionId: string, text: string, analysis: Analysis) {
  return serial(async () => {
    const store = await readStore();
    const record = reflectionRecordSchema.parse({ id: randomUUID(), sessionId, text, analysis, createdAt: new Date().toISOString() });
    store.reflections.push(record);
    await writeStore(store);
    return record;
  });
}
export function upsertFeedback(sessionId: string, opportunityId: string, status: FeedbackStatus) {
  return serial(async () => {
    const store = await readStore();
    const record = feedbackRecordSchema.parse({ sessionId, opportunityId, status, updatedAt: new Date().toISOString() });
    const index = store.feedback.findIndex((f) => f.sessionId === sessionId && f.opportunityId === opportunityId);
    if (index < 0) store.feedback.push(record); else store.feedback[index] = record;
    await writeStore(store);
    return { opportunityId, status };
  });
}
export function sessionSecret(): Promise<string> {
  return serial(async () => {
    if (process.env.SESSION_SIGNING_SECRET) {
      if (Buffer.byteLength(process.env.SESSION_SIGNING_SECRET) < 32) throw new Error("Session secret must be at least 32 bytes.");
      return process.env.SESSION_SIGNING_SECRET;
    }
    const path = join(dataDirectory(), "session-secret");
    try { return await readFile(path, "utf8"); }
    catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      await mkdir(dataDirectory(), { recursive: true, mode: 0o700 });
      const secret = randomBytes(32).toString("base64url");
      await writeFile(path, secret, { mode: 0o600, flag: "wx" });
      return secret;
    }
  });
}