"""Precompute NCAAM team late-game situational stats into `ncaam_team_situation`.

For each game and each of four late-game windows (final 4:00 of H1, 8:00-4:00 of
H2, 4:00-2:00 of H2, final 2:00 of H2) the script takes the score STATE at the
window start, identifies the leader and trailer, and accumulates what each side
did inside the window: points scored/allowed, possessions, fouls committed, and
free throws. Aggregated per (season, team, role, window, margin band), this is
the team-conditioned layer the late-game totals model blends with the
league-wide `ncaam_anchor` distributions.

    python build_team_situation.py --all                 # seasons 2022..2025
    python build_team_situation.py --season 2025         # one season, default path
    python build_team_situation.py --season 2025 --pbp <path>
    python build_team_situation.py --season 2025 --debug-game <game_id>   # print, no DB write

Windows in secs_left_reg terms (full-regulation clock: half 1 spans 2400..1200,
half 2 spans 1200..0):

    h1_0_240   = [1440, 1200]   final 4:00 of half 1
    h2_240_480 = [ 480,  240]   8:00 -> 4:00 of half 2
    h2_120_240 = [ 240,  120]   4:00 -> 2:00 of half 2
    h2_0_120   = [ 120,    0]   final 2:00 of half 2

State = running score at the last play with secs_left_reg >= window_start; a tie
at the window start skips that game-window (no leader). Window plays are those
with window_end <= secs_left_reg < window_start; points inside the window are
the running score at the window close (last play with secs_left_reg >=
window_end) minus the state score, so overtime never leaks in. Possessions use
the standard estimate FGA - OREB + TO + 0.44*FTA with offensive rebounds
inferred as a rebound by the team that took the most recent shot attempt.

Idempotent: delete-then-append per season, mirroring build_lategame.py.
"""

import argparse
import os

import numpy as np
import pandas as pd
from sqlalchemy import text

from db import engine_from_env, revalidate

LEAGUE_ID = "ncaam"
NCAAM_DIR = os.environ.get(
    "NCAAM_DIR", r"C:\Users\colte\Claude Workspace\Sportsbetting\NCAAM"
)

# season label -> default play-by-play file (2025 = the 2024-25 season)
SEASON_FILES = {
    2022: os.path.join(NCAAM_DIR, "2021-22", "6min_pbp_data_step5.csv"),
    2023: os.path.join(NCAAM_DIR, "2022-23", "6min_pbp_data_step5.csv"),
    2024: os.path.join(NCAAM_DIR, "2023-24", "6min_pbp_data_step5.csv"),
    2025: os.path.join(NCAAM_DIR, "2024-25", "6min_pbp_data_step5.csv"),
    2026: os.path.join(NCAAM_DIR, "2025-26", "pbp_data_raw.csv"),  # mid-scrape; same columns
}
ALL_SEASONS = (2022, 2023, 2024, 2025)  # what --all runs (2026 is still scraping)

PBP_COLS = ["game_id", "home_team", "away_team", "home_score", "away_score",
            "half", "secs_left_reg", "play_team", "play_type", "scoring_play",
            "is_three"]

FG_TYPES = {"three point jumper", "jumper", "layup", "dunk", "two point tip shot"}

# (window_key, window_start, window_end, window_minutes) in secs_left_reg terms
WINDOWS = [
    ("h1_0_240",   1440, 1200, 4.0),
    ("h2_240_480",  480,  240, 4.0),
    ("h2_120_240",  240,  120, 2.0),
    ("h2_0_120",    120,    0, 2.0),
]

DDL = """
create table if not exists ncaam_team_situation (
  season      integer not null,           -- 2025 = the 2024-25 season
  team        text    not null,           -- ESPN displayName, matches ncaam_anchor
  role        text    not null,           -- 'lead' | 'trail' (state at window start)
  window_key  text    not null,           -- 'h1_0_240'|'h2_240_480'|'h2_120_240'|'h2_0_120'
  margin_band text    not null,           -- '1_3'|'4_6'|'7_12'|'13p'
  games       integer not null,
  minutes     real    not null,           -- observed window-minutes summed over games
  pts_for     real    not null,
  pts_against real    not null,
  poss        real    not null,           -- this team possessions in the windows (FGA-OREB+TO+0.44*FTA)
  fouls_committed real not null,
  fta         real    not null,
  ftm         real    not null,
  primary key (season, team, role, window_key, margin_band)
)
"""

