"""Derive each team's season head coach from the feeder's quarter_log and write
the dashboard's pre-calculated `team_season_coach` dimension (the web app reads it
to show the coach under each team, with last year's coach / coach's last team).

The coach for a (season, team) is the `team_coach` appearing on the most of that
team's quarter rows -- robust to mid-season interim changes (picks the primary
coach). FCS teams (null/blank team_coach) are skipped.

    python load_coaches.py                 # all mapped leagues
    python load_coaches.py --league ncaaf

Idempotent (upsert by league+season+team). Run after the feeder's daily update,
alongside build_metrics.py.
"""

import argparse

from sqlalchemy import text

from db import engine_from_env

# Logical coach source per league (mirrors build_metrics.feature_table: NCAAF's
# quarter_log carries the per-game team_coach).
COACH_SOURCE = {"ncaaf": "quarter_log"}


def build(leagues: list[str]) -> None:
    eng = engine_from_env()
    with eng.begin() as conn:
        for lg in leagues:
            src = COACH_SOURCE.get(lg)
            if not src:
                print(f"[{lg}] no coach source table mapped, skipping")
                continue
            # team name from the fixed mapping above -> safe to inline.
            conn.execute(text(f"""
                insert into team_season_coach (league_id, season, team, head_coach)
                select :league, season, team, head_coach from (
                  select cast(season as integer) as season, team,
                         team_coach as head_coach,
                         row_number() over (
                           partition by cast(season as integer), team
                           order by count(*) desc, team_coach
                         ) as rn
                  from {src}
                  where team_coach is not null and team_coach <> ''
                  group by cast(season as integer), team, team_coach
                ) ranked
                where rn = 1
                on conflict (league_id, season, team)
                  do update set head_coach = excluded.head_coach
            """), {"league": lg})
            n = conn.execute(text(
                "select count(*) from team_season_coach where league_id = :l"),
                {"l": lg}).scalar()
            print(f"[{lg}] team_season_coach: {n} (season, team) coach rows")
    eng.dispose()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", action="append", help="league_id (repeatable); default = all mapped")
    args = ap.parse_args()
    build(args.league or list(COACH_SOURCE))


if __name__ == "__main__":
    main()
