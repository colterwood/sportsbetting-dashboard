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
