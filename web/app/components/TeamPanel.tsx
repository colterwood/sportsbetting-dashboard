import type { TeamSituationRow } from "@/lib/queries";
import {
  snapWindow,
  snapBand,
  teamRates,
  blendOutcomes,
  verdictAt,
  toFloat,
  type Dist,
  type TeamRates,
  type WindowKey,
  type MarginBand,
} from "@/lib/lategame";

// Team-conditioned layer under the league-wide outcome cards: how THESE two teams
// have played this exact situation (role x time window x margin band), and the
// league means tilted 80/20 toward their rates. Pure server component — no client JS.

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
  state,
  rows,
  dists,
  values,
  lines,
}: {
  a: string;
  b: string;
  leader: string;
  trailer: string;
  state: { half: 1 | 2; m: number; s: number; by: number };
  rows: TeamSituationRow[];
  dists: { total: Dist | null; lead: Dist | null; trail: Dist | null };
  values: { total: number[]; lead: number[]; trail: number[] };
  lines: { gt: string; lt: string; tt: string };
}) {
  const windowKey = snapWindow(state.half, state.m * 60 + state.s);
  const band = snapBand(state.by);
  const leaderRates = teamRates(rows, leader, "lead", windowKey, band);
  const trailerRates = teamRates(rows, trailer, "trail", windowKey, band);

  if (!leaderRates && !trailerRates) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3 text-sm text-slate-500">
        No team-specific history for these teams in this situation yet — showing league-wide only.
      </div>
    );
  }

  const widened =
    (leaderRates && leaderRates.fallback !== "exact") ||
    (trailerRates && trailerRates.fallback !== "exact");
  const situation =
    `profiles from games with a ${BAND_TEXT[band]} lead in ${WINDOW_TEXT[windowKey]}` +
    (widened ? " (widened to nearby margins where data is thin)" : "");

  const minutesLeft = (state.m * 60 + state.s) / 60;
  const anyDist = dists.total != null || dists.lead != null || dists.trail != null;
  const blend = blendOutcomes({
    minutesLeft,
    league: {
      total: dists.total?.mean ?? 0,
      lead: dists.lead?.mean ?? 0,
      trail: dists.trail?.mean ?? 0,
    },
    leader: leaderRates,
    trailer: trailerRates,
  });

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

      {anyDist && (
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-sm font-semibold text-slate-200">Team-adjusted</div>
          <div className="text-[11px] text-slate-500">
            {blend.teamShare > 0
              ? `${Math.round(blend.teamShare * 100)}% these teams · ${Math.round((1 - blend.teamShare) * 100)}% league`
              : "league-wide only"}
          </div>
        </div>
        <div className="mt-2 space-y-1.5">
          {dists.total && (
            <AdjRow title="Game total" mean={blend.total} dist={dists.total} vals={values.total} lineStr={lines.gt} />
          )}
          {dists.lead && (
            <AdjRow title={`${leader || "Leader"} total`} mean={blend.lead} dist={dists.lead} vals={values.lead} lineStr={lines.lt} />
          )}
          {dists.trail && (
            <AdjRow title={`${trailer || "Trailer"} total`} mean={blend.trail} dist={dists.trail} vals={values.trail} lineStr={lines.tt} />
          )}
        </div>
        {blend.notes.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-[11px] text-slate-500">
            {blend.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </div>
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

function AdjRow({ title, mean, dist, vals, lineStr }: {
  title: string; mean: number; dist: Dist; vals: number[]; lineStr: string;
}) {
  const line = toFloat(lineStr);
  const v = line != null ? verdictAt(line, mean, dist, vals) : null;
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="min-w-0 truncate text-slate-400">{title}</span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="tabular-nums font-semibold text-slate-100">{mean.toFixed(1)} pts</span>
        {v && (
          <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${v.cls}`}>
            {v.label}
          </span>
        )}
      </span>
    </div>
  );
}
