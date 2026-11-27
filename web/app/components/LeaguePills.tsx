"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

// Always-present league switcher (below the header, every page). Sets ?league=
// on the current page; switching leagues drops the other params (week/date/teams
// are league-specific) for a clean start in the new league.

const SHORT: Record<string, string> = { ncaaf: "NCAAF", ncaam: "NCAAB" };

export default function LeaguePills({
  leagues,
  defaultLeague,
}: {
  leagues: { league_id: string; display_name: string }[];
  defaultLeague: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (leagues.length === 0) return null;
  const current = params.get("league") ?? defaultLeague;

  // On the team profile route the league is in the path, not the query.
  const onTeamPage = pathname.startsWith("/team/");

  function go(id: string) {
    if (id === current && !onTeamPage) return;
    router.push(id === defaultLeague ? pathname : `${pathname}?league=${id}`);
  }

  return (
    <div className="flex items-center gap-1.5">
      {leagues.map((l) => {
        const on = !onTeamPage && l.league_id === current;
        return (
          <button
            key={l.league_id}
            onClick={() => go(l.league_id)}
            className={
              on
                ? "rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white"
                : "rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
            }
          >
            {SHORT[l.league_id] ?? l.display_name}
          </button>
        );
      })}
    </div>
  );
}
