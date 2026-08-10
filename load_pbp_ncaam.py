"""Scrape NCAA men's basketball play-by-play from ESPN's JSON API.

Replaces the cbbpy HTML scraper (dead since ESPN removed the embedded page JSON —
"JSON not found on page"). Uses the stable site.api.espn.com endpoints instead:

    scoreboard?dates=YYYYMMDD&groups=50&limit=500   -> D1 game ids for a date
    summary?event=<game_id>                          -> plays + teams

Output matches the season-folder convention the analysis pipeline already reads:
<outdir>/pbp_data_raw.csv + <outdir>/info_data_raw.csv, with play_type normalized
to the historical vocabulary (foul / free throw / rebound / turnover / ...) so one
downstream builder handles every season identically.

Resumable: each fully-scraped date is recorded in <outdir>/scrape_ledger.txt and
skipped on re-run, so a crash or Ctrl+C loses at most one date.

    python load_pbp_ncaam.py                          # full 2025-26 season
    python load_pbp_ncaam.py --start 2026-01-01 --end 2026-01-31
"""

import argparse
import csv
import os
import time
from datetime import date, timedelta

import requests

BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball"
NCAAM_DIR = os.environ.get(
    "NCAAM_DIR", r"C:\Users\colte\Claude Workspace\Sportsbetting\NCAAM"
)
DEF_OUTDIR = os.path.join(NCAAM_DIR, "2025-26")

PBP_FIELDS = [
    "game_id", "home_team", "away_team", "play_desc", "home_score", "away_score",
    "half", "secs_left_half", "secs_left_reg", "play_team", "play_type",
    "shooting_play", "scoring_play", "is_three",
]
INFO_FIELDS = [
    "game_id", "game_status", "home_team", "home_score", "away_team", "away_score",
    "num_ots", "is_neutral", "game_day",
]

# NOTE: keep the default python-requests User-Agent. ESPN's CDN 403s browser-style
# UAs coming from scripts (verified empirically) while the plain default passes.
SESSION = requests.Session()


def get_json(url: str, tries: int = 4) -> dict | None:
    for i in range(tries):
        try:
            r = SESSION.get(url, timeout=20)
            if r.status_code == 200:
                return r.json()
        except requests.RequestException:
            pass
        time.sleep(1.5 * (i + 1))
    return None


# ESPN type.text -> the historical play_type vocabulary. ESPN squashes names
# ("MadeFreeThrow", "JumpShot"), so match on the lowercased text with spaces
# removed. Checked in order; first hit wins. Unmatched types pass through
# lowercased (harmless downstream — the builders key on foul / free throw /
# rebound / turnover / made-shot flags).
TYPE_MAP = [
    ("freethrow", "free throw"),
    ("foul", "foul"),
    ("rebound", "rebound"),
    ("turnover", "turnover"),
    ("steal", "steal"),
    ("block", "block"),
    ("timeout", "timeout"),
    ("tipshot", "two point tip shot"),
    ("dunk", "dunk"),
    ("layup", "layup"),
    ("threepoint", "three point jumper"),
    ("jumpshot", "jumper"),
    ("jumper", "jumper"),
    ("endof", "end"),
    ("substitution", "substitution"),  # dropped at scrape time — no analytical value
]


def norm_type(t: str) -> str:
    squashed = (t or "").lower().replace(" ", "")
    for key, out in TYPE_MAP:
        if key in squashed:
            return out
    return (t or "").lower() or "other"


def parse_clock(v: str) -> int | None:
    try:
        if ":" in v:
            m, s = v.split(":")
            return int(m) * 60 + int(float(s))
        return int(float(v))
    except (ValueError, AttributeError):
        return None


