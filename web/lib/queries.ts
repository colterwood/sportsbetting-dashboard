import "server-only";
import { unstable_cache } from "next/cache";
import { sql } from "./db";

// ---- cross-request caching ----------------------------------------------
// The web app only READS precomputed tables (team_metrics, metric_distribution,
// ncaam_anchor, catalogs, schedule). Those change ONLY when the Python builds run,
// so we cache reads aggressively and invalidate by TAG when a build finishes (the
// build scripts ping /api/revalidate). `revalidate` is just a safety backstop.
//   registry  — sport/league (load_registry)
//   catalog   — metric/situation catalogs (catalog_seed*)
//   metrics   — team_metrics / metric_distribution / coaches (build_metrics, load_coaches)
//   lategame  — ncaam_anchor distributions (build_lategame)
//   schedule  — game schedule (load_schedule*)
// Live in-progress games are deliberately NOT cached (must stay fresh).

type Tag = "registry" | "catalog" | "metrics" | "lategame" | "schedule";
const DAY = 86400;

function cached<A extends unknown[], R>(fn: (...a: A) => Promise<R>, key: string, tag: Tag) {
  return unstable_cache(fn, [key], { tags: [tag], revalidate: DAY });
}

export type LeagueOpt = { league_id: string; display_name: string; sport_id: string };
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

export const getLeagues = cached(
  async (): Promise<LeagueOpt[]> =>
    sql<LeagueOpt[]>`
    select league_id, display_name, sport_id from league
    where is_active = true order by display_name`,
  "getLeagues",
  "registry",
);

export const getSeasons = cached(
  async (league: string): Promise<number[]> => {
    const rows = await sql<{ season: number }[]>`
      select distinct season from team_metrics
      where league_id = ${league} order by season desc`;
    return rows.map((r) => r.season);
  },
  "getSeasons",
  "metrics",
);

export const getMetrics = cached(
  async (league: string): Promise<MetricOpt[]> =>
    sql<MetricOpt[]>`
    select mc.metric_id, mc.display_name, mc.unit, mc.higher_is, mc.sort_order
    from metric_catalog mc
    where mc.is_active = true
      and exists (select 1 from team_metrics tm
                  where tm.metric_id = mc.metric_id and tm.league_id = ${league})
    order by mc.sort_order`,
  "getMetrics",
  "metrics",
);

export const getSituations = cached(
  async (league: string): Promise<SituationOpt[]> =>
    sql<SituationOpt[]>`
    select sc.situation_key, sc.display_name, sc.sort_order
    from situation_catalog sc
    join league l on l.sport_id = sc.sport_id
    where l.league_id = ${league}
    order by sc.sort_order`,
  "getSituations",
  "catalog",
);

export const getDistribution = cached(
  async (
    league: string,
    season: number,
    metric: string,
    situation: string,
  ): Promise<DistRow | null> => {
    const rows = await sql<DistRow[]>`
      select n_teams, mean, std, val_min, val_max, p10, p25, p50, p75, p90, histogram
      from metric_distribution
      where league_id = ${league} and season = ${season}
        and metric_id = ${metric} and situation_key = ${situation}`;
    return rows[0] ?? null;
  },
  "getDistribution",
  "metrics",
);

export const getTeamMetrics = cached(
  async (
    league: string,
    season: number,
    metric: string,
    situation: string,
  ): Promise<TeamRow[]> =>
    sql<TeamRow[]>`
    select team, value, numerator, sample_size, pctile, zscore, rank, is_tail, tail_side, low_sample
    from team_metrics
    where league_id = ${league} and season = ${season}
      and metric_id = ${metric} and situation_key = ${situation}
    order by value desc nulls last`,
  "getTeamMetrics",
  "metrics",
);

export const getTeamSeasons = cached(
  async (league: string, team: string): Promise<number[]> => {
    const rows = await sql<{ season: number }[]>`
      select distinct season from team_metrics
      where league_id = ${league} and team = ${team} order by season desc`;
    return rows.map((r) => r.season);
  },
  "getTeamSeasons",
  "metrics",
);

export const getTeamProfile = cached(
  async (league: string, team: string, season: number): Promise<ProfileRow[]> =>
    sql<ProfileRow[]>`
    select tm.metric_id, mc.display_name, mc.unit, mc.higher_is,
           tm.situation_key, sc.display_name as situation_name,
           tm.value, tm.sample_size, tm.pctile, tm.zscore, tm.rank, tm.league_n,
           tm.is_tail, tm.tail_side, tm.low_sample
    from team_metrics tm
    join metric_catalog mc on mc.metric_id = tm.metric_id
    join league l on l.league_id = tm.league_id
    join situation_catalog sc on sc.sport_id = l.sport_id and sc.situation_key = tm.situation_key
    where tm.league_id = ${league} and tm.team = ${team} and tm.season = ${season}
    order by abs(tm.zscore) desc nulls last`,
  "getTeamProfile",
  "metrics",
);

