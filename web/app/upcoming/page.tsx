import { Suspense } from "react";
import {
  getLeagues,
  getSeasons,
  getTeams,
  getScheduledSeason,
  getScheduledWeeks,
  getScheduledGames,
  getUpcomingDates,
  getUpcomingGames,
} from "@/lib/queries";
import { pick } from "@/lib/format";
import WeekPicker from "../components/WeekPicker";
import DayPicker from "../components/DayPicker";
import GameList from "../components/GameList";
import MatchupPanel from "../components/MatchupPanel";
import LateGameTotals from "../components/LateGameTotals";

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
  const league = pick(q("league"), leagues.map((l) => l.league_id), leagues[0].league_id);
  const sport = leagues.find((l) => l.league_id === league)!.sport_id;

  // NCAAB: browse UPCOMING (future, scheduled) games by date, then analyze with the
  // totals tool. Only future scheduled games belong here — never finished ones. The
  // default lands on the soonest upcoming date.
  if (sport === "basketball") {
    const dates = await getUpcomingDates(league);
    const date = dates.length
      ? pick(q("date"), dates.map((d) => d.game_date), dates[0].game_date)
      : null;
    const games = date ? await getUpcomingGames(league, date) : [];
    const slateTeams = [...new Set(games.flatMap((g) => [g.home_team, g.away_team]))];
    return (
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-base font-semibold text-slate-100">
              Upcoming <span className="font-normal text-slate-500">· by date</span>
            </h1>
            <DayPicker dates={dates} current={date} />
          </div>
          {games.length ? (
            <GameList games={games} metricsSeason={games[0].season} teamsWithData={slateTeams}
              basePath="/upcoming" league={league} />
          ) : (
            <Empty msg="No NCAAB games scheduled yet — ESPN releases the 2026-27 schedule in the fall; this fills in automatically once it's loaded." />
          )}
        </div>
        <Suspense fallback={<Loading />}>
          <LateGameTotals sp={sp} />
        </Suspense>
      </div>
    );
  }

  // Football: scheduled games by week + team-metric matchup.
  const [seasons, schedSeason] = await Promise.all([getSeasons(league), getScheduledSeason(league)]);
  const metricsSeason = seasons[0];
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
          <GameList games={games} metricsSeason={metricsSeason ?? schedSeason}
            teamsWithData={teams} basePath="/upcoming" week={week} league={league} />
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

function Loading() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 text-center text-sm text-slate-500">
      Loading late-game tool…
    </div>
  );
}
