"""Idempotent schema for the dashboard's common (sport-agnostic) layer.

Creates the registry (sport/league/team/game), the declarative metric +
situation catalogs, and the pre-calculated output tables (team_metrics,
metric_distribution) that the web app reads. Safe to re-run.

    python setup_common_db.py

Per-sport feature tables (quarter_log, drive_log, ...) are owned by the feeders
and are NOT touched here.
"""

from sqlalchemy import text

from db import engine_from_env

# Each statement is idempotent. Kept as a list (not a split string) so column
# defaults / future check constraints can contain semicolons safely.
DDL = [
    # ---- registry / dimensions (common across sports) ----------------------
    """
    create table if not exists sport (
      sport_id        text primary key,
      display_name    text not null,
      period_kind     text not null,            -- 'quarter' | 'period' | 'half'
      num_periods     smallint not null,
      has_drives      boolean not null default false,
      has_possessions boolean not null default false
    )
    """,
    """
    create table if not exists league (
      league_id    text primary key,
      sport_id     text not null references sport(sport_id),
      display_name text not null,
      level        text,                         -- 'pro' | 'college' | 'major-junior'
      is_active    boolean not null default false,
      first_season integer,
      created_at   timestamptz not null default now()
    )
    """,
    "create index if not exists idx_league_sport on league (sport_id)",
    """
    create table if not exists team (
      team_id      bigint generated always as identity primary key,
      league_id    text not null references league(league_id),
      team_name    text not null,                -- matches drive_log.team exactly
      abbreviation text,
      conference   text,
      logo_url     text,
      unique (league_id, team_name)
    )
    """,
    "create index if not exists idx_team_league on team (league_id)",
    """
    create table if not exists game (
      league_id   text not null references league(league_id),
      game_id     text not null,
      season      integer not null,
      game_date   date,
      start_time  timestamptz,
      home_team   text not null,
      away_team   text not null,
      home_points integer,
      away_points integer,
      status      text not null default 'scheduled',  -- scheduled|in_progress|final|canceled
      venue       text,
      primary key (league_id, game_id)
    )
    """,
    "create index if not exists idx_game_date   on game (league_id, game_date)",
    "create index if not exists idx_game_status on game (status)",
    "create index if not exists idx_game_start  on game (start_time)",
    "alter table game add column if not exists week integer",
    """
    create table if not exists team_season_coach (
      league_id  text not null,
      season     integer not null,
      team       text not null,            -- matches team_metrics.team / quarter_log.team
      head_coach text not null,
      primary key (league_id, season, team)
    )
    """,
    "create index if not exists idx_coach_lookup on team_season_coach (league_id, season, head_coach)",

    # ---- declarative situation catalog (when to measure) -------------------
    """
    create table if not exists situation_catalog (
      sport_id      text not null references sport(sport_id),
      situation_key text not null,               -- 'game' | 'q1' | 'h1' | ...
      display_name  text not null,
      filter_json   jsonb not null default '{}', -- e.g. {"quarter":"1"} or {"quarter":["1","2"]}
      sort_order    integer not null default 0,
      primary key (sport_id, situation_key)
    )
    """,

    # ---- declarative metric catalog (what to measure) ----------------------
    """
    create table if not exists metric_catalog (
      metric_id    text primary key,             -- 'scoring_drive_rate_off'
      display_name text not null,
      sport_id     text not null references sport(sport_id),
      source_table text not null,                -- 'quarter_log' | 'drive_log'
      side         text,                         -- 'offense' | 'defense' | null
      numer_expr   text not null,                -- pandas/SQL arithmetic over source columns
      denom_expr   text,                         -- null => simple mean of numer_expr
      unit         text,                         -- 'rate'|'per_drive'|'seconds'|'plays'|'points'|'yards'
      higher_is    text,                         -- 'good_for_team'|'bad_for_team'|'neutral'
      min_sample   integer not null default 15,
      sort_order   integer not null default 0,
      is_active    boolean not null default true
    )
    """,
    "create index if not exists idx_metric_sport on metric_catalog (sport_id, is_active)",
    # aggregation kind ('ratio' = sum/sum, default; 'trimmed_mean' = per-group mean
    # with within-group outliers dropped) + which column to group by ('team' default,
    # or 'opponent' for a defense-allowed view over a per-event table).
    "alter table metric_catalog add column if not exists agg text not null default 'ratio'",
    "alter table metric_catalog add column if not exists group_col text",

    # ---- pre-calculated outputs (the only thing the web app reads) ---------
    """
    create table if not exists team_metrics (
      league_id     text not null,
      season        integer not null,
      team          text not null,
      metric_id     text not null references metric_catalog(metric_id),
      situation_key text not null,
      value         real,
      sample_size   integer,
      league_n      integer,                     -- # qualifying teams in the curve
      pctile        real,                        -- 0..100 within league-season-metric-situation
      zscore        real,
      rank          integer,                     -- 1 = highest value among qualifiers
      is_tail       boolean not null default false,
      tail_side     text,                        -- 'high' | 'low' | null
      low_sample    boolean not null default false,
      computed_at   timestamptz not null default now(),
      primary key (league_id, season, team, metric_id, situation_key)
    )
    """,
    "alter table team_metrics add column if not exists numerator real",
    "create index if not exists idx_tm_curve on team_metrics (league_id, season, metric_id, situation_key, pctile)",
    "create index if not exists idx_tm_team  on team_metrics (league_id, season, team)",
    "create index if not exists idx_tm_tail  on team_metrics (league_id, season, is_tail)",
    """
    create table if not exists metric_distribution (
      league_id     text not null,
      season        integer not null,
      metric_id     text not null references metric_catalog(metric_id),
      situation_key text not null,
      n_teams       integer,
      mean          real,
      std           real,
      val_min       real,
      p10           real,
      p25           real,
      p50           real,
      p75           real,
      p90           real,
      val_max       real,
      histogram     jsonb,                       -- [{"lo":..,"hi":..,"count":..}, ...]
      computed_at   timestamptz not null default now(),
      primary key (league_id, season, metric_id, situation_key)
    )
    """,
]


def main() -> None:
    eng = engine_from_env()
    with eng.begin() as conn:
        for stmt in DDL:
            conn.execute(text(stmt))
        tables = conn.execute(text(
            "select table_name from information_schema.tables "
            "where table_schema = 'public' and table_name in "
            "('sport','league','team','game','situation_catalog',"
            "'metric_catalog','team_metrics','metric_distribution') "
            "order by table_name"
        )).scalars().all()
    eng.dispose()
    print(f"common schema ready ({len(tables)} tables): {', '.join(tables)}")


if __name__ == "__main__":
    main()
