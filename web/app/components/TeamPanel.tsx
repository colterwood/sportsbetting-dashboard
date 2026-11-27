import {
  type TeamRates,
  type WindowKey,
  type MarginBand,
} from "@/lib/lategame";

// The two teams' situational profiles — the EVIDENCE behind the team-adjusted
// numbers on the outcome cards above (which carry the one authoritative verdict;
// this panel explains, it doesn't re-judge). Pure server component — no client JS.

const BAND_TEXT: Record<MarginBand, string> = {
  "1_3": "1–3 point",
  "4_6": "4–6 point",
  "7_12": "7–12 point",
  "13p": "13+ point",
};

const WINDOW_TEXT: Record<WindowKey, string> = {
  h1_0_240: "the final 4:00 of the 1st half",
  h2_240_480: "4:00–8:00 left in the 2nd half",
  h2_120_240: "2:00–4:00 left in the 2nd half",
  h2_0_120: "the final 2:00 of the 2nd half",
};

export default function TeamPanel({
  a,
  b,
  leader,
  trailer,
  windowKey,
  band,
  leaderRates,
  trailerRates,
  notes,
}: {
  a: string;
  b: string;
  leader: string;
  trailer: string;
  windowKey: WindowKey;
  band: MarginBand;
  leaderRates: TeamRates | null;
  trailerRates: TeamRates | null;
  notes: string[];
}) {
  if (!leaderRates && !trailerRates) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3 text-sm text-slate-500">
        No team-specific history for these teams in this situation yet — the cards above show league-wide numbers.
      </div>
    );
  }

  const widened =
    (leaderRates && leaderRates.fallback !== "exact") ||
    (trailerRates && trailerRates.fallback !== "exact");
  const situation =
    `the numbers above are tilted 80% toward these profiles — from games with a ${BAND_TEXT[band]} lead in ${WINDOW_TEXT[windowKey]}` +
    (widened ? " (widened to nearby margins where data is thin)" : "");

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/30 p-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-100">These teams</h3>
        <p className="mt-0.5 text-[13px] text-slate-400">{situation}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ProfileCard team={leader || a} role="leading" rates={leaderRates} />
        <ProfileCard team={trailer || b} role="trailing" rates={trailerRates} />
      </div>

      {notes.length > 0 && (
        <ul className="space-y-0.5 text-[11px] text-slate-500">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProfileCard({ team, role, rates }: { team: string; role: "leading" | "trailing"; rates: TeamRates | null }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
      <div className="text-sm font-semibold text-slate-200">
        {team || "—"} <span className="font-normal text-slate-500">· {role}</span>
      </div>
      {!rates ? (
        <div className="mt-2 text-xs text-slate-500">No history in this situation.</div>
      ) : (
        <>
          <dl className="mt-2 space-y-1 text-xs">
            <StatRow k="Scoring" val={`${rates.ptsForPerMin.toFixed(2)} pts/min`} />
            <StatRow k="Allows" val={`${rates.ptsAgainstPerMin.toFixed(2)} pts/min`} />
            <StatRow k="Pace" val={`${rates.possPerMin.toFixed(2)} poss/min`} />
            <StatRow k="Fouls" val={`${rates.foulsPerMin.toFixed(2)} /min`} />
            <StatRow k="FT%" val={`${(rates.ftPct * 100).toFixed(1)}%`} />
          </dl>
          <div className="mt-2 text-[11px] text-slate-500">
            based on {rates.gamesCur} game{rates.gamesCur === 1 ? "" : "s"}
            {rates.gamesPrev > 0 ? ` and ${rates.gamesPrev} last season` : ""}
          </div>
        </>
      )}
    </div>
  );
}

function StatRow({ k, val }: { k: string; val: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-slate-500">{k}</dt>
      <dd className="tabular-nums text-slate-300">{val}</dd>
    </div>
  );
}
