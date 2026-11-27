// Shown automatically during route navigations (incl. right after login) so the
// user gets immediate "it's working" feedback instead of a blank screen while the
// server render resolves. NOTE: the underlying page render is currently very slow
// on Vercel (serverless<->Supabase connection latency) — this is the visible
// symptom; the real fix is the DB-latency issue (see dashboard-deploy memory).
export default function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-sky-400" />
      Loading…
    </div>
  );
}
