import "server-only";
import { sql } from "./db";

export type LeagueOpt = { league_id: string; display_name: string };
export type MetricOpt = {
  metric_id: string;
  display_name: string;
  unit: string;
  higher_is: string;
  sort_order: number;
};
export type SituationOpt = { situation_key: string; display_name: string; sort_order: number };

export type HistBin = { lo: number; hi: number; count: number };
export type DistRow = {
  n_teams: number;
  mean: number;
  std: number;
  val_min: number;
  val_max: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  histogram: HistBin[];
};
export type TeamRow = {
  team: string;
  value: number;
  numerator: number | null;
  sample_size: number;
  pctile: number | null;
  zscore: number | null;
  rank: number | null;
  is_tail: boolean;
  tail_side: "high" | "low" | null;
  low_sample: boolean;
};
export type ProfileRow = {
  metric_id: string;
  display_name: string;
  unit: string;
  higher_is: string;
  situation_key: string;
  situation_name: string;
  value: number;
  sample_size: number;
  pctile: number | null;
  zscore: number | null;
  rank: number | null;
  league_n: number | null;
  is_tail: boolean;
  tail_side: "high" | "low" | null;
  low_sample: boolean;
};

export async function getLeagues(): Promise<LeagueOpt[]> {
  return sql<LeagueOpt[]>`
    select league_id, display_name from league
    where is_active = true order by display_name`;
}

export async function getSeasons(league: string): Promise<number[]> {
  const rows = await sql<{ season: number }[]>`
    select distinct season from team_metrics
    where league_id = ${league} order by season desc`;
  return rows.map((r) => r.season);
}

export async function getMetrics(league: string): Promise<MetricOpt[]> {
  return sql<MetricOpt[]>`
    select mc.metric_id, mc.display_name, mc.unit, mc.higher_is, mc.sort_order
    from metric_catalog mc
    where mc.is_active = true
      and exists (select 1 from team_metrics tm
                  where tm.metric_id = mc.metric_id and tm.league_id = ${league})
    order by mc.sort_order`;
}

export async function getSituations(league: string): Promise<SituationOpt[]> {
  return sql<SituationOpt[]>`
    select sc.situation_key, sc.display_name, sc.sort_order
    from situation_catalog sc
    join league l on l.sport_id = sc.sport_id
    where l.league_id = ${league}
    order by sc.sort_order`;
}

export async function getDistribution(
  league: string,
  season: number,
  metric: string,
  situation: string,
): Promise<DistRow | null> {
  const rows = await sql<DistRow[]>`
    select n_teams, mean, std, val_min, val_max, p10, p25, p50, p75, p90, histogram
    from metric_distribution
    where league_id = ${league} and season = ${season}
      and metric_id = ${metric} and situation_key = ${situation}`;
  return rows[0] ?? null;
}

export async function getTeamMetrics(
  league: string,
  season: number,
  metric: string,
  situation: string,
): Promise<TeamRow[]> {
  return sql<TeamRow[]>`
    select team, value, numerator, sample_size, pctile, zscore, rank, is_tail, tail_side, low_sample
    from team_metrics
    where league_id = ${league} and season = ${season}
      and metric_id = ${metric} and situation_key = ${situation}
    order by value desc nulls last`;
}

export async function getTeamSeasons(league: string, team: string): Promise<number[]> {
  const rows = await sql<{ season: number }[]>`
    select distinct season from team_metrics
    where league_id = ${league} and team = ${team} order by season desc`;
  return rows.map((r) => r.season);
}

export async function getTeamProfile(
  league: string,
  team: string,
  season: number,
): Promise<ProfileRow[]> {
  return sql<ProfileRow[]>`
    select tm.metric_id, mc.display_name, mc.unit, mc.higher_is,
           tm.situation_key, sc.display_name as situation_name,
           tm.value, tm.sample_size, tm.pctile, tm.zscore, tm.rank, tm.league_n,
           tm.is_tail, tm.tail_side, tm.low_sample
    from team_metrics tm
    join metric_catalog mc on mc.metric_id = tm.metric_id
    join league l on l.league_id = tm.league_id
    join situation_catalog sc on sc.sport_id = l.sport_id and sc.situation_key = tm.situation_key
    where tm.league_id = ${league} and tm.team = ${team} and tm.season = ${season}
    order by abs(tm.zscore) desc nulls last`;
}

// ---- matchups ------------------------------------------------------------

export async function getTeams(league: string, season: number): Promise<string[]> {
  const rows = await sql<{ team: string }[]>`
    select distinct team from team_metrics
    where league_id = ${league} and season = ${season} order by team`;
  return rows.map((r) => r.team);
}

export type SlateGame = {
  game_id: string;
  season: number;
  week: number | null;
  start_time: string | null;
  home_team: string;
  away_team: string;
};

// The latest season that has scheduled games (the upcoming season).
export async function getScheduledSeason(league: string): Promise<number | null> {
  const r = await sql<{ season: number | null }[]>`
    select max(season) as season from game
    where league_id = ${league} and status = 'scheduled'`;
  return r[0]?.season ?? null;
}

