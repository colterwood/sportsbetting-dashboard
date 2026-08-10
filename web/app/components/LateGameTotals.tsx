import {
  getLateGameSeasons,
  getLateGameTeams,
  getLateGameAnchors,
  getTeamSituation,
  type AnchorPick,
} from "@/lib/queries";
import {
  summarize, verdictAt, hitRate, toFloat, fmtPct, snapWindow, snapBand, teamRates,
  blendOutcomes, type Dist,
} from "@/lib/lategame";
import { formatValue } from "@/lib/format";
import MiniDistribution from "./MiniDistribution";
import TeamPanel from "./TeamPanel";
import TotalsControls, { type TotalsState } from "./TotalsControls";

type SP = { [k: string]: string | string[] | undefined };

const DIFF_HALF_WIDTH = 1; // bucket the entered margin as [by-1, by+1] (3-wide)
const clampi = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// The NCAAB late-game totals OUTLIER tool: manual game state + a line -> where the
// line falls in the conditional "points-from-here" distribution. VISUAL HIERARCHY
// (the user's explicit spec): the TOP cards carry the TEAM-ADJUSTED numbers — the
// edge comes from the teams — with the single authoritative verdict; the team
// profiles explain them; the raw league-wide reference sits below WITHOUT verdict
// badges so the page never argues with itself. Embedded in the NCAAB Live /
// Upcoming views; reads its state from the page's search params.
export default async function LateGameTotals({ sp }: { sp: SP }) {
  const q = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };

  const seasons = await getLateGameSeasons();
  if (seasons.length === 0) {
    return <Empty msg="No late-game data yet — run build_lategame.py." />;
  }
  const season = seasons.includes(Number(q("season"))) ? Number(q("season")) : seasons[0];

  const half = q("half") === "1" ? 1 : 2;
  const m = clampi(parseInt(q("m") || "4", 10) || 0, 0, 20);
  const s = clampi(parseInt(q("s") || "0", 10) || 0, 0, 59);
  const by = clampi(parseInt(q("by") || "3", 10) || 1, 1, 40);
  const ld = q("ld") === "b" ? "b" : "a";
  const a = q("a").trim();
  const b = q("b").trim();

  const st: TotalsState = {
    season: String(season), a, b, half: String(half), m: String(m), s: String(s),
    ld, by: String(by), gt: q("gt"), lt: q("lt"), tt: q("tt"),
  };

  const secsLeft = clampi((half === 1 ? 1200 : 0) + m * 60 + s, 0, 2400);
  const diffLo = Math.max(1, by - DIFF_HALF_WIDTH);
  const diffHi = by + DIFF_HALF_WIDTH;
  const leader = ld === "b" ? b : a;
  const trailer = ld === "b" ? a : b;

  // team list (for the picker) + comparable spots + team situational profiles, all
  // in parallel, not back-to-back (getTeamSituation returns [] without a query
  // when no matchup is set)
  const [teams, rows, situationRows] = await Promise.all([
    getLateGameTeams(season),
    getLateGameAnchors(season, half, secsLeft, diffLo, diffHi),
    getTeamSituation(a && b ? [a, b] : []),
  ]);
  const totalVals = rows.map((r) => r.total_pts_after);
  const leadVals = rows.flatMap((r) => (r.lead_pts_after != null ? [r.lead_pts_after] : []));
  const trailVals = rows.flatMap((r) => (r.trail_pts_after != null ? [r.trail_pts_after] : []));
  const totalDist = summarize(totalVals);
  const leadDist = summarize(leadVals);
  const trailDist = summarize(trailVals);

  // Team-conditioned layer: rates for each side in the snapped situation family,
  // blended into the league means (hard 80/20). When neither team has history the
  // blend is null and the top cards fall back to pure league-wide.
  const windowKey = snapWindow(half, m * 60 + s);
  const band = snapBand(by);
  const leaderRates = a && b ? teamRates(situationRows, leader, "lead", windowKey, band) : null;
  const trailerRates = a && b ? teamRates(situationRows, trailer, "trail", windowKey, band) : null;
  const blend =
    leaderRates || trailerRates
      ? blendOutcomes({
          minutesLeft: (m * 60 + s) / 60,
          league: {
            total: totalDist?.mean ?? 0,
            lead: leadDist?.mean ?? 0,
            trail: trailDist?.mean ?? 0,
          },
          leader: leaderRates,
          trailer: trailerRates,
        })
      : null;
  const adjusted = blend != null && blend.teamShare > 0;

  // The cards' empirical rows are TEAM-scoped when adjusted (the user's rule: the
  // edge comes from the teams): each team's own outcomes among the comparable
  // spots, and for the game total any spot involving either team. League-wide
  // versions live in the reference section below.
  const involved = (r: AnchorPick) =>
    r.leading_team === leader || r.trailing_team === leader ||
    r.leading_team === trailer || r.trailing_team === trailer;
  const leaderSpots = adjusted
    ? rows.filter((r) => r.leading_team === leader)
        .flatMap((r) => (r.lead_pts_after != null ? [r.lead_pts_after] : []))
    : null;
  const trailerSpots = adjusted
    ? rows.filter((r) => r.trailing_team === trailer)
        .flatMap((r) => (r.trail_pts_after != null ? [r.trail_pts_after] : []))
    : null;
  const matchupSpots = adjusted ? rows.filter(involved).map((r) => r.total_pts_after) : null;

  const stateLine =
    `${half === 1 ? "1st" : "2nd"} half · ${m}:${String(s).padStart(2, "0")} left · ` +
    `${leader || "leader"} leading by ~${by}`;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-100">
          Late-Game Totals <span className="font-normal text-slate-500">· points from here to end of half</span>
        </h2>
        <p className="mt-0.5 text-[13px] text-slate-400">
          Enter the game state and a line — we show where your number falls in the comparable history.
          The <span className="text-emerald-300">edge is the tail</span>.
        </p>
      </div>

      <TotalsControls key={`${a}|${b}|${season}`} seasons={seasons} teams={teams} current={st} />

      <div className="rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-2 text-sm text-slate-300">
        {stateLine}
        <span className="ml-2 text-xs text-slate-500">
          ({rows.length} comparable spots · margin {diffLo}–{diffHi})
        </span>
        <span className="ml-2 text-xs text-sky-300/80">
          {adjusted ? "adjusted to these teams · 80% team, 20% league" : a && b ? "league-wide (no team history here)" : ""}
        </span>
      </div>

      {rows.length === 0 ? (
        <Empty msg="No comparable historical spots for this exact state — widen the time or margin." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <OutcomeCard title="Game total" caption="Both teams · rest of half" dist={totalDist} values={totalVals}
            lineStr={st.gt} adjMean={adjusted ? blend!.total : null} scope="Matchup" teamVals={matchupSpots} />
          <OutcomeCard title={`${leader || "Leader"} total`} caption="Leading team · rest of half" dist={leadDist}
            values={leadVals} lineStr={st.lt} adjMean={adjusted ? blend!.lead : null} scope="Team" teamVals={leaderSpots} />
          <OutcomeCard title={`${trailer || "Trailer"} total`} caption="Trailing team · rest of half" dist={trailDist}
            values={trailVals} lineStr={st.tt} adjMean={adjusted ? blend!.trail : null} scope="Team" teamVals={trailerSpots} />
        </div>
      )}

      {a && b && (
        <TeamPanel
          a={a} b={b} leader={leader} trailer={trailer}
          windowKey={windowKey} band={band}
          leaderRates={leaderRates} trailerRates={trailerRates}
          notes={blend?.notes ?? []}
        />
      )}

      {/* raw league-wide reference — deliberately NO verdict badges here: the one
          verdict lives on the team-adjusted cards above */}
      {adjusted && rows.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            League-wide reference · {rows.length} comparable games, any teams
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <LeagueCard title="Game total" dist={totalDist} values={totalVals} lineStr={st.gt} />
            <LeagueCard title="Leader total" dist={leadDist} values={leadVals} lineStr={st.lt} />
            <LeagueCard title="Trailer total" dist={trailDist} values={trailVals} lineStr={st.tt} />
          </div>
        </section>
      )}

      {rows.length > 0 && <Comparables rows={rows} leader={leader} trailer={trailer} />}
    </div>
  );
}

