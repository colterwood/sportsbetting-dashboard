import Link from "next/link";
import type { SlateGame } from "@/lib/queries";

export default function Slate({
  slate,
  metricsSeason,
}: {
  slate: { season: number; week: number | null; games: SlateGame[] };
  metricsSeason: number;
}) {
  if (!slate || slate.games.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-slate-200">
        Upcoming slate{" "}
        <span className="font-normal text-slate-500">
          · {slate.season}
          {slate.week ? ` Week ${slate.week}` : ""} · {slate.games.length} games · form from {metricsSeason}
        </span>
      </h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {slate.games.map((g) => (
          <Link
            key={g.game_id}
            href={`/?a=${encodeURIComponent(g.away_team)}&b=${encodeURIComponent(g.home_team)}&season=${metricsSeason}&situation=game`}
            className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm hover:border-sky-600/50 hover:bg-slate-800/50"
          >
            <span className="truncate">
              <span className="text-slate-400">{g.away_team}</span>
              <span className="text-slate-600"> @ </span>
              <span className="text-slate-100">{g.home_team}</span>
            </span>
            <span className="shrink-0 text-[11px] text-slate-500">{fmtDate(g.start_time)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