// ---- matchups ------------------------------------------------------------

export const getTeams = cached(
  async (league: string, season: number): Promise<string[]> => {
    const rows = await sql<{ team: string }[]>`
      select distinct team from team_metrics
      where league_id = ${league} and season = ${season} order by team`;
    return rows.map((r) => r.team);
  },
  "getTeams",
  "metrics",
);

export type SlateGame = {
  game_id: string;
  season: number;
  week: number | null;
  start_time: string | null;
  home_team: string;
  away_team: string;
};

// The latest season that has scheduled games (the upcoming season).
export const getScheduledSeason = cached(
  async (league: string): Promise<number | null> => {
    const r = await sql<{ season: number | null }[]>`
      select max(season) as season from game
      where league_id = ${league} and status = 'scheduled'`;
    return r[0]?.season ?? null;
  },
  "getScheduledSeason",
  "schedule",
);

// Distinct weeks that have scheduled games, ascending (for the Upcoming dropdown).
export const getScheduledWeeks = cached(
  async (league: string, season: number): Promise<number[]> => {
    const r = await sql<{ week: number }[]>`
      select distinct week from game
      where league_id = ${league} and season = ${season} and status = 'scheduled' and week is not null
      order by week`;
    return r.map((x) => x.week);
  },
  "getScheduledWeeks",
  "schedule",
);

// Scheduled games for one week.
export const getScheduledGames = cached(
  async (league: string, season: number, week: number): Promise<SlateGame[]> =>
    sql<SlateGame[]>`
    select game_id, season, week, start_time, home_team, away_team from game
    where league_id = ${league} and season = ${season} and status = 'scheduled' and week = ${week}
    order by start_time nulls last, home_team`,
  "getScheduledGames",
  "schedule",
);

// Games currently in progress (the Live tab) — NEVER cached; must stay fresh.
export async function getLiveGames(league: string): Promise<SlateGame[]> {
  return sql<SlateGame[]>`
    select game_id, season, week, start_time, home_team, away_team from game
    where league_id = ${league} and status = 'in_progress'
    order by start_time nulls last, home_team`;
}

// Each team's next scheduled opponent in the upcoming season — used to auto-fill
// the second search box when a team is picked. Keyed by team displayName (matches
// team_metrics), both home and away directions.
export const getNextOpponents = cached(
  async (league: string): Promise<Record<string, string>> => {
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
  },
  "getNextOpponents",
  "schedule",
);

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

export const getMatchupMetrics = cached(
  async (
    league: string,
    season: number,
    teamA: string,
    teamB: string,
    situation: string,
  ): Promise<MatchupRow[]> =>
    sql<MatchupRow[]>`
    select tm.team, tm.metric_id, mc.display_name, mc.unit, mc.higher_is,
           tm.value, tm.numerator, tm.sample_size, tm.pctile, tm.zscore, tm.rank, tm.league_n,
           tm.is_tail, tm.tail_side, tm.low_sample
    from team_metrics tm
    join metric_catalog mc on mc.metric_id = tm.metric_id
    where tm.league_id = ${league} and tm.season = ${season}
      and tm.situation_key = ${situation} and tm.team = any(${[teamA, teamB]})`,
  "getMatchupMetrics",
  "metrics",
);

export type MiniDist = {
  metric_id: string;
  histogram: HistBin[];
  mean: number;
  p50: number;
  val_min: number;
  val_max: number;
};

export const getMatchupDistributions = cached(
  async (
    league: string,
    season: number,
    situation: string,
    metricIds: string[],
  ): Promise<MiniDist[]> => {
    if (metricIds.length === 0) return [];
    return sql<MiniDist[]>`
      select metric_id, histogram, mean, p50, val_min, val_max
      from metric_distribution
      where league_id = ${league} and season = ${season} and situation_key = ${situation}
        and metric_id = any(${metricIds})`;
  },
  "getMatchupDistributions",
  "metrics",
);

export type CoachInfo = {
  team: string;
  coach: string | null;
  prev_coach: string | null; // this team's coach last season
  coach_prev_team: string | null; // the team this coach led last season (if different)
};

