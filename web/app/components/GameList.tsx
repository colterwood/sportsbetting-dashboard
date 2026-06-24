import Link from "next/link";
import type { SlateGame } from "@/lib/queries";

// Grid of game cards (Live / Upcoming). Tapping a game opens the matchup
// comparison IN PLACE on the same page (`basePath`, with ?a&b — and ?week kept on
// Upcoming). Games where a team is outside the dataset (e.g. FCS, no metrics for
// the comparison season) are dimmed + labelled "no data".
export default function GameList({
  games,
  metricsSeason,
  teamsWithData = [],
  basePath = "/",
  week,
}: {
  games: SlateGame[];
  metricsSeason: number;
  teamsWithData?: string[];
  basePath?: string;
  week?: number | null;
}) {
  if (!games.length) return null;
  const has = new Set(teamsWithData);
  const weekParam = week != null ? `&week=${week}` : "";
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
      {games.map((g) => {
        const noData = !has.has(g.away_team) || !has.has(g.home_team);
        return (
          <Link
            key={g.game_id}
            href={`${basePath}?a=${encodeURIComponent(g.away_team)}&b=${encodeURIComponent(g.home_team)}&season=${metricsSeason}&situation=game${weekParam}`}
            title={noData ? "One team is outside our FBS dataset" : undefined}
            className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs hover:border-sky-600/50 hover:bg-slate-800/50 ${
              noData ? "border-slate-800/60 bg-slate-900/20 opacity-50" : "border-slate-800 bg-slate-900/40"
            }`}
          >
            <span className="truncate text-slate-300">
              {g.away_team} <span className="text-slate-600">@</span> {g.home_team}
            </span>
            <span className="shrink-0 text-[10px] text-slate-500">
              {noData ? "no data" : fmtDate(g.start_time)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