COUNT_COLS = ["fga", "to", "oreb", "fouls_committed", "fta", "ftm"]


def load_pbp(path: str) -> pd.DataFrame:
    df = pd.read_csv(path, usecols=PBP_COLS)
    df["game_id"] = df["game_id"].astype(str)
    for c in ("home_score", "away_score", "secs_left_reg", "half"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=["home_score", "away_score", "secs_left_reg", "half"])
    df["half"] = df["half"].astype(int)
    df = df[df["half"].isin([1, 2])]  # regulation only; OT lives in half >= 3
    for c in ("scoring_play", "is_three"):
        df[c] = df[c].astype(str).str.lower().isin(("true", "1"))
    df = df.reset_index().rename(columns={"index": "_ord"})
    # global game timeline: half asc, clock desc, file order for ties
    return df.sort_values(["game_id", "half", "secs_left_reg", "_ord"],
                          ascending=[True, True, False, True], ignore_index=True)


def margin_band(margin: pd.Series) -> pd.Series:
    return pd.cut(margin, bins=[0, 3, 6, 12, np.inf],
                  labels=["1_3", "4_6", "7_12", "13p"]).astype(str)


def per_play_counts(tl: pd.DataFrame) -> pd.DataFrame:
    """Per-play counting flags over the full game timeline (OREB needs the whole
    timeline for the last-shooter ffill, same inference as build_ncaam_features)."""
    pt = tl["play_type"].astype(str)
    is_fg = pt.isin(FG_TYPES)
    is_ft = pt.eq("free throw")
    is_reb = pt.eq("rebound")

    shooter = tl["play_team"].where(is_fg | is_ft)
    last_shooter = shooter.groupby(tl["game_id"]).ffill()
    is_oreb = is_reb & (tl["play_team"] == last_shooter)

    return pd.DataFrame({
        "game_id": tl["game_id"], "secs": tl["secs_left_reg"], "team": tl["play_team"],
        "fga": is_fg.astype(int),
        "to": pt.eq("turnover").astype(int),
        "oreb": is_oreb.astype(int),
        "fouls_committed": pt.eq("foul").astype(int),
        "fta": is_ft.astype(int),
        "ftm": (is_ft & tl["scoring_play"]).astype(int),
    })


def window_observations(tl: pd.DataFrame, counts: pd.DataFrame,
                        key: str, start: int, end: int, mins: float) -> pd.DataFrame:
    """One row per (game, side) for a single window: the leader row and the
    trailer row, each with own points, opponent points, and own counts."""
    secs = tl["secs_left_reg"]
    teams = tl.groupby("game_id")[["home_team", "away_team"]].first()

    # state = running score at the last play on/before the window start,
    # close = running score at the last play on/before the window end
    st = tl[secs >= start].groupby("game_id").agg(
        state_h=("home_score", "last"), state_a=("away_score", "last"))
    cl = tl[secs >= end].groupby("game_id").agg(
        close_h=("home_score", "last"), close_a=("away_score", "last"))
    obs = teams.join(st, how="inner").join(cl, how="inner").reset_index()

    obs["margin"] = (obs["state_h"] - obs["state_a"]).abs()
    obs = obs[obs["margin"] > 0].copy()  # tie at window start -> no leader, skip
    if obs.empty:
        return pd.DataFrame()
    home_leads = obs["state_h"] > obs["state_a"]
    obs["leader"] = np.where(home_leads, obs["home_team"], obs["away_team"])
    obs["trailer"] = np.where(home_leads, obs["away_team"], obs["home_team"])
    obs["lead_pts"] = np.where(home_leads, obs["close_h"] - obs["state_h"],
                               obs["close_a"] - obs["state_a"])
    obs["trail_pts"] = np.where(home_leads, obs["close_a"] - obs["state_a"],
                                obs["close_h"] - obs["state_h"])
    obs["margin_band"] = margin_band(obs["margin"])

    # per-team counting stats inside the window
    w = counts[(counts["secs"] >= end) & (counts["secs"] < start)]
    c = w.groupby(["game_id", "team"], as_index=False)[COUNT_COLS].sum()

    sides = []
    for role, team_col, pf, pa in (("lead", "leader", "lead_pts", "trail_pts"),
                                   ("trail", "trailer", "trail_pts", "lead_pts")):
        side = obs[["game_id", team_col, "margin_band", pf, pa]].rename(
            columns={team_col: "team", pf: "pts_for", pa: "pts_against"})
        side = side.merge(c, on=["game_id", "team"], how="left")
        side[COUNT_COLS] = side[COUNT_COLS].fillna(0.0)
        side["role"] = role
        sides.append(side)
    out = pd.concat(sides, ignore_index=True)
    out["window_key"] = key
    out["minutes"] = mins
    out["poss"] = out["fga"] - out["oreb"] + out["to"] + 0.44 * out["fta"]
    return out