// The primary outcome card. With `adjMean` (team-adjusted expectation) the verdict,
// model odds, and dashed center line all use the ADJUSTED mean — the league sample
// only contributes the distribution's shape/spread — and the empirical rows come
// from `teamVals`: this team's (or either team's, scope "Matchup") own outcomes
// among the comparable spots, n shown. Without adjMean (no matchup or no team
// history) it behaves as the plain league-wide card.
function OutcomeCard({ title, caption, dist, values, lineStr, adjMean, scope, teamVals }: {
  title: string; caption: string; dist: Dist | null; values: number[]; lineStr: string;
  adjMean: number | null; scope: "Team" | "Matchup"; teamVals: number[] | null;
}) {
  if (!dist) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
        <div className="text-sm font-semibold text-slate-200">{title}</div>
        <div className="mt-6 text-center text-xs text-slate-500">no sample</div>
      </div>
    );
  }
  const line = toFloat(lineStr);
  const mean = adjMean ?? dist.mean;
  const v = line != null ? verdictAt(line, mean, dist, values) : null;
  const hr = line != null ? hitRate(values, line) : null;
  const markerColor = !v ? "#94a3b8" : v.strength === "strong" ? "#34d399" : v.strength === "lean" ? "#fbbf24" : "#94a3b8";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-200">{title}</div>
          <div className="truncate text-[11px] text-slate-500">{caption}</div>
        </div>
        {v && <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${v.cls}`}>{v.label}</span>}
      </div>

      <div className="mt-2">
        <MiniDistribution
          histogram={dist.histogram} mean={mean} median={dist.p50}
          valMin={dist.min} valMax={dist.max}
          value={line ?? mean} unit="pts" color={markerColor}
          caption={line != null ? `O/U ${line}` : adjMean != null ? `adjusted ${formatValue("pts", mean)}` : `median ${formatValue("pts", dist.p50)}`}
        />
      </div>

      <dl className="mt-2 space-y-1 text-xs">
        {adjMean != null && <Row k="These teams (expected)" val={`${formatValue("pts", adjMean)} pts`} accent />}
        {v != null && (
          <Row k="Model" val={`${fmtPct(v.overProb * 100)} over · ${fmtPct((1 - v.overProb) * 100)} under`} accent={adjMean == null} />
        )}
        {adjMean != null && teamVals != null ? (
          <TeamRows scope={scope} vals={teamVals} line={line} />
        ) : (
          <>
            <Row k="Typical (median)" val={`${formatValue("pts", dist.p50)} pts`} />
            <Row k="Mean ± SD" val={`${formatValue("pts", dist.mean)} ± ${formatValue("pts", dist.sd)}`} />
            {hr != null && <Row k="Hit rate" val={`${hr.over}/${hr.n} over (${fmtPct((hr.over / hr.n) * 100)})`} />}
          </>
        )}
      </dl>
    </div>
  );
}

// Compact league-wide reference card: shape + stats only, deliberately no verdict.
function LeagueCard({ title, dist, values, lineStr }: {
  title: string; dist: Dist | null; values: number[]; lineStr: string;
}) {
  if (!dist) return null;
  const line = toFloat(lineStr);
  const hr = line != null ? hitRate(values, line) : null;
  return (
    <div className="rounded-xl border border-slate-800/70 bg-slate-900/20 p-3">
      <div className="truncate text-xs font-medium text-slate-400">{title}</div>
      <div className="mt-2">
        <MiniDistribution
          histogram={dist.histogram} mean={dist.mean} median={dist.p50}
          valMin={dist.min} valMax={dist.max}
          value={line ?? dist.p50} unit="pts" color="#64748b"
          caption={line != null ? `O/U ${line}` : `median ${formatValue("pts", dist.p50)}`}
        />
      </div>
      <dl className="mt-2 space-y-1 text-[11px]">
        <Row k="Median" val={`${formatValue("pts", dist.p50)} pts`} />
        <Row k="Mean ± SD" val={`${formatValue("pts", dist.mean)} ± ${formatValue("pts", dist.sd)}`} />
        {hr != null && <Row k="Hit rate" val={`${hr.over}/${hr.n} over (${fmtPct((hr.over / hr.n) * 100)})`} />}
      </dl>
    </div>
  );
}

// Empirical rows from the team's/matchup's OWN comparable spots. These are honest
// team numbers (they change with the matchup) — never league stats relabeled. The
// spot count is always visible so a thin sample can't masquerade as a solid one.
function TeamRows({ scope, vals, line }: { scope: "Team" | "Matchup"; vals: number[]; line: number | null }) {
  if (vals.length === 0) {
    return <Row k={`${scope} spots`} val="none in this state" />;
  }
  const d = summarize(vals)!;
  const hr = line != null ? hitRate(vals, line) : null;
  const spread = vals.length > 1
    ? `${formatValue("pts", d.mean)} ± ${formatValue("pts", d.sd)}`
    : `${formatValue("pts", d.mean)} (1 spot)`;
  return (
    <>
      <Row k={`${scope} median · ${vals.length} spot${vals.length === 1 ? "" : "s"}`} val={`${formatValue("pts", d.p50)} pts`} />
      <Row k={`${scope} mean ± SD`} val={spread} />
      {hr != null && <Row k={`${scope} hit rate`} val={`${hr.over}/${hr.n} over (${fmtPct((hr.over / hr.n) * 100)})`} />}
    </>
  );
}

function Row({ k, val, accent }: { k: string; val: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-slate-500">{k}</dt>
      <dd className={`tabular-nums ${accent ? "font-semibold text-slate-100" : "text-slate-300"}`}>{val}</dd>
    </div>
  );
}

function Comparables({ rows, leader, trailer }: { rows: AnchorPick[]; leader: string; trailer: string }) {
  const sorted = [...rows].sort((x, y) => (y.game_date ?? "").localeCompare(x.game_date ?? ""));
  const shown = sorted.slice(0, 40);
  const hot = (r: AnchorPick) =>
    (leader && (r.leading_team === leader || r.trailing_team === leader)) ||
    (trailer && (r.leading_team === trailer || r.trailing_team === trailer));

  return (
    <details className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
      <summary className="cursor-pointer text-sm font-medium text-slate-300 hover:text-slate-100">
        Comparable games <span className="text-slate-500">({rows.length}{rows.length > 40 ? ", showing 40" : ""})</span>
      </summary>
      <div className="mt-2 grid grid-cols-1 gap-x-8 xl:grid-cols-2">
        {shown.map((r) => (
          <a key={r.game_id} href={`https://www.espn.com/mens-college-basketball/game/_/gameId/${r.game_id}`}
            target="_blank" rel="noreferrer"
            className={`flex items-center justify-between gap-3 border-b border-slate-800/70 py-1.5 text-xs hover:bg-slate-800/40 ${hot(r) ? "text-slate-100" : "text-slate-400"}`}>
            <span className="min-w-0 truncate">
              {r.game_date ?? "—"} · <span className="text-slate-300">{short(r.leading_team)}</span> led {short(r.trailing_team)} by {r.score_diff}
            </span>
            <span className="shrink-0 tabular-nums text-slate-400">
              L+{r.lead_pts_after ?? "—"} · T+{r.trail_pts_after ?? "—"} · tot {r.total_pts_after}
            </span>
          </a>
        ))}
      </div>
    </details>
  );
}

function short(name: string | null): string {
  if (!name) return "—";
  return name.length > 18 ? name.split(" ").slice(0, 2).join(" ") : name;
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-slate-800 px-4 py-10 text-center text-sm text-slate-400">{msg}</div>
  );
}
