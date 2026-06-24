"""Ingest the game schedule from ESPN into the `game` registry table.

ESPN's scoreboard API returns team displayNames ("Texas Tech Red Raiders") that
match the names in the feature tables -> team_metrics, so slate matchups link
correctly. (CFBD's school-only "Texas Tech" would not match.)

    python load_schedule.py                 # current season (today's year)
    python load_schedule.py --season 2025
    python load_schedule.py --season 2026 --weeks 1-16
"""

import argparse
from datetime import datetime

import requests
from sqlalchemy import text

from db import engine_from_env

LEAGUE_ID = "ncaaf"
SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"
UA = {"User-Agent": "Mozilla/5.0 (sportsbetting-dashboard schedule loader)"}
_STATUS = {"pre": "scheduled", "in": "in_progress", "post": "final"}


def fetch_week(year: int, week: int) -> list[dict]:
    r = requests.get(SCOREBOARD, params={
        "dates": year, "seasontype": 2, "week": week, "groups": 80, "limit": 400,
    }, headers=UA, timeout=30)
    r.raise_for_status()
    return r.json().get("events", [])


def parse_event(ev: dict, year: int, week: int) -> dict | None:
    try:
        comp = ev["competitions"][0]
        status = _STATUS.get(comp["status"]["type"]["state"], "scheduled")
        home = away = hp = ap = None
        for c in comp["competitors"]:
            name = c["team"]["displayName"]
            score = c.get("score")
            pts = int(score) if (status == "final" and score not in (None, "")) else None
            if c["homeAway"] == "home":
                home, hp = name, pts
            else:
                away, ap = name, pts
        if not home or not away:
            return None
        d = ev.get("date")  # ISO timestamp, e.g. 2025-08-30T23:30Z
        return {
            "lid": LEAGUE_ID, "gid": str(ev["id"]), "season": year, "week": week,
            "gdate": (d or "")[:10] or None, "start": d,
            "home": home, "away": away, "hp": hp, "ap": ap, "status": status,
        }
    except (KeyError, IndexError, ValueError):
        return None


UPSERT = text("""
    insert into game (league_id, game_id, season, week, game_date, start_time,
                      home_team, away_team, home_points, away_points, status)
    values (:lid, :gid, :season, :week, cast(:gdate as date), cast(:start as timestamptz),
            :home, :away, :hp, :ap, :status)
    on conflict (league_id, game_id) do update set
      season=excluded.season, week=excluded.week, game_date=excluded.game_date,
      start_time=excluded.start_time, home_team=excluded.home_team,
      away_team=excluded.away_team, home_points=excluded.home_points,
      away_points=excluded.away_points, status=excluded.status
""")


def build(season: int, weeks: range) -> None:
    eng = engine_from_env()
    rows = []
    for w in weeks:
        try:
            evs = fetch_week(season, w)
        except Exception as e:
            print(f"[{season} wk{w}] fetch failed: {e}")
            continue
        wk_rows = [r for r in (parse_event(e, season, w) for e in evs) if r]
        rows.extend(wk_rows)
        if wk_rows:
            print(f"[{season} wk{w}] {len(wk_rows)} games")
    if rows:
        with eng.begin() as conn:
            conn.execute(UPSERT, rows)
    eng.dispose()
    sched = sum(1 for r in rows if r["status"] == "scheduled")
    print(f"{season}: upserted {len(rows)} games ({sched} scheduled, {len(rows) - sched} final/live)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=datetime.now().year)
    ap.add_argument("--weeks", default="1-16")
    args = ap.parse_args()
    if "-" in args.weeks:
        lo, hi = (int(x) for x in args.weeks.split("-"))
    else:
        lo = hi = int(args.weeks)
    build(args.season, range(lo, hi + 1))


if __name__ == "__main__":
    main()
