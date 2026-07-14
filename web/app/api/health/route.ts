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
    // Array-param smoke test: postgres.js array serialization silently breaks under
    // some client options (e.g. fetch_types:false), which kills every matchup query
    // while `select 1` still passes. Exercise the same `any(${[...]})` shape the app
    // uses so the warmer/monitor surfaces that failure class too.
    const arr = await sql<{ n: number }[]>`
      select count(*)::int as n from league where league_id = any(${["ncaaf", "ncaam"]})`;
    return Response.json({ ok: true, ms: Date.now() - t, arrayParams: arr[0].n >= 0 });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 503 });
  }
}
