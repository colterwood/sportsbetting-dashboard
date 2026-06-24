import { getLeagues, getSeasons, getTeams, getLiveGames } from "@/lib/queries";
import GameList from "../components/GameList";
import MatchupPanel from "../components/MatchupPanel";

export const dynamic = "force-dynamic";

type SP = Promise<{ [k: string]: string | string[] | undefined }>;

export default async function Live({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const leagues = await getLeagues();
  if (leagues.length === 0) return <Empty msg="No active leagues yet." />;
  const league = leagues[0].league_id;

  const [seasons, games] = await Promise.all([getSeasons(league), getLiveGames(league)]);
  const metricsSeason = seasons[0];
  const teams = metricsSeason != null && games.length ? await getTeams(league, metricsSeason) : [];

  return (
    <div className="space-y-5">
      {/* Picker + inline comparison (tapping a live game below expands it here). */}
      <MatchupPanel league={league} sp={sp} />

      <div className="space-y-3">
        <h1 className="text-base font-semibold text-slate-100">
          Live <span className="font-normal text-slate-500">· in progress</span>
        </h1>
        {games.length ? (
          <GameList
            games={games}
            metricsSeason={metricsSeason ?? games[0].season}
            teamsWithData={teams}
            basePath="/live"
          />
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
