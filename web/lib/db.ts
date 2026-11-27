import "server-only";
import postgres from "postgres";

// Direct Supabase Postgres connection from server components. The dashboard is
// private + server-rendered, so reading Postgres directly (instead of supabase-js
// + anon key + RLS) is simpler and keeps the credential server-side. The web app
// only ever READS the pre-calculated tables.

const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error("SUPABASE_DB_URL not set (copy web/.env.example to web/.env.local)");

declare global {
  var _sql: ReturnType<typeof postgres> | undefined;
}

export const sql =
  globalThis._sql ??
  postgres(url, {
    ssl: "require",
    prepare: false, // required for the Supabase transaction pooler (port 6543)
    // NOTE: `fetch_types` must stay ON (default). With fetch_types:false, postgres.js
    // can't serialize array params — `any(${[...]})` reaches Postgres as a bare
    // comma-joined string and every matchup query dies with "malformed array literal"
    // (22P02). The type fetch costs one round trip per new connection; that's fine.
    connect_timeout: 10, // seconds — surface a dead route quickly, don't hang ~30s
    max: 3, // a few conns cover each request's Promise.all fan-out; pooler-friendly
    idle_timeout: 20,
  });

// Reuse one pool across invocations/hot-reloads (a fresh pool per request is the
// classic serverless connection-exhaustion bug). Safe in prod too: a warm Lambda
// keeps the module — and this pool — alive between requests.
globalThis._sql = sql;
