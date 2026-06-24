import {
  getLeagues,
  getSeasons,
  getSituations,
  getTeams,
  getUpcomingSlate,
  getMatchupMetrics,
} from "@/lib/queries";
import { pick } from "@/lib/format";
import { TOP_FAMILIES, PAIRED_FAMILIES, familyLabel } from "@/lib/matchup";
import MatchupControls from "./components/MatchupControls";
import MatchupComparison from "./components/MatchupComparison";
import FamilyChips from "./components/FamilyChips";
import SwitchPossession from "./components/SwitchPossession";
import Slate from "./components/Slate";

export const dynamic = "force-dynamic";

type SP = Promise<{ [k: string]: string | string[] | undefined }>;

export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const leagues = await getLeagues();
  if (leagues.length === 0) return <Empty msg="No active leagues yet — run the analytics pipeline." />;
  const league = leagues[0].league_id;

  const [seasons, situations, slate] = await Promise.all([
    getSeasons(league),
    getSituations(league),
    getUpcomingSlate(league),
  ]);
  if (seasons.length === 0) return <Empty msg="No metrics computed yet — run build_metrics.py." />;

  const season = Number(pick(q("season"), seasons.map(String), String(seasons[0])));
  const situation = pick(
    q("situation"),
    situations.map((s) => s.situation_key),
    situations.some((s) => s.situation_key === "game") ? "game" : situations[0].situation_key,
  );

  const teams = await getTeams(league, season);
  const aRaw = q("a");
  const bRaw = q("b");
  const a = aRaw && teams.includes(aRaw) ? aRaw : "";
  const b = bRaw && teams.includes(bRaw) ? bRaw : "";
  const ball = q("ball") === "b" ? "b" : "a";
  const offenseTeam = ball === "b" ? b : a;
  const defenseTeam = ball === "b" ? a : b;

  const famParam = q("families");
  const selectedExtras = famParam
    ? famParam.split(",").filter((f) => PAIRED_FAMILIES.includes(f) && !TOP_FAMILIES.includes(f))
    : [];
  const selectedFamilies = [...TOP_FAMILIES, ...selectedExtras];

  const rows = a && b ? await getMatchupMetrics(league, season, a, b, situation) : [];
  const ctx = { a, b, season: String(season), situation, ball };

  return (
    <div className="space-y-4">
      <MatchupControls
        seasons={seasons.map((s) => ({ value: String(s), label: String(s) }))}
        situations={situations.map((s) => ({ value: s.situation_key, label: s.display_name }))}
        teams={teams}
        current={{ season: String(season), situation, a, b, ball }}
      />

      {a && b ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-100">
            {a} <span className="font-normal text-slate-500">vs</span> {b}
          </h2>

          <details open>
            <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-slate-200">
              Choose metrics
            </summary>
            <div className="mt-2">
              <FamilyChips
                families={PAIRED_FAMILIES.map((f) => ({
                  family: f,
                  label: familyLabel(f),
                  locked: TOP_FAMILIES.includes(f),
                }))}
                selectedExtras={selectedExtras}
                current={ctx}
              />
            </div>
          </details>

          {rows.length ? (
            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/30 p-3">
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
              <MatchupComparison
                offenseTeam={offenseTeam}
                defenseTeam={defenseTeam}
                rows={rows}
                families={selectedFamilies}
              />
            </div>
          ) : (
            <Empty msg="No data for one of these teams." />
          )}
        </section>
      ) : (
        <p className="text-sm text-slate-400">Pick two teams, or tap a game below.</p>
      )}

      {slate && <Slate slate={slate} metricsSeason={season} collapsed={Boolean(a && b)} />}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-slate-800 px-4 py-10 text-center text-sm text-slate-400">
      {msg}
    </div>
  );
}
