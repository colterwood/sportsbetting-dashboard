"""Ingest the NCAA men's basketball schedule from ESPN into the `game` table.

Basketball plays daily, so this loads by DATE (unlike load_schedule.py's weeks).
It also registers the basketball sport + ncaam league on first run (idempotent),
since the `game` rows FK to league(league_id).

    python load_schedule_ncaam.py                                  # today
    python load_schedule_ncaam.py --start 2024-11-04 --end 2024-12-20 --season 2025

ESPN displayNames ("Duke Blue Devils") match the names in pbp/ncaam_anchor, so the
slate links line up with the late-game tool and (later) team_metrics.
"""

import argparse
import time
from datetime import date, datetime, timedelta

import requests
from sqlalchemy import text

from db import engine_from_env, revalidate

LEAGUE_ID = "ncaam"
SPORT_ID = "basketball"
SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard"
UA = {"User-Agent": "Mozilla/5.0 (sportsbetting-dashboard ncaam schedule loader)"}
_STATUS = {"pre": "scheduled", "in": "in_progress", "post": "final"}

_SPORT_UPSERT = text("""
    insert into sport (sport_id, display_name, period_kind, num_periods, has_drives, has_possessions)
    values (:sid, 'Basketball', 'half', 2, false, true)
    on conflict (sport_id) do nothing
""")
_LEAGUE_UPSERT = text("""
    insert into league (league_id, sport_id, display_name, level, is_active, first_season)
    values (:lid, :sid, 'NCAAB', 'college', true, 2025)
    on conflict (league_id) do update set
      sport_id = excluded.sport_id, display_name = excluded.display_name,
      level = excluded.level, is_active = true
""")

UPSERT = text("""
    insert into game (league_id, game_id, season, week, game_date, start_time,
                      home_team, away_team, home_points, away_points, status)
    values (:lid, :gid, :season, null, cast(:gdate as date), cast(:start as timestamptz),
            :home, :away, :hp, :ap, :status)
    on conflict (league_id, game_id) do update set
      season=excluded.season, game_date=excluded.game_date, start_time=excluded.start_time,
      home_team=excluded.home_team, away_team=excluded.away_team,
      home_points=excluded.home_points, away_points=excluded.away_points, status=excluded.status
""")


def fetch_day(d: date) -> list[dict]:
    r = requests.get(SCOREBOARD, params={
        "dates": d.strftime("%Y%m%d"), "groups": 50, "limit": 500,
    }, headers=UA, timeout=30)
    r.raise_for_status()
    return r.json().get("events", [])


def parse_event(ev: dict, season: int) -> dict | None:
    try:
        comp = ev["competitions"][0]
        status = _STATUS.get(comp["status"]["type"]["state"], "scheduled")
        home = away = hp = ap = None
        for c in comp["competitors"]:
            name = c["team"]["displayName"]
            score = c.get("score")
            pts = int(score) if (status != "scheduled" and score not in (None, "")) else None
            if c["homeAway"] == "home":
                home, hp = name, pts
            else:
                away, ap = name, pts
        if not home or not away:
            return None
        d = ev.get("date")  # ISO timestamp
        return {"lid": LEAGUE_ID, "gid": str(ev["id"]), "season": season,
                "gdate": (d or "")[:10] or None, "start": d,
                "home": home, "away": away, "hp": hp, "ap": ap, "status": status}
    except (KeyError, IndexError, ValueError):
        return None


def season_for(d: date) -> int:
    return d.year + 1 if d.month >= 10 else d.year  # Nov 2024 -> 2025


def build(start: date, end: date, season: int | None) -> None:
    eng = engine_from_env()
    with eng.begin() as conn:
        conn.execute(_SPORT_UPSERT, {"sid": SPORT_ID})
        conn.execute(_LEAGUE_UPSERT, {"lid": LEAGUE_ID, "sid": SPORT_ID})

    rows, days = [], 0
    d = start
    while d <= end:
        sea = season if season is not None else season_for(d)
        try:
            evs = fetch_day(d)
        except Exception as e:
            print(f"[{d}] fetch failed: {e}")
            d += timedelta(days=1)
            continue
        day_rows = [r for r in (parse_event(e, sea) for e in evs) if r]
        if day_rows:
            rows.extend(day_rows)
            print(f"[{d}] {len(day_rows)} games")
        days += 1
        d += timedelta(days=1)
        time.sleep(0.15)

    if rows:
        with eng.begin() as conn:
            conn.execute(UPSERT, rows)
    eng.dispose()
    sched = sum(1 for r in rows if r["status"] == "scheduled")
    live = sum(1 for r in rows if r["status"] == "in_progress")
    print(f"{days} days: upserted {len(rows)} games "
          f"({sched} scheduled, {live} in-progress, {len(rows) - sched - live} final)")
    revalidate("schedule")


def main() -> None:
    ap = argparse.ArgumentParser()
    today = datetime.now().date()
    ap.add_argument("--start", type=lambda s: datetime.strptime(s, "%Y-%m-%d").date(), default=today)
    ap.add_argument("--end", type=lambda s: datetime.strptime(s, "%Y-%m-%d").date(), default=None)
    ap.add_argument("--season", type=int, default=None, help="override; else inferred from date")
    args = ap.parse_args()
    end = args.end or args.start
    build(args.start, end, args.season)


if __name__ == "__main__":
    main()
