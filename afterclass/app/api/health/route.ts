import { NextResponse } from "next/server";
import { getCatalogue } from "@/lib/catalogue";
import { storageMode, adminClient } from "@/lib/supabase";
import { withDatabase } from "@/lib/sqlite-db";
export const runtime = "nodejs";
export async function GET() {
  try {
    getCatalogue();
    if (storageMode() === "supabase") {
      if (!process.env.SESSION_SIGNING_SECRET || process.env.SESSION_SIGNING_SECRET.length < 32) throw new Error("Missing signing secret");
      const { error } = await adminClient().from("student_profiles").select("owner_id").limit(0);
      if (error) throw new Error("Database unavailable");
    } else withDatabase((db) => db.prepare("SELECT 1").get());
    return NextResponse.json({ ready: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ ready: false }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}