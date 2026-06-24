import "server-only";
import postgres from "postgres";

// Direct Supabase Postgres connection from server components. The dashboard is
// private + server-rendered, so reading Postgres directly (instead of supabase-js
// + anon key + RLS) is simpler and keeps the credential server-side. The web app
// only ever READS the pre-calculated tables.

const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error("SUPABASE_DB_URL not set (copy web/.env.example to web/.env.local)");

declare global {
  // eslint-disable-next-line no-var
  var _sql: ReturnType<typeof postgres> | undefined;
}

export const sql =
  globalThis._sql ??
  postgres(url, {
    ssl: "require",
    prepare: false, // safe with the Supabase pooler (session or transaction mode)
    max: 5,
    idle_timeout: 20,
  });

if (process.env.NODE_ENV !== "production") globalThis._sql = sql;