def scrape_game(gid: str, gdate: str) -> tuple[list[dict], dict | None]:
    d = get_json(f"{BASE}/summary?event={gid}")
    if not d:
        return [], None
    comps = (d.get("header", {}).get("competitions") or [{}])[0]
    teams = {c.get("id"): c.get("team", {}).get("displayName")
             for c in comps.get("competitors", [])}
    home = away = None
    home_final = away_final = None
    for c in comps.get("competitors", []):
        name = c.get("team", {}).get("displayName")
        score = c.get("score")
        if c.get("homeAway") == "home":
            home, home_final = name, score
        else:
            away, away_final = name, score
    if not home or not away:
        return [], None

    rows = []
    max_period = 2
    for p in d.get("plays", []):
        period = (p.get("period") or {}).get("number")
        secs = parse_clock((p.get("clock") or {}).get("displayValue", ""))
        if period is None or secs is None:
            continue
        max_period = max(max_period, period)
        team_name = teams.get((p.get("team") or {}).get("id"))
        ttext = (p.get("type") or {}).get("text", "")
        ptype = norm_type(ttext)
        if ptype == "substitution":  # ~30% of rows, no analytical value
            continue
        pts_att = p.get("pointsAttempted") or 0
        rows.append({
            "game_id": gid, "home_team": home, "away_team": away,
            "play_desc": p.get("text", ""),
            "home_score": p.get("homeScore"), "away_score": p.get("awayScore"),
            "half": period, "secs_left_half": secs,
            "secs_left_reg": secs + 1200 if period == 1 else secs,
            "play_team": team_name or "",
            "play_type": ptype,
            "shooting_play": bool(p.get("shootingPlay")),
            "scoring_play": bool(p.get("scoringPlay")),
            "is_three": pts_att == 3 or p.get("scoreValue") == 3,
        })
    info = {
        "game_id": gid, "game_status": "final",
        "home_team": home, "home_score": home_final,
        "away_team": away, "away_score": away_final,
        "num_ots": max(0, max_period - 2),
        "is_neutral": comps.get("neutralSite", False),
        "game_day": gdate,
    }
    return rows, info


def scrape_date(day: date) -> tuple[list[dict], list[dict], int, bool]:
    ymd = day.strftime("%Y%m%d")
    sb = get_json(f"{BASE}/scoreboard?dates={ymd}&groups=50&limit=500")
    if sb is None:  # scoreboard fetch failed — do NOT mark this date done
        return [], [], 0, False
    events = sb.get("events", [])
    pbp_rows: list[dict] = []
    info_rows: list[dict] = []
    skipped = 0
    for ev in events:
        status = (((ev.get("status") or {}).get("type")) or {})
        if not status.get("completed"):
            skipped += 1
            continue
        rows, info = scrape_game(ev["id"], day.isoformat())
        if rows and info:
            pbp_rows.extend(rows)
            info_rows.append(info)
        else:
            skipped += 1
        time.sleep(0.3)  # be polite; ~6k games/season ≈ 2h total
    return pbp_rows, info_rows, skipped, True


def append_csv(path: str, fields: list[str], rows: list[dict]) -> None:
    new = not os.path.exists(path)
    with open(path, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        if new:
            w.writeheader()
        w.writerows(rows)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2025-11-03")
    ap.add_argument("--end", default="2026-04-06")
    ap.add_argument("--outdir", default=DEF_OUTDIR)
    args = ap.parse_args()
    os.makedirs(args.outdir, exist_ok=True)

    ledger_path = os.path.join(args.outdir, "scrape_ledger.txt")
    done = set()
    if os.path.exists(ledger_path):
        with open(ledger_path, encoding="utf-8") as f:
            done = {line.strip() for line in f if line.strip()}

    day = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end)
    total_games = 0
    while day <= end:
        key = day.isoformat()
        if key in done:
            day += timedelta(days=1)
            continue
        pbp_rows, info_rows, skipped, ok = scrape_date(day)
        if not ok:
            print(f"{key}: SCOREBOARD FETCH FAILED — will retry on next run", flush=True)
            day += timedelta(days=1)
            continue
        append_csv(os.path.join(args.outdir, "pbp_data_raw.csv"), PBP_FIELDS, pbp_rows)
        append_csv(os.path.join(args.outdir, "info_data_raw.csv"), INFO_FIELDS, info_rows)
        with open(ledger_path, "a", encoding="utf-8") as f:
            f.write(key + "\n")
        total_games += len(info_rows)
        print(f"{key}: {len(info_rows)} games ({len(pbp_rows)} plays, {skipped} skipped) "
              f"— {total_games} total", flush=True)
        day += timedelta(days=1)
    print(f"DONE: {total_games} games this run -> {args.outdir}")


if __name__ == "__main__":
    main()
