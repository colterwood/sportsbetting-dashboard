import {
  getLateGameSeasons,
  getLateGameTeams,
  getLateGameAnchors,
  type AnchorPick,
} from "@/lib/queries";
import { summarize, verdict, hitRate, probOver, toFloat, fmtPct, type Dist } from "@/lib/lategame";
import { formatValue } from "@/lib/format";
import MiniDistribution from "./MiniDistribution";
import TotalsControls, { type TotalsState } from "./TotalsControls";

type SP = { [k: string]: string | string[] | undefined };

const DIFF_HALF_WIDTH = 1; // bucket the entered margin as [by-1, by+1] (3-wide)
const clampi = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// The NCAAB late-game totals OUTLIER tool: manual game state + a line -> where the
// line falls in the conditional "points-from-here" distribution. Embedded in the
// NCAAB Live / Upcoming views; reads its state from the page's search params.
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

  // team list (for the picker) + comparable spots in parallel, not back-to-back
  const [teams, rows] = await Promise.all([
    getLateGameTeams(season),
    getLateGameAnchors(season, half, secsLeft, diffLo, diffHi),
  ]);
  const totalVals = rows.map((r) => r.total_pts_after);
  const leadVals = rows.flatMap((r) => (r.lead_pts_after != null ? [r.lead_pts_after] : []));
  const trailVals = rows.flatMap((r) => (r.trail_pts_after != null ? [r.trail_pts_after] : []));
  const totalDist = summarize(totalVals);
  const leadDist = summarize(leadVals);
  const trailDist = summarize(trailVals);

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
      </div>

      {rows.length === 0 ? (
        <Empty msg="No comparable historical spots for this exact state — widen the time or margin." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <OutcomeCard title="Game total" caption="Both teams · rest of half" dist={totalDist} values={totalVals} lineStr={st.gt} />
          <OutcomeCard title={`${leader || "Leader"} total`} caption="Leading team · rest of half" dist={leadDist} values={leadVals} lineStr={st.lt} />
          <OutcomeCard title={`${trailer || "Trailer"} total`} caption="Trailing team · rest of half" dist={trailDist} values={trailVals} lineStr={st.tt} />
        </div>
      )}

      {rows.length > 0 && <Comparables rows={rows} leader={leader} trailer={trailer} />}
    </div>
  );
}

function OutcomeCard({ title, caption, dist, values, lineStr }: {
  title: string; caption: string; dist: Dist | null; values: number[]; lineStr: string;
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
  const v = line != null ? verdict(line, dist, values) : null;
  const hr = line != null ? hitRate(values, line) : null;
  const over = line != null ? probOver(line, dist) : null;
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
          histogram={dist.histogram} mean={dist.mean} median={dist.p50}
          valMin={dist.min} valMax={dist.max}
          value={line ?? dist.p50} unit="pts" color={markerColor}
          caption={line != null ? `O/U ${line}` : `median ${formatValue("pts", dist.p50)}`}
        />
      </div>

      <dl className="mt-2 space-y-1 text-xs">
        <Row k="Typical (median)" val={`${formatValue("pts", dist.p50)} pts`} />
        <Row k="Mean ± SD" val={`${formatValue("pts", dist.mean)} ± ${formatValue("pts", dist.sd)}`} />
        {over != null && <Row k="Model" val={`${fmtPct(over * 100)} over · ${fmtPct((1 - over) * 100)} under`} accent />}
        {hr != null && <Row k="Hit rate" val={`${hr.over}/${hr.n} over (${fmtPct((hr.over / hr.n) * 100)})`} />}
      </dl>
    </div>
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
      <div className="mt-2 divide-y divide-slate-800/70">
        {shown.map((r) => (
          <a key={r.game_id} href={`https://www.espn.com/mens-college-basketball/game/_/gameId/${r.game_id}`}
            target="_blank" rel="noreferrer"
            className={`flex items-center justify-between gap-3 py-1.5 text-xs hover:bg-slate-800/40 ${hot(r) ? "text-slate-100" : "text-slate-400"}`}>
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
