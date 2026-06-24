import {
  getLeagues,
  getSeasons,
  getSituations,
  getTeams,
  getUpcomingSlate,
  getMatchupMetrics,
} from "@/lib/queries";
import { pick } from "@/lib/format";
import { PAIRED_FAMILIES, familyLabel } from "@/lib/matchup";
import MatchupControls from "./components/MatchupControls";
import MatchupComparison from "./components/MatchupComparison";
import FamilyChips from "./components/FamilyChips";
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
  const league = leagues[0].league_id; // matchups are single-league for v1 (NCAAF)

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
  const situationName = situations.find((s) => s.situation_key === situation)?.display_name;

  const teams = await getTeams(league, season);
  const aRaw = q("a");
  const bRaw = q("b");
  const a = aRaw && teams.includes(aRaw) ? aRaw : "";
  const b = bRaw && teams.includes(bRaw) ? bRaw : "";

  const famParam = q("families");
  const fromParam = famParam ? famParam.split(",").filter((f) => PAIRED_FAMILIES.includes(f)) : [];
  const selectedFamilies = fromParam.length ? fromParam : PAIRED_FAMILIES;

  const rows = a && b ? await getMatchupMetrics(league, season, a, b, situation) : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Matchups</h1>
        <p className="text-sm text-slate-400">
          Offense-vs-defense edges from {season} form. Pick a game from the slate or build one.
        </p>
      </div>

      <MatchupControls
        seasons={seasons.map((s) => ({ value: String(s), label: String(s) }))}
        situations={situations.map((s) => ({ value: s.situation_key, label: s.display_name }))}
        teams={teams}
        current={{ season: String(season), situation, a, b }}
      />

      {a && b ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-100">
            {a} <span className="font-normal text-slate-500">vs</span> {b}{" "}
            <span className="text-sm font-normal text-slate-400">· {situationName} · {season}</span>
          </h2>
          <FamilyChips
            families={PAIRED_FAMILIES.map((f) => ({ family: f, label: familyLabel(f) }))}
            selected={selectedFamilies}
            current={{ a, b, season: String(season), situation }}
          />
          {rows.length ? (
            <MatchupComparison rows={rows} teamA={a} teamB={b} families={selectedFamilies} />
          ) : (
            <Empty msg="No metric data for one of these teams in this season." />
          )}
        </section>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-700 px-4 py-3 text-sm text-slate-400">
          Pick two teams above, or tap a game in the slate below.
        </p>
      )}

      {slate && <Slate slate={slate} metricsSeason={season} />}
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
