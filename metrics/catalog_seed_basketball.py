"""Seed the declarative metric + situation catalogs for NCAA men's basketball.

Mirrors metrics/catalog_seed.py (football). Metrics are RATIOS over the
ncaam_team_half feature table (built by build_ncaam_features.py), so they're correct
for the full game or a single half. build_metrics.py --league ncaam turns these into
team_metrics + metric_distribution, lighting up Ranks / team profiles / matchups.

    python metrics/catalog_seed_basketball.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402

from db import engine_from_env, revalidate  # noqa: E402

SPORT_ID = "basketball"
_TBL = "ncaam_team_half"

SITUATIONS = [
    {"situation_key": "game", "display_name": "Full Game", "filter": {}, "sort_order": 0},
    {"situation_key": "h1", "display_name": "1st Half", "filter": {"half": "1"}, "sort_order": 1},
    {"situation_key": "h2", "display_name": "2nd Half", "filter": {"half": "2"}, "sort_order": 2},
]

# numer/denom are per-row expressions over ncaam_team_half columns; build_metrics
# sums them across the team's rows, so every metric below is a true season ratio.
METRICS = [
    # Offense
    {"metric_id": "off_eff", "display_name": "Points / Poss (Off)", "side": "offense",
     "numer_expr": "pts_for", "denom_expr": "poss_for", "unit": "points",
     "higher_is": "good_for_team", "min_sample": 150, "sort_order": 10},
    {"metric_id": "efg_off", "display_name": "Effective FG% (Off)", "side": "offense",
     "numer_expr": "fgm_for + 0.5 * tpm_for", "denom_expr": "fga_for", "unit": "rate",
     "higher_is": "good_for_team", "min_sample": 100, "sort_order": 11},
    {"metric_id": "three_rate_off", "display_name": "3PA Rate (Off)", "side": "offense",
     "numer_expr": "tpa_for", "denom_expr": "fga_for", "unit": "rate",
     "higher_is": "neutral", "min_sample": 100, "sort_order": 12},
    {"metric_id": "three_pct_off", "display_name": "3P% (Off)", "side": "offense",
     "numer_expr": "tpm_for", "denom_expr": "tpa_for", "unit": "rate",
     "higher_is": "good_for_team", "min_sample": 40, "sort_order": 13},
    {"metric_id": "ft_rate_off", "display_name": "FT Rate (Off, FTA/FGA)", "side": "offense",
     "numer_expr": "fta_for", "denom_expr": "fga_for", "unit": "rate",
     "higher_is": "good_for_team", "min_sample": 100, "sort_order": 14},
    {"metric_id": "to_rate_off", "display_name": "Turnover Rate (Off)", "side": "offense",
     "numer_expr": "to_for", "denom_expr": "poss_for", "unit": "rate",
     "higher_is": "bad_for_team", "min_sample": 150, "sort_order": 15},
    {"metric_id": "oreb_pct_off", "display_name": "Off Rebound % (Off)", "side": "offense",
     "numer_expr": "oreb_for", "denom_expr": "oreb_for + (reb_against - oreb_against)", "unit": "rate",
     "higher_is": "good_for_team", "min_sample": 50, "sort_order": 16},
    {"metric_id": "pace", "display_name": "Possessions / 40 (pace)", "side": "offense",
     "numer_expr": "poss_for * 2400", "denom_expr": "secs", "unit": "plays",
     "higher_is": "neutral", "min_sample": 150, "sort_order": 17},
    # Defense (opponent's offense = *_against columns)
    {"metric_id": "def_eff", "display_name": "Points / Poss Allowed (Def)", "side": "defense",
     "numer_expr": "pts_against", "denom_expr": "poss_against", "unit": "points",
     "higher_is": "bad_for_team", "min_sample": 150, "sort_order": 20},
    {"metric_id": "efg_def", "display_name": "Effective FG% Allowed (Def)", "side": "defense",
     "numer_expr": "fgm_against + 0.5 * tpm_against", "denom_expr": "fga_against", "unit": "rate",
     "higher_is": "bad_for_team", "min_sample": 100, "sort_order": 21},
    {"metric_id": "three_rate_def", "display_name": "Opp 3PA Rate (Def)", "side": "defense",
     "numer_expr": "tpa_against", "denom_expr": "fga_against", "unit": "rate",
     "higher_is": "neutral", "min_sample": 100, "sort_order": 22},
    {"metric_id": "three_pct_def", "display_name": "Opp 3P% (Def)", "side": "defense",
     "numer_expr": "tpm_against", "denom_expr": "tpa_against", "unit": "rate",
     "higher_is": "bad_for_team", "min_sample": 40, "sort_order": 23},
    {"metric_id": "to_rate_forced", "display_name": "TO Forced Rate (Def)", "side": "defense",
     "numer_expr": "to_against", "denom_expr": "poss_against", "unit": "rate",
     "higher_is": "good_for_team", "min_sample": 150, "sort_order": 24},
    {"metric_id": "dreb_pct", "display_name": "Def Rebound % (Def)", "side": "defense",
     "numer_expr": "reb_for - oreb_for", "denom_expr": "(reb_for - oreb_for) + oreb_against", "unit": "rate",
     "higher_is": "good_for_team", "min_sample": 50, "sort_order": 25},
]

_SPORT_UPSERT = text("""
    insert into sport (sport_id, display_name, period_kind, num_periods, has_drives, has_possessions)
    values (:sport_id, 'Basketball', 'half', 2, false, true)
    on conflict (sport_id) do nothing
""")
_SIT_UPSERT = text("""
    insert into situation_catalog (sport_id, situation_key, display_name, filter_json, sort_order)
    values (:sport_id, :situation_key, :display_name, cast(:filter_json as jsonb), :sort_order)
    on conflict (sport_id, situation_key) do update set
      display_name = excluded.display_name, filter_json = excluded.filter_json,
      sort_order = excluded.sort_order
""")
_METRIC_UPSERT = text("""
    insert into metric_catalog
      (metric_id, display_name, sport_id, source_table, side,
       numer_expr, denom_expr, unit, higher_is, min_sample, sort_order, is_active, agg, group_col)
    values
      (:metric_id, :display_name, :sport_id, :source_table, :side,
       :numer_expr, :denom_expr, :unit, :higher_is, :min_sample, :sort_order, true, 'ratio', null)
    on conflict (metric_id) do update set
      display_name = excluded.display_name, source_table = excluded.source_table,
      side = excluded.side, numer_expr = excluded.numer_expr, denom_expr = excluded.denom_expr,
      unit = excluded.unit, higher_is = excluded.higher_is, min_sample = excluded.min_sample,
      sort_order = excluded.sort_order, agg = excluded.agg, group_col = excluded.group_col
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
            conn.execute(_METRIC_UPSERT, {"sport_id": SPORT_ID, "source_table": _TBL, **m})
    eng.dispose()
    print(f"seeded {len(SITUATIONS)} situations + {len(METRICS)} metrics for sport '{SPORT_ID}'")
    revalidate("catalog", "metrics")


if __name__ == "__main__":
    main()