def build_observations(df: pd.DataFrame) -> pd.DataFrame:
    counts = per_play_counts(df)
    parts = [window_observations(df, counts, key, start, end, mins)
             for key, start, end, mins in WINDOWS]
    return pd.concat([p for p in parts if not p.empty], ignore_index=True)


def build(season: int, pbp_csv: str, debug_game: str | None = None) -> None:
    print(f"reading {pbp_csv}")
    df = load_pbp(pbp_csv)
    print(f"  {len(df):,} regulation plays across {df['game_id'].nunique():,} games")

    if debug_game:
        df = df[df["game_id"] == str(debug_game)]
        if df.empty:
            raise SystemExit(f"game_id {debug_game} not found in {pbp_csv}")
        obs = build_observations(df)
        cols = ["game_id", "window_key", "team", "role", "margin_band",
                "pts_for", "pts_against", "poss", "fouls_committed", "fta", "ftm",
                "fga", "to", "oreb", "minutes"]
        with pd.option_context("display.width", 200, "display.max_columns", None):
            print(obs[cols].sort_values(["window_key", "role"]).to_string(index=False))
        print("(debug mode: nothing written)")
        return

    obs = build_observations(df)
    agg = (obs.groupby(["team", "role", "window_key", "margin_band"], as_index=False)
              .agg(games=("game_id", "size"), minutes=("minutes", "sum"),
                   pts_for=("pts_for", "sum"), pts_against=("pts_against", "sum"),
                   poss=("poss", "sum"), fouls_committed=("fouls_committed", "sum"),
                   fta=("fta", "sum"), ftm=("ftm", "sum")))
    agg.insert(0, "season", season)
    for c in ("minutes", "pts_for", "pts_against", "poss", "fouls_committed", "fta", "ftm"):
        agg[c] = agg[c].astype(float)

    eng = engine_from_env()
    with eng.begin() as conn:
        conn.execute(text(DDL))
        conn.execute(text("delete from ncaam_team_situation where season=:s"), {"s": season})
        agg.to_sql("ncaam_team_situation", conn, if_exists="append", index=False,
                   method="multi", chunksize=500)
    eng.dispose()
    print(f"[{LEAGUE_ID} {season}] wrote {len(agg):,} team-situation rows "
          f"({agg['team'].nunique():,} teams, {int(agg['games'].sum()):,} team-window obs)")
    revalidate("lategame")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2025, help="season label (2024-25 -> 2025)")
    ap.add_argument("--pbp", default=None, help="play-by-play CSV (default: by season)")
    ap.add_argument("--all", action="store_true", help=f"run every season in {ALL_SEASONS}")
    ap.add_argument("--debug-game", default=None,
                    help="print per-window observations for one game_id and exit (no DB write)")
    args = ap.parse_args()

    if args.all:
        for season in ALL_SEASONS:
            build(season, SEASON_FILES[season])
        return
    pbp = args.pbp or SEASON_FILES.get(args.season)
    if not pbp:
        raise SystemExit(f"no default PBP file for season {args.season}; pass --pbp")
    build(args.season, pbp, debug_game=args.debug_game)


if __name__ == "__main__":
    main()
