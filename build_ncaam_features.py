"""Aggregate NCAAM play-by-play into the `ncaam_team_half` feature table.

One row per (season, game_id, team, half) with the team's own box stats (*_for)
and the opponent's (*_against), so build_metrics can compute offense and defense
metrics the same way it does for football's quarter_log. Everything downstream is
expressed as a RATIO (pts/poss, eFG, 3PA/FGA, ...) so it's correct whether summed
over the full game or filtered to a half.

    python build_ncaam_features.py                 # 2024-25 PBP, season 2025

Possessions use the standard estimate FGA - OREB + TO + 0.44*FTA; offensive
rebounds are inferred as a rebound by the team that just shot.
"""

import argparse
import os

import numpy as np
import pandas as pd
from sqlalchemy import text

from db import engine_from_env

LEAGUE_ID = "ncaam"
NCAAM_DIR = os.environ.get("NCAAM_DIR", r"C:\Users\colte\Claude Workspace\Sportsbetting\NCAAM")
DEF_PBP = os.path.join(NCAAM_DIR, "pbp_df_2024_2025_season.csv")
FG_TYPES = {"three point jumper", "jumper", "layup", "dunk", "two point tip shot"}

PBP_COLS = ["game_id", "home_team", "away_team", "half", "secs_left_reg",
            "play_team", "play_type", "scoring_play", "is_three"]

DDL = """
create table if not exists ncaam_team_half (
  season   integer not null,
  game_id  text    not null,
  team     text    not null,
  opponent text    not null,
  half     smallint not null,
  secs     integer not null,
  fga_for real, fgm_for real, tpa_for real, tpm_for real, fta_for real, ftm_for real,
  to_for real, reb_for real, oreb_for real, pts_for real, poss_for real,
  fga_against real, fgm_against real, tpa_against real, tpm_against real,
  fta_against real, ftm_against real, to_against real, reb_against real,
  oreb_against real, pts_against real, poss_against real,
  primary key (season, game_id, team, half)
)
"""


def load_pbp(path: str) -> pd.DataFrame:
    df = pd.read_csv(path, usecols=PBP_COLS)
    df["game_id"] = df["game_id"].astype(str)
    for c in ("half", "secs_left_reg"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=["half", "secs_left_reg", "play_team"])
    df["half"] = df["half"].astype(int)
    df = df[df["half"].isin([1, 2])]
    df["scoring_play"] = df["scoring_play"].astype(str).str.lower().isin(("true", "1"))
    df["is_three"] = df["is_three"].astype(str).str.lower().isin(("true", "1"))
    return df.reset_index().rename(columns={"index": "_ord"})


def per_team_offense(df: pd.DataFrame) -> pd.DataFrame:
    pt = df["play_type"].astype(str)
    is_fg = pt.isin(FG_TYPES)
    is_ft = pt.eq("free throw")
    is_reb = pt.eq("rebound")
    is_to = pt.eq("turnover")

    # offensive rebound = rebound grabbed by the team that just shot (ffill shooter team)
    shooter = df["play_team"].where(is_fg | is_ft)
    last_shooter = shooter.groupby(df["game_id"]).ffill()
    is_oreb = is_reb & (df["play_team"] == last_shooter)

    made = df["scoring_play"]
    three = is_fg & df["is_three"]
    f = pd.DataFrame({
        "game_id": df["game_id"], "half": df["half"], "team": df["play_team"],
        "fga": is_fg.astype(int), "fgm": (is_fg & made).astype(int),
        "tpa": three.astype(int), "tpm": (three & made).astype(int),
        "fta": is_ft.astype(int), "ftm": (is_ft & made).astype(int),
        "to": is_to.astype(int), "reb": is_reb.astype(int), "oreb": is_oreb.astype(int),
    })
    g = f.groupby(["game_id", "half", "team"], as_index=False).sum()
    g["pts"] = 3 * g["tpm"] + 2 * (g["fgm"] - g["tpm"]) + g["ftm"]
    g["poss"] = g["fga"] - g["oreb"] + g["to"] + 0.44 * g["fta"]
    return g


def build(season: int, pbp_csv: str) -> None:
    print(f"reading {pbp_csv}")
    df = load_pbp(pbp_csv)
    # canonical two teams per game (home/away names are constant per game)
    teams = df.groupby("game_id")[["home_team", "away_team"]].first()
    off = per_team_offense(df)
    print(f"  {off['game_id'].nunique():,} games, {len(off):,} (game,half,team) rows")

    stat_cols = ["fga", "fgm", "tpa", "tpm", "fta", "ftm", "to", "reb", "oreb", "pts", "poss"]
    rows = []
    for (gid, half), grp in off.groupby(["game_id", "half"]):
        if gid not in teams.index or len(grp) < 2:
            continue
        home, away = teams.loc[gid, "home_team"], teams.loc[gid, "away_team"]
        by_team = {r["team"]: r for _, r in grp.iterrows()}
        for team in (home, away):
            opp = away if team == home else home
            o = by_team.get(team)
            d = by_team.get(opp)
            if o is None or d is None:
                continue
            row = {"season": season, "game_id": gid, "team": team, "opponent": opp,
                   "half": int(half), "secs": 1200}
            for c in stat_cols:
                row[f"{c}_for"] = float(o[c])
                row[f"{c}_against"] = float(d[c])
            rows.append(row)

    out = pd.DataFrame(rows)
    eng = engine_from_env()
    with eng.begin() as conn:
        conn.execute(text(DDL))
        conn.execute(text("delete from ncaam_team_half where season=:s"), {"s": season})
        out.to_sql("ncaam_team_half", conn, if_exists="append", index=False,
                   method="multi", chunksize=400)
    eng.dispose()
    print(f"[{LEAGUE_ID} {season}] wrote {len(out):,} team-half rows")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2025)
    ap.add_argument("--pbp", default=DEF_PBP)
    args = ap.parse_args()
    build(args.season, args.pbp)


if __name__ == "__main__":
    main()