// Coach for each team in `season`, plus last season's coach for the same team and
// (if the coach is new and came from elsewhere) the team they led last season.
export const getTeamCoaches = cached(
  async (
    league: string,
    season: number,
    teams: string[],
  ): Promise<Record<string, CoachInfo>> => {
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
  },
  "getTeamCoaches",
  "metrics",
);

// ---- late-game totals (NCAAM) -------------------------------------------
// Reads the ncaam_anchor feature table (built by build_lategame.py). The unit is
// a game-SITUATION, not a team: each query snaps every game to its score state at
// a given moment, then aggregates the "points-from-here-to-end-of-half" outcome.

export const getLateGameSeasons = cached(
  async (): Promise<number[]> => {
    const rows = await sql<{ season: number }[]>`
      select distinct season from ncaam_anchor order by season desc`;
    return rows.map((r) => r.season);
  },
  "getLateGameSeasons",
  "lategame",
);

export const getLateGameTeams = cached(
  async (season: number): Promise<string[]> => {
    const rows = await sql<{ team: string }[]>`
      select home_team as team from ncaam_anchor where season = ${season}
      union
      select away_team from ncaam_anchor where season = ${season}
      order by team`;
    return rows.map((r) => r.team);
  },
  "getLateGameTeams",
  "lategame",
);

export type AnchorDate = { game_date: string; games: number };

export const getLateGameDates = cached(
  async (season: number): Promise<AnchorDate[]> =>
    sql<AnchorDate[]>`
    select game_date::text as game_date, count(distinct game_id)::int as games
    from ncaam_anchor
    where season = ${season} and game_date is not null
    group by game_date order by game_date`,
  "getLateGameDates",
  "lategame",
);

export type SlateGameLite = { game_id: string; home_team: string; away_team: string };

export const getLateGameSlate = cached(
  async (season: number, date: string): Promise<SlateGameLite[]> =>
    sql<SlateGameLite[]>`
    select distinct game_id, home_team, away_team
    from ncaam_anchor
    where season = ${season} and game_date::text = ${date}
    order by home_team`,
  "getLateGameSlate",
  "lategame",
);

export type AnchorPick = {
  game_id: string;
  game_date: string | null;
  home_team: string;
  away_team: string;
  leading_team: string | null;
  trailing_team: string | null;
  score_diff: number;
  lead_pts_after: number | null;
  trail_pts_after: number | null;
  total_pts_after: number;
};

// One row per historical game: its score state snapped to the anchor at/just before
// `secsLeft` in `half`, kept only if that anchor's margin is in [diffLo, diffHi].
// The page derives the league distribution, team slices, and the comparable-games
// list from this single set.
export const getLateGameAnchors = cached(
  async (
    season: number,
    half: number,
    secsLeft: number,
    diffLo: number,
    diffHi: number,
  ): Promise<AnchorPick[]> =>
    sql<AnchorPick[]>`
    with picked as (
      select distinct on (game_id)
        game_id, game_date::text as game_date, home_team, away_team,
        leading_team, trailing_team, score_diff,
        lead_pts_after, trail_pts_after, total_pts_after
      from ncaam_anchor
      where season = ${season} and half = ${half} and secs_left >= ${secsLeft}
      order by game_id, secs_left asc
    )
    select * from picked
    where score_diff between ${diffLo} and ${diffHi}`,
  "getLateGameAnchors",
  "lategame",
);

// FUTURE, SCHEDULED dates only — this drives the NCAAB "Upcoming" dropdown, which
// must never show finished games (you can't bet a final). Season-agnostic on
// purpose: "upcoming" is defined by date + status, not by the season the historical
// totals model uses. Returns nothing in the offseason until the schedule is loaded.
export const getUpcomingDates = cached(
  async (league: string): Promise<AnchorDate[]> =>
    sql<AnchorDate[]>`
    select game_date::text as game_date, count(*)::int as games
    from game
    where league_id = ${league} and status = 'scheduled' and game_date >= current_date
    group by game_date order by game_date`,
  "getUpcomingDates",
  "schedule",
);

// Scheduled (not-yet-played) games on a given upcoming date.
export const getUpcomingGames = cached(
  async (league: string, date: string): Promise<SlateGame[]> =>
    sql<SlateGame[]>`
    select game_id, season, week, start_time, home_team, away_team from game
    where league_id = ${league} and status = 'scheduled' and game_date::text = ${date}
    order by start_time nulls last, home_team`,
  "getUpcomingGames",
  "schedule",
);
