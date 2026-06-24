import {
  getLeagues,
  getSeasons,
  getMetrics,
  getSituations,
  getDistribution,
  getTeamMetrics,
} from "@/lib/queries";
import { formatValue, pick } from "@/lib/format";
import Controls from "./components/Controls";
import DistributionCurve from "./components/DistributionCurve";
import PercentileTool from "./components/PercentileTool";
import TailTable from "./components/TailTable";

export const dynamic = "force-dynamic";

type SP = Promise<{ [k: string]: string | string[] | undefined }>;

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const leagues = await getLeagues();
  if (leagues.length === 0) {
    return <Empty msg="No active leagues yet — run the analytics pipeline (load_registry + build_metrics)." />;
  }
  const league = pick(q("league"), leagues.map((l) => l.league_id), leagues[0].league_id);

  const [seasons, metrics, situations] = await Promise.all([
    getSeasons(league),
    getMetrics(league),
    getSituations(league),
  ]);
  if (seasons.length === 0 || metrics.length === 0) {
    return <Empty msg="No metrics computed for this league yet — run build_metrics.py." />;
  }

  const season = Number(pick(q("season"), seasons.map(String), String(seasons[0])));
  const metric = pick(q("metric"), metrics.map((m) => m.metric_id), metrics[0].metric_id);
  const situation = pick(
    q("situation"),
    situations.map((s) => s.situation_key),
    situations.some((s) => s.situation_key === "game") ? "game" : situations[0].situation_key,
  );
  const meta = metrics.find((m) => m.metric_id === metric)!;
  const situationName = situations.find((s) => s.situation_key === situation)?.display_name;

  const [dist, teams] = await Promise.all([
    getDistribution(league, season, metric, situation),
    getTeamMetrics(league, season, metric, situation),
  ]);

  return (
    <div className="space-y-5">
      <Controls
        leagues={leagues.map((l) => ({ value: l.league_id, label: l.display_name }))}
        seasons={seasons.map((s) => ({ value: String(s), label: String(s) }))}
        metrics={metrics.map((m) => ({ value: m.metric_id, label: m.display_name }))}
        situations={situations.map((s) => ({ value: s.situation_key, label: s.display_name }))}
        current={{ league, season: String(season), metric, situation }}
      />

      <div>
        <h1 className="text-lg font-semibold text-slate-100">{meta.display_name}</h1>
        <p className="text-sm text-slate-400">
          {situationName} · {season} ·{" "}
          {dist ? (
            <>
              {dist.n_teams} teams · avg {formatValue(meta.unit, dist.mean)} · range{" "}
              {formatValue(meta.unit, dist.val_min)}–{formatValue(meta.unit, dist.val_max)}
            </>
          ) : (
            "no data"
          )}
        </p>
      </div>

      {dist ? (
        <>
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
            <DistributionCurve dist={dist} teams={teams} unit={meta.unit} higherIs={meta.higher_is} />
            <Legend />
          </div>
          <PercentileTool histogram={dist.histogram} unit={meta.unit} />
          <TailTable teams={teams} unit={meta.unit} higherIs={meta.higher_is} league={league} season={season} />
        </>
      ) : (
        <Empty msg="No distribution for this combination." />
      )}
    </div>
  );
}

function Legend() {
  const items = [
    { c: "#34d399", t: "Edge — good extreme" },
    { c: "#fb7185", t: "Fade — bad extreme" },
    { c: "#fbbf24", t: "Neutral outlier" },
    { c: "#64748b", t: "Field" },
  ];
  return (
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[11px] text-slate-400">
      {items.map((i) => (
        <span key={i.t} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: i.c }} />
          {i.t}
        </span>
      ))}
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
