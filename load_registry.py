"""Populate the sport-agnostic registry (sport / league / team / game) for NCAAF
from the Supabase feature tables the feeder already maintains.

Nothing here depends on the NCAAF repo's local files -- everything is read from
Supabase, so the dashboard stays decoupled.

    python load_registry.py
"""

import math

import pandas as pd
from sqlalchemy import text

from db import engine_from_env

SPORT_ID = "football"
LEAGUE_ID = "ncaaf"


def _clean(v):
    """numpy/NaN -> native Python / None for binding."""
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if hasattr(v, "item"):  # numpy scalar
        v = v.item()
    if isinstance(v, float) and math.isnan(v):
        return None
    return v


def main() -> None:
    eng = engine_from_env()
    with eng.connect() as conn:
        dl = pd.read_sql_query(text(
            "select game_id, season, date, team, opponent, is_home from drive_log"
        ), conn)
        ql = pd.read_sql_query(text(
            "select game_id, team, points_for from quarter_log"
        ), conn)

    dl = dl.dropna(subset=["game_id", "team"]).copy()
    dl["is_home"] = dl["is_home"].map(lambda x: bool(x) if x is not None else None)

    # ---- teams: the set with their own feature rows (will get metrics) ------
    teams = sorted(dl["team"].dropna().unique().tolist())

    # ---- games: derive home/away from the is_home flag (vectorized) ---------
    home = dl[dl["is_home"] == True].drop_duplicates("game_id").set_index("game_id")   # noqa: E712
    away = dl[dl["is_home"] == False].drop_duplicates("game_id").set_index("game_id")  # noqa: E712
    idx = pd.Index(sorted(dl["game_id"].unique()), name="game_id")
    games = pd.DataFrame(index=idx)
    games["season"] = home["season"].reindex(idx).combine_first(away["season"].reindex(idx))
    games["date"] = home["date"].reindex(idx).combine_first(away["date"].reindex(idx))
    games["home_team"] = home["team"].reindex(idx).combine_first(away["opponent"].reindex(idx))
    games["away_team"] = home["opponent"].reindex(idx).combine_first(away["team"].reindex(idx))

    # final scores: sum points_for per (game, team)
    pts = ql.dropna(subset=["game_id", "team"]).groupby(["game_id", "team"], as_index=False)["points_for"].sum()
    pts_map = {(r.game_id, r.team): r.points_for for r in pts.itertuples()}
    games["home_points"] = [pts_map.get((g, t)) for g, t in zip(idx, games["home_team"])]
    games["away_points"] = [pts_map.get((g, t)) for g, t in zip(idx, games["away_team"])]

    first_season = int(dl["season"].dropna().min())

    with eng.begin() as conn:
        conn.execute(text("""
            insert into sport (sport_id, display_name, period_kind, num_periods, has_drives, has_possessions)
            values (:sid, 'Football', 'quarter', 4, true, false)
            on conflict (sport_id) do update set
              display_name = excluded.display_name, period_kind = excluded.period_kind,
              num_periods = excluded.num_periods, has_drives = excluded.has_drives
        """), {"sid": SPORT_ID})

        conn.execute(text("""
            insert into league (league_id, sport_id, display_name, level, is_active, first_season)
            values (:lid, :sid, 'NCAA Football', 'college', true, :fs)
            on conflict (league_id) do update set
              sport_id = excluded.sport_id, display_name = excluded.display_name,
              level = excluded.level, is_active = true, first_season = excluded.first_season
        """), {"lid": LEAGUE_ID, "sid": SPORT_ID, "fs": first_season})

        conn.execute(
            text("""insert into team (league_id, team_name) values (:lid, :name)
                    on conflict (league_id, team_name) do nothing"""),
            [{"lid": LEAGUE_ID, "name": t} for t in teams],
        )

        game_rows = []
        for gid, r in games.iterrows():
            d = _clean(r["date"])
            game_rows.append({
                "lid": LEAGUE_ID, "gid": str(gid), "season": _clean(r["season"]),
                "gdate": str(d)[:10] if d else None,
                "home": _clean(r["home_team"]), "away": _clean(r["away_team"]),
                "hp": _clean(r["home_points"]), "ap": _clean(r["away_points"]),
            })
        # only games with both team names resolved
        game_rows = [g for g in game_rows if g["home"] and g["away"]]
        conn.execute(text("""
            insert into game (league_id, game_id, season, game_date, start_time,
                              home_team, away_team, home_points, away_points, status)
            values (:lid, :gid, :season, cast(:gdate as date), null,
                    :home, :away, :hp, :ap, 'final')
            on conflict (league_id, game_id) do update set
              season = excluded.season, game_date = excluded.game_date,
              home_team = excluded.home_team, away_team = excluded.away_team,
              home_points = excluded.home_points, away_points = excluded.away_points,
              status = excluded.status
        """), game_rows)

    eng.dispose()
    print(f"registry loaded: 1 sport, 1 league, {len(teams)} teams, {len(game_rows)} games "
          f"(seasons from {first_season})")


if __name__ == "__main__":
    main()
