import Link from "next/link";
import type { SlateGame } from "@/lib/queries";

export default function Slate({
  slate,
  metricsSeason,
  collapsed = false,
}: {
  slate: { season: number; week: number | null; games: SlateGame[] };
  metricsSeason: number;
  collapsed?: boolean;
}) {
  if (!slate || slate.games.length === 0) return null;
  const title = `${slate.season}${slate.week ? ` · Week ${slate.week}` : ""} · ${slate.games.length}`;

  const list = (
    <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
      {slate.games.map((g) => (
        <Link
          key={g.game_id}
          href={`/?a=${encodeURIComponent(g.away_team)}&b=${encodeURIComponent(g.home_team)}&season=${metricsSeason}&situation=game`}
          className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-900/40 px-2.5 py-1.5 text-xs hover:border-sky-600/50 hover:bg-slate-800/50"
        >
          <span className="truncate text-slate-300">
            {g.away_team} <span className="text-slate-600">@</span> {g.home_team}
          </span>
          <span className="shrink-0 text-[10px] text-slate-500">{fmtDate(g.start_time)}</span>
        </Link>
      ))}
    </div>
  );

  if (collapsed) {
    return (
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-slate-300 hover:text-slate-100">
          Slate <span className="font-normal text-slate-500">· {title}</span>
        </summary>
        {list}
      </details>
    );
  }
  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-200">
        Slate <span className="font-normal text-slate-500">· {title}</span>
      </h2>
      {list}
    </section>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
