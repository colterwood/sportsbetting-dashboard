import { sql } from "@/lib/db";

// Lightweight liveness/warmer endpoint. It lives under /api/* so the password gate
// (middleware) excludes it. Point a free uptime monitor (e.g. UptimeRobot, every
// ~5 min) at /api/health to keep BOTH the serverless function and the Supabase
// connection/instance warm — that's what avoids the ~20s cold start for the first
// real visitor. A bare `select 1` is enough to keep the pool/instance alive.
export const dynamic = "force-dynamic";

export async function GET() {
  const t = Date.now();
  try {
    await sql`select 1`;
    return Response.json({ ok: true, ms: Date.now() - t });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 503 });
  }
}
