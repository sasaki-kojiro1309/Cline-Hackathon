import { endpoint } from "@/lib/api";
import { buildDiscoveries } from "@/lib/discoveries";
import { listReflections } from "@/lib/local-store";
export const runtime = "nodejs";
export const GET = endpoint(async (_request, sessionId) => buildDiscoveries(await listReflections(sessionId)));