import {
  getSeasons,
  getSituations,
  getTeams,
  getNextOpponents,
  getMatchupMetrics,
  getMatchupDistributions,
  getTeamCoaches,
} from "@/lib/queries";
import { pick, coachLine } from "@/lib/format";
import { PAIRED_FAMILIES, familyLabel } from "@/lib/matchup";
import MatchupControls from "./MatchupControls";
import MatchupComparison from "./MatchupComparison";
import FamilyChips from "./FamilyChips";
import SwitchPossession from "./SwitchPossession";

type SP = { [k: string]: string | string[] | undefined };

// The matchup workspace: the Team-A-vs-Team-B picker + (when both teams are set)
// the side-by-side comparison. Reused on /, /upcoming, /live so tapping a game
// expands the comparison IN PLACE rather than navigating away. The client controls
// (MatchupControls, SwitchPossession) navigate relative to whatever page renders
// this and preserve other params (e.g. ?week), so you stay where you are.
export default async function MatchupPanel({
  league,
  sp,
  emptyHint,
}: {
  league: string;
  sp: SP;
  emptyHint?: React.ReactNode;
}) {
  const q = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const [seasons, situations, opponents] = await Promise.all([
    getSeasons(league),
    getSituations(league),
    getNextOpponents(league),
  ]);
  if (seasons.length === 0) return <Empty msg="No metrics computed yet — run build_metrics.py." />;

  const season = Number(pick(q("season"), seasons.map(String), String(seasons[0])));
  const situation = pick(
    q("situation"),
    situations.map((s) => s.situation_key),
    situations.some((s) => s.situation_key === "game") ? "game" : situations[0].situation_key,
  );

  const teams = await getTeams(league, season);
  const a = (q("a") ?? "").trim();
  const b = (q("b") ?? "").trim();
  const ball = q("ball") === "b" ? "b" : "a";
  const offenseTeam = ball === "b" ? b : a;
  const defenseTeam = ball === "b" ? a : b;

  const rows = a && b ? await getMatchupMetrics(league, season, a, b, situation) : [];
  const present = new Set(rows.map((r) => r.team));
  const missing = a && b ? [a, b].filter((t) => !present.has(t)) : [];
  const metricIds = PAIRED_FAMILIES.flatMap((f) => [`${f}_off`, `${f}_def`]);
  const dists = a && b ? await getMatchupDistributions(league, season, situation, metricIds) : [];
  const coaches = a && b ? await getTeamCoaches(league, season, [a, b]) : {};
  const ctx = { a, b, season: String(season), situation, ball };

  return (
    <div className="space-y-4">
      <MatchupControls
        seasons={seasons.map((s) => ({ value: String(s), label: String(s) }))}
        situations={situations.map((s) => ({ value: s.situation_key, label: s.display_name }))}
        teams={teams}
        opponents={opponents}
        current={{ season: String(season), situation, a, b, ball }}
      />

      {a && b ? (
        <section className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold text-slate-100">{a}</div>
              {coachLine(coaches[a]) && (
                <div className="truncate text-[13px] text-slate-300">{coachLine(coaches[a])}</div>
              )}
            </div>
            <span className="shrink-0 pt-1 text-sm text-slate-500">vs</span>
            <div className="min-w-0 flex-1 text-right">
              <div className="truncate text-base font-semibold text-slate-100">{b}</div>
              {coachLine(coaches[b]) && (
                <div className="truncate text-[13px] text-slate-300">{coachLine(coaches[b])}</div>
              )}
            </div>
          </div>

          <details open>
            <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-slate-200">
              Choose metrics
            </summary>
            <div className="mt-2">
              <FamilyChips families={PAIRED_FAMILIES.map((f) => ({ family: f, label: familyLabel(f) }))} />
            </div>
          </details>

          {rows.length ? (
            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/30 p-3">
              {missing.length > 0 && (
                <div className="rounded-md border border-amber-700/40 bg-amber-950/30 px-2.5 py-1.5 text-xs text-amber-300/90">
                  No data for {missing.join(" & ")} — outside our FBS dataset for {season} (FCS, or not yet scraped).
                </div>
              )}
              <div className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0 truncate">
                  <span className="font-semibold text-slate-100">{offenseTeam}</span>{" "}
                  <span className="text-emerald-400/80">offense</span>
                </div>
                <SwitchPossession current={ctx} />
                <div className="min-w-0 truncate text-right">
                  <span className="font-semibold text-slate-100">{defenseTeam}</span>{" "}
                  <span className="text-rose-400/80">defense</span>
                </div>
              </div>
              <MatchupComparison offenseTeam={offenseTeam} defenseTeam={defenseTeam} rows={rows} dists={dists} />
            </div>
          ) : (
            <Empty
              msg={`No data for ${a} or ${b} — both look to be outside our FBS dataset for ${season} (FCS, or not yet scraped).`}
            />
          )}
        </section>
      ) : (
        emptyHint ?? null
      )}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-slate-800 px-4 py-10 text-center text-sm text-slate-400">{msg}</div>
  );
}
