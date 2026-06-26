"""Idempotent schema for the Late-Game Totals tool (NCAA men's basketball).

Creates `ncaam_anchor`: one row per (game, half, scoring play) plus a start-of-half
row, capturing the score STATE at that moment and how many points each side scores
from there to the end of the half. This is the single precompute artifact the
/totals page reads (it aggregates these rows on the fly). Owned by build_lategame.py.

    python setup_lategame_db.py

Kept separate from setup_common_db.py so the sport-agnostic schema stays clean; this
is a feature table, the way quarter_log/drive_log are owned by their feeders.
"""

from sqlalchemy import text

from db import engine_from_env

DDL = [
    """
    create table if not exists ncaam_anchor (
      anchor_id       bigint generated always as identity primary key,
      league_id       text    not null default 'ncaam',
      season          integer not null,
      game_id         text    not null,
      game_date       date,
      home_team       text    not null,
      away_team       text    not null,
      half            smallint not null,            -- 1 or 2 (regulation only)
      secs_left       integer not null,             -- secs_left_reg at the anchor
                                                    --   half 1: 2400..1200, half 2: 1200..0
      score_diff      integer not null,             -- leading margin, abs(home-away), >= 0
      leading_team    text,                          -- null at a tie (score_diff = 0)
      trailing_team   text,
      lead_pts_after  integer,                       -- pts the LEADING team scores anchor->end of half
      trail_pts_after integer,                       -- pts the TRAILING team scores anchor->end of half
      total_pts_after integer not null               -- both teams, anchor->end of half
    )
    """,
    # pick-the-anchor lookups (closest scoring play with secs_left >= T), then bucket by diff
    "create index if not exists idx_anchor_pick  on ncaam_anchor (season, half, secs_left)",
    "create index if not exists idx_anchor_lead  on ncaam_anchor (season, half, leading_team)",
    "create index if not exists idx_anchor_trail on ncaam_anchor (season, half, trailing_team)",
    "create index if not exists idx_anchor_game  on ncaam_anchor (game_id)",
]


def main() -> None:
    eng = engine_from_env()
    with eng.begin() as conn:
        for stmt in DDL:
            conn.execute(text(stmt))
        n = conn.execute(text(
            "select count(*) from information_schema.tables "
            "where table_schema='public' and table_name='ncaam_anchor'"
        )).scalar()
    eng.dispose()
    print(f"ncaam_anchor schema ready (table present: {bool(n)})")


if __name__ == "__main__":
    main()
