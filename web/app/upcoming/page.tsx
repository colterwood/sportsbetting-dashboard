import {
  getLeagues,
  getSeasons,
  getTeams,
  getScheduledSeason,
  getScheduledWeeks,
  getScheduledGames,
} from "@/lib/queries";
import { pick } from "@/lib/format";
import WeekPicker from "../components/WeekPicker";
import GameList from "../components/GameList";
import MatchupPanel from "../components/MatchupPanel";

export const dynamic = "force-dynamic";

type SP = Promise<{ [k: string]: string | string[] | undefined }>;

export default async function Upcoming({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const leagues = await getLeagues();
  if (leagues.length === 0) return <Empty msg="No active leagues yet." />;
  const league = leagues[0].league_id;

  const [seasons, schedSeason] = await Promise.all([getSeasons(league), getScheduledSeason(league)]);
  const metricsSeason = seasons[0]; // comparison data uses the latest computed season

  const weeks = schedSeason != null ? await getScheduledWeeks(league, schedSeason) : [];
  const week = weeks.length ? Number(pick(q("week"), weeks.map(String), String(weeks[0]))) : null;
  const [games, teams] = await Promise.all([
    schedSeason != null && week != null
      ? getScheduledGames(league, schedSeason, week)
      : Promise.resolve([]),
    metricsSeason != null ? getTeams(league, metricsSeason) : Promise.resolve<string[]>([]),
  ]);

  return (
    <div className="space-y-5">
      {/* Picker + inline comparison (tapping a game below expands it here). */}
      <MatchupPanel league={league} sp={sp} />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-base font-semibold text-slate-100">
            Upcoming {schedSeason != null && <span className="font-normal text-slate-500">· {schedSeason}</span>}
          </h1>
          <WeekPicker weeks={weeks} current={week} />
        </div>
        {schedSeason == null ? (
          <Empty msg="No upcoming games on the schedule yet." />
        ) : games.length ? (
          <GameList
            games={games}
            metricsSeason={metricsSeason ?? schedSeason}
            teamsWithData={teams}
            basePath="/upcoming"
            week={week}
          />
        ) : (
          <Empty msg={`No scheduled games for Week ${week}.`} />
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
