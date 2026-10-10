import { endpoint } from "@/lib/api";
export const runtime = "nodejs";
export const GET = endpoint(async () => ({ ready: true }));