import { Suspense } from "react";
import { getLeagues, getSeasons, getTeams, getLiveGames } from "@/lib/queries";
import { pick } from "@/lib/format";
import GameList from "../components/GameList";
import MatchupPanel from "../components/MatchupPanel";
import LateGameTotals from "../components/LateGameTotals";

export const dynamic = "force-dynamic";

type SP = Promise<{ [k: string]: string | string[] | undefined }>;

export default async function Live({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const leagues = await getLeagues();
  if (leagues.length === 0) return <Empty msg="No active leagues yet." />;
  const league = pick(q("league"), leagues.map((l) => l.league_id), leagues[0].league_id);
  const sport = leagues.find((l) => l.league_id === league)!.sport_id;

  const games = await getLiveGames(league);
  const slateTeams = [...new Set(games.flatMap((g) => [g.home_team, g.away_team]))];

  const list =
    games.length ? (
      <GameList games={games} metricsSeason={games[0].season} teamsWithData={slateTeams}
        basePath="/live" league={league} />
    ) : (
      <Empty msg={sport === "basketball"
        ? "No NCAAB games live right now (season tips off in November) — analyze any matchup below."
        : "No games are live right now."} />
    );

  // NCAAB: the late-game totals tool is the analysis (no team-metric matchup yet).
  if (sport === "basketball") {
    return (
      <div className="space-y-5">
        <div className="space-y-3">
          <h1 className="text-base font-semibold text-slate-100">
            Live <span className="font-normal text-slate-500">· in progress</span>
          </h1>
          {list}
        </div>
        <Suspense fallback={<Loading />}>
          <LateGameTotals sp={sp} />
        </Suspense>
      </div>
    );
  }

  // Football: the existing team-metric matchup experience.
  const seasons = await getSeasons(league);
  const metricsSeason = seasons[0];
  const teams = metricsSeason != null && games.length ? await getTeams(league, metricsSeason) : [];
  return (
    <div className="space-y-5">
      <MatchupPanel league={league} sp={sp} />
      <div className="space-y-3">
        <h1 className="text-base font-semibold text-slate-100">
          Live <span className="font-normal text-slate-500">· in progress</span>
        </h1>
        {games.length ? (
          <GameList games={games} metricsSeason={metricsSeason ?? games[0].season}
            teamsWithData={teams} basePath="/live" league={league} />
        ) : (
          <Empty msg="No games are live right now." />
        )}
      </div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-slate-800 px-4 py-10 text-center text-sm text-slate-400">{msg}</div>
  );
}

function Loading() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 text-center text-sm text-slate-500">
      Loading late-game tool…
    </div>
  );
}
