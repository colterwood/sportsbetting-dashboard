"""Seed the declarative metric + situation catalogs for NCAA Football.

A METRIC says *what* to measure (a numerator/denominator over a feature table).
A SITUATION says *when* (a row filter, e.g. quarter = 1). build_metrics.py computes
every active metric x every applicable situation x every team x season, so adding a
metric or a situation here automatically expands the grid -- no schema or UI change.

    python metrics/catalog_seed.py

Re-runnable: rows are upserted by primary key, so existing definitions are updated
and hand-added metrics in the DB are left untouched.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402

from db import engine_from_env  # noqa: E402

SPORT_ID = "football"

# --- situations (when to measure) -------------------------------------------
# filter_json keys are column names on the source feature table; a list value
# becomes an IN (...) filter. {} = whole game.
SITUATIONS = [
    {"situation_key": "game", "display_name": "Full Game",  "filter": {},                    "sort_order": 0},
    {"situation_key": "h1",   "display_name": "1st Half",   "filter": {"quarter": ["1", "2"]}, "sort_order": 1},
    {"situation_key": "h2",   "display_name": "2nd Half",   "filter": {"quarter": ["3", "4"]}, "sort_order": 2},
    {"situation_key": "q1",   "display_name": "1st Quarter", "filter": {"quarter": "1"},       "sort_order": 3},
    {"situation_key": "q2",   "display_name": "2nd Quarter", "filter": {"quarter": "2"},       "sort_order": 4},
    {"situation_key": "q3",   "display_name": "3rd Quarter", "filter": {"quarter": "3"},       "sort_order": 5},
    {"situation_key": "q4",   "display_name": "4th Quarter", "filter": {"quarter": "4"},       "sort_order": 6},
]

# --- metrics (what to measure) ----------------------------------------------
# numer/denom are arithmetic expressions over quarter_log columns. denom null =>
# simple mean of numer. higher_is frames a tail as bet-for/against for the team.
_QL = "quarter_log"
METRICS = [
    # Offense
    {"metric_id": "scoring_drive_rate_off", "display_name": "Scoring-Drive Rate (Off)",
     "source_table": _QL, "side": "offense", "numer_expr": "td_drives_for + fg_drives_for",
     "denom_expr": "drives_for", "unit": "rate", "higher_is": "good_for_team", "min_sample": 15, "sort_order": 10},
    {"metric_id": "td_drive_rate_off", "display_name": "TD-Drive Rate (Off)",
     "source_table": _QL, "side": "offense", "numer_expr": "td_drives_for",
     "denom_expr": "drives_for", "unit": "rate", "higher_is": "good_for_team", "min_sample": 15, "sort_order": 11},
    {"metric_id": "three_and_out_rate_off", "display_name": "3-and-Out Rate (Off)",
     "source_table": _QL, "side": "offense", "numer_expr": "three_and_outs_for",
     "denom_expr": "drives_for", "unit": "rate", "higher_is": "bad_for_team", "min_sample": 15, "sort_order": 12},
    {"metric_id": "points_per_drive_off", "display_name": "Points / Drive (Off)",
     "source_table": _QL, "side": "offense", "numer_expr": "points_for",
     "denom_expr": "drives_for", "unit": "per_drive", "higher_is": "good_for_team", "min_sample": 15, "sort_order": 13},
    {"metric_id": "explosive_rate_off", "display_name": "Explosive-Play Rate (Off)",
     "source_table": _QL, "side": "offense", "numer_expr": "explosive_plays_for",
     "denom_expr": "plays_for", "unit": "rate", "higher_is": "good_for_team", "min_sample": 20, "sort_order": 14},
    {"metric_id": "redzone_td_rate_off", "display_name": "Red-Zone TD Rate (Off)",
     "source_table": _QL, "side": "offense", "numer_expr": "redzone_tds_for",
     "denom_expr": "redzone_trips_for", "unit": "rate", "higher_is": "good_for_team", "min_sample": 8, "sort_order": 15},
    {"metric_id": "plays_per_drive_off", "display_name": "Plays / Drive (Off)",
     "source_table": _QL, "side": "offense", "numer_expr": "plays_per_drive_for * drives_for",
     "denom_expr": "drives_for", "unit": "plays", "higher_is": "neutral", "min_sample": 15, "sort_order": 16},
    {"metric_id": "secs_per_drive_off", "display_name": "Secs / Drive (Off, pace)",
     "source_table": _QL, "side": "offense", "numer_expr": "avg_secs_per_drive_for * drives_for",
     "denom_expr": "drives_for", "unit": "seconds", "higher_is": "neutral", "min_sample": 15, "sort_order": 17},
    {"metric_id": "yards_per_play_off", "display_name": "Yards / Play (Off)",
     "source_table": _QL, "side": "offense", "numer_expr": "yards_per_play_for * plays_for",
     "denom_expr": "plays_for", "unit": "yards", "higher_is": "good_for_team", "min_sample": 40, "sort_order": 18},
    # Defense
    {"metric_id": "scoring_drive_rate_def", "display_name": "Scoring-Drive Rate Allowed (Def)",
     "source_table": _QL, "side": "defense", "numer_expr": "td_drives_against + fg_drives_against",
     "denom_expr": "drives_against", "unit": "rate", "higher_is": "bad_for_team", "min_sample": 15, "sort_order": 20},
    {"metric_id": "td_drive_rate_def", "display_name": "TD-Drive Rate Allowed (Def)",
     "source_table": _QL, "side": "defense", "numer_expr": "td_drives_against",
     "denom_expr": "drives_against", "unit": "rate", "higher_is": "bad_for_team", "min_sample": 15, "sort_order": 21},
    {"metric_id": "three_and_out_rate_def", "display_name": "3-and-Out Rate Forced (Def)",
     "source_table": _QL, "side": "defense", "numer_expr": "three_and_outs_against",
     "denom_expr": "drives_against", "unit": "rate", "higher_is": "good_for_team", "min_sample": 15, "sort_order": 22},
    {"metric_id": "points_per_drive_def", "display_name": "Points / Drive Allowed (Def)",
     "source_table": _QL, "side": "defense", "numer_expr": "points_against",
     "denom_expr": "drives_against", "unit": "per_drive", "higher_is": "bad_for_team", "min_sample": 15, "sort_order": 23},
    {"metric_id": "explosive_rate_def", "display_name": "Explosive-Play Rate Allowed (Def)",
     "source_table": _QL, "side": "defense", "numer_expr": "explosive_plays_against",
     "denom_expr": "plays_against", "unit": "rate", "higher_is": "bad_for_team", "min_sample": 20, "sort_order": 24},
    {"metric_id": "secs_per_drive_def", "display_name": "Secs / Drive Allowed (Def, opp pace)",
     "source_table": _QL, "side": "defense", "numer_expr": "avg_secs_per_drive_against * drives_against",
     "denom_expr": "drives_against", "unit": "seconds", "higher_is": "neutral", "min_sample": 15, "sort_order": 25},
    {"metric_id": "yards_per_play_def", "display_name": "Yards / Play Allowed (Def)",
     "source_table": _QL, "side": "defense", "numer_expr": "yards_per_play_against * plays_against",
     "denom_expr": "plays_against", "unit": "yards", "higher_is": "bad_for_team", "min_sample": 40, "sort_order": 26},
    {"metric_id": "plays_per_drive_def", "display_name": "Plays / Drive Allowed (Def)",
     "source_table": _QL, "side": "defense", "numer_expr": "plays_per_drive_against * drives_against",
     "denom_expr": "drives_against", "unit": "plays", "higher_is": "neutral", "min_sample": 15, "sort_order": 27},
    {"metric_id": "secs_per_play_off", "display_name": "Secs / Play (Off)",
     "source_table": _QL, "side": "offense", "numer_expr": "secs_per_play_for * plays_for",
     "denom_expr": "plays_for", "unit": "seconds", "higher_is": "neutral", "min_sample": 40, "sort_order": 28},
    {"metric_id": "secs_per_play_def", "display_name": "Secs / Play (Def)",
     "source_table": _QL, "side": "defense", "numer_expr": "secs_per_play_against * plays_against",
     "denom_expr": "plays_against", "unit": "seconds", "higher_is": "neutral", "min_sample": 40, "sort_order": 29},
    {"metric_id": "yards_per_pass_off", "display_name": "Yards / Pass (Off)",
     "source_table": _QL, "side": "offense", "numer_expr": "yards_per_pass_for * pass_plays_for",
     "denom_expr": "pass_plays_for", "unit": "yards", "higher_is": "good_for_team", "min_sample": 25, "sort_order": 30},
    {"metric_id": "yards_per_pass_def", "display_name": "Yards / Pass Allowed (Def)",
     "source_table": _QL, "side": "defense", "numer_expr": "yards_per_pass_against * pass_plays_against",
     "denom_expr": "pass_plays_against", "unit": "yards", "higher_is": "bad_for_team", "min_sample": 25, "sort_order": 31},
    {"metric_id": "yards_per_run_off", "display_name": "Yards / Run (Off)",
     "source_table": _QL, "side": "offense", "numer_expr": "yards_per_run_for * rush_plays_for",
     "denom_expr": "rush_plays_for", "unit": "yards", "higher_is": "good_for_team", "min_sample": 25, "sort_order": 32},
    {"metric_id": "yards_per_run_def", "display_name": "Yards / Run Allowed (Def)",
     "source_table": _QL, "side": "defense", "numer_expr": "yards_per_run_against * rush_plays_against",
     "denom_expr": "rush_plays_against", "unit": "yards", "higher_is": "bad_for_team", "min_sample": 25, "sort_order": 33},
    {"metric_id": "pass_rate_off", "display_name": "Pass Rate (Off)",
     "source_table": _QL, "side": "offense", "numer_expr": "pass_plays_for",
     "denom_expr": "plays_for", "unit": "rate", "higher_is": "neutral", "min_sample": 40, "sort_order": 34},
    {"metric_id": "pass_rate_def", "display_name": "Pass Rate Faced (Def)",
     "source_table": _QL, "side": "defense", "numer_expr": "pass_plays_against",
     "denom_expr": "plays_against", "unit": "rate", "higher_is": "neutral", "min_sample": 40, "sort_order": 35},
]

_SPORT_UPSERT = text("""
    insert into sport (sport_id, display_name, period_kind, num_periods, has_drives, has_possessions)
    values (:sport_id, 'Football', 'quarter', 4, true, false)
    on conflict (sport_id) do nothing