// Distinct weeks that have scheduled games, ascending (for the Upcoming dropdown).
export async function getScheduledWeeks(league: string, season: number): Promise<number[]> {
  const r = await sql<{ week: number }[]>`
    select distinct week from game
    where league_id = ${league} and season = ${season} and status = 'scheduled' and week is not null
    order by week`;
  return r.map((x) => x.week);
}

// Scheduled games for one week.
export async function getScheduledGames(
  league: string,
  season: number,
  week: number,
): Promise<SlateGame[]> {
  return sql<SlateGame[]>`
    select game_id, season, week, start_time, home_team, away_team from game
    where league_id = ${league} and season = ${season} and status = 'scheduled' and week = ${week}
    order by start_time nulls last, home_team`;
}

// Games currently in progress (the Live tab).
export async function getLiveGames(league: string): Promise<SlateGame[]> {
  return sql<SlateGame[]>`
    select game_id, season, week, start_time, home_team, away_team from game
    where league_id = ${league} and status = 'in_progress'
    order by start_time nulls last, home_team`;
}

// Each team's next scheduled opponent in the upcoming season — used to auto-fill
// the second search box when a team is picked. Keyed by team displayName (matches
// team_metrics), both home and away directions.
export async function getNextOpponents(league: string): Promise<Record<string, string>> {
  const rows = await sql<{ team: string; opp: string }[]>`
    with sched as (
      select home_team, away_team, week, start_time from game
      where league_id = ${league} and status = 'scheduled'
        and season = (select max(season) from game
                      where league_id = ${league} and status = 'scheduled')
    ),
    flat as (
      select home_team as team, away_team as opp, week, start_time from sched
      union all
      select away_team as team, home_team as opp, week, start_time from sched
    ),
    ranked as (
      select team, opp,
             row_number() over (partition by team
                                order by week nulls last, start_time nulls last) as rn
      from flat
    )
    select team, opp from ranked where rn = 1`;
  const map: Record<string, string> = {};
  for (const r of rows) map[r.team] = r.opp;
  return map;
}

export type MatchupRow = {
  team: string;
  metric_id: string;
  display_name: string;
  unit: string;
  higher_is: string;
  value: number | null;
  numerator: number | null;
  sample_size: number;
  pctile: number | null;
  zscore: number | null;
  rank: number | null;
  league_n: number | null;
  is_tail: boolean;
  tail_side: "high" | "low" | null;
  low_sample: boolean;
};

export async function getMatchupMetrics(
  league: string,
  season: number,
  teamA: string,
  teamB: string,
  situation: string,
): Promise<MatchupRow[]> {
  return sql<MatchupRow[]>`
    select tm.team, tm.metric_id, mc.display_name, mc.unit, mc.higher_is,
           tm.value, tm.numerator, tm.sample_size, tm.pctile, tm.zscore, tm.rank, tm.league_n,
           tm.is_tail, tm.tail_side, tm.low_sample
    from team_metrics tm
    join metric_catalog mc on mc.metric_id = tm.metric_id
    where tm.league_id = ${league} and tm.season = ${season}
      and tm.situation_key = ${situation} and tm.team = any(${[teamA, teamB]})`;
}

export type MiniDist = {
  metric_id: string;
  histogram: HistBin[];
  mean: number;
  p50: number;
  val_min: number;
  val_max: number;
};

export async function getMatchupDistributions(
  league: string,
  season: number,
  situation: string,
  metricIds: string[],
): Promise<MiniDist[]> {
  if (metricIds.length === 0) return [];
  return sql<MiniDist[]>`
    select metric_id, histogram, mean, p50, val_min, val_max
    from metric_distribution
    where league_id = ${league} and season = ${season} and situation_key = ${situation}
      and metric_id = any(${metricIds})`;
}

export type CoachInfo = {
  team: string;
  coach: string | null;
  prev_coach: string | null; // this team's coach last season
  coach_prev_team: string | null; // the team this coach led last season (if different)
};

// Coach for each team in `season`, plus last season's coach for the same team and
// (if the coach is new and came from elsewhere) the team they led last season.
export async function getTeamCoaches(
  league: string,
  season: number,
  teams: string[],
): Promise<Record<string, CoachInfo>> {
  if (teams.length === 0) return {};
  const rows = await sql<CoachInfo[]>`
    select c.team,
           c.head_coach as coach,
           p.head_coach as prev_coach,
           pt.team as coach_prev_team
    from team_season_coach c
    left join team_season_coach p
      on p.league_id = c.league_id and p.season = c.season - 1 and p.team = c.team
    left join team_season_coach pt
      on pt.league_id = c.league_id and pt.season = c.season - 1
         and pt.head_coach = c.head_coach and pt.team <> c.team
    where c.league_id = ${league} and c.season = ${season}
      and c.team = any(${teams})`;
  const map: Record<string, CoachInfo> = {};
  for (const r of rows) map[r.team] = r;
  return map;
}
