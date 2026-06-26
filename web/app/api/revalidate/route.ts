import { revalidateTag } from "next/cache";

// Token-gated cache purge. The Python build scripts ping this when they finish, so
// the web's cached reads refresh exactly when the precomputed data changes (rather
// than on a guessed timer). If RECOMPUTE_TOKEN isn't set, the check is skipped
// (convenient for local dev).
//   GET|POST /api/revalidate?token=...&tag=metrics&tag=schedule
//   (no tag => purge everything)

export const dynamic = "force-dynamic";

const ALL = ["registry", "catalog", "metrics", "lategame", "schedule"] as const;

function handle(req: Request): Response {
  const url = new URL(req.url);
  const expected = process.env.RECOMPUTE_TOKEN;
  if (expected && url.searchParams.get("token") !== expected) {
    return new Response("forbidden", { status: 403 });
  }
  const asked = url.searchParams.getAll("tag");
  const tags = asked.length ? asked.filter((t) => (ALL as readonly string[]).includes(t)) : [...ALL];
  // expire:0 = immediate (the build just changed the data; next view should be fresh,
  // not stale-while-revalidate). This is the recommended form for webhook callers.
  for (const t of tags) revalidateTag(t, { expire: 0 });
  return Response.json({ revalidated: tags });
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}