""")

_SIT_UPSERT = text("""
    insert into situation_catalog (sport_id, situation_key, display_name, filter_json, sort_order)
    values (:sport_id, :situation_key, :display_name, cast(:filter_json as jsonb), :sort_order)
    on conflict (sport_id, situation_key) do update set
      display_name = excluded.display_name,
      filter_json  = excluded.filter_json,
      sort_order   = excluded.sort_order
""")

_METRIC_UPSERT = text("""
    insert into metric_catalog
      (metric_id, display_name, sport_id, source_table, side,
       numer_expr, denom_expr, unit, higher_is, min_sample, sort_order, is_active)
    values
      (:metric_id, :display_name, :sport_id, :source_table, :side,
       :numer_expr, :denom_expr, :unit, :higher_is, :min_sample, :sort_order, true)
    on conflict (metric_id) do update set
      display_name = excluded.display_name,
      source_table = excluded.source_table,
      side         = excluded.side,
      numer_expr   = excluded.numer_expr,
      denom_expr   = excluded.denom_expr,
      unit         = excluded.unit,
      higher_is    = excluded.higher_is,
      min_sample   = excluded.min_sample,
      sort_order   = excluded.sort_order
""")


def main() -> None:
    eng = engine_from_env()
    with eng.begin() as conn:
        conn.execute(_SPORT_UPSERT, {"sport_id": SPORT_ID})
        for s in SITUATIONS:
            conn.execute(_SIT_UPSERT, {
                "sport_id": SPORT_ID, "situation_key": s["situation_key"],
                "display_name": s["display_name"], "filter_json": json.dumps(s["filter"]),
                "sort_order": s["sort_order"],
            })
        for m in METRICS:
            conn.execute(_METRIC_UPSERT, {"sport_id": SPORT_ID, **m})
    eng.dispose()
    print(f"seeded {len(SITUATIONS)} situations + {len(METRICS)} metrics for sport '{SPORT_ID}'")


if __name__ == "__main__":
    main()
