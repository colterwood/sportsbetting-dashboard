"""Precompute the NCAAM late-game anchor table from play-by-play.

For every game and each regulation half it walks the scoring plays and emits one
anchor row per score state (plus a start-of-half row), recording the score
differential at that moment and how many points the leading team, the trailing
team, and both combined go on to score from there to the END OF THE HALF. The
/totals page snaps a live game state to the nearest anchor and aggregates the
matching rows into a conditional distribution -- the same idea as the HuggingFace
app's get_anchor_rows / summarize_anchor_rows, precomputed once.

    python build_lategame.py                 # 2024-25 files in the NCAAM folder, season 2025
    python build_lategame.py --season 2025 --pbp <path> --info <path>

Idempotent: delete-then-append per (league, season), mirroring build_metrics.py.
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
DEF_PBP = os.path.join(NCAAM_DIR, "pbp_df_2024_2025_season.csv")
DEF_INFO = os.path.join(NCAAM_DIR, "info_df_2024_2025_season.csv")

PBP_COLS = ["game_id", "home_team", "away_team", "home_score", "away_score",
            "half", "secs_left_reg", "scoring_play"]


def load_dates(info_csv: str) -> dict[str, object]:
    """game_id -> datetime.date (from info_df.game_day, e.g. 'November 04, 2024')."""
    if not os.path.exists(info_csv):
        print(f"  (no info file at {info_csv} -- dates will be null)")
        return {}
    info = pd.read_csv(info_csv, usecols=lambda c: c in ("game_id", "game_day"))
    info["game_id"] = info["game_id"].astype(str)
    dt = pd.to_datetime(info["game_day"], errors="coerce")
    return {gid: (d.date() if pd.notna(d) else None) for gid, d in zip(info["game_id"], dt)}


def load_pbp(pbp_csv: str) -> pd.DataFrame:
    df = pd.read_csv(pbp_csv, usecols=PBP_COLS)
    df["game_id"] = df["game_id"].astype(str)
    for c in ("home_score", "away_score", "secs_left_reg", "half"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=["home_score", "away_score", "secs_left_reg", "half"])
    df["half"] = df["half"].astype(int)
    df = df[df["half"].isin([1, 2])]  # regulation only; OT lives in half >= 3
    df["scoring_play"] = df["scoring_play"].astype(str).str.lower().isin(("true", "1"))
    return df.reset_index().rename(columns={"index": "_ord"})


def anchors_for_group(half: int, sub: pd.DataFrame, gdate, season: int,
                      start_home: int, start_away: int) -> pd.DataFrame:
    """All anchor rows for one (game, half): start-of-half state + each scoring play.

    Scores are monotonic so end-of-half = column max. The score ENTERING the half
    (start_home/start_away) is passed in: 0-0 for half 1, the halftime score for
    half 2 (carried from half 1, robust to missing opening plays). Each anchor's
    score is the POST-play running score; *_pts_after = end-of-half minus that,
    i.e. the points still to come in the half from that moment.
    """
    home, away = sub["home_team"].iloc[0], sub["away_team"].iloc[0]
    gid = sub["game_id"].iloc[0]
    sub = sub.sort_values(["secs_left_reg", "_ord"], ascending=[False, True])
    end_home, end_away = int(sub["home_score"].max()), int(sub["away_score"].max())
    # keep the entering score consistent with the half's own plays (guard against
    # missing data where a later running score dips below the carried halftime score)
    start_home = min(start_home, end_home)
    start_away = min(start_away, end_away)
    half_start = 2400 if half == 1 else 1200

    sp = sub[sub["scoring_play"]]
    # start-of-half state stacked on top of the scoring-play states
    h = np.concatenate([[start_home], sp["home_score"].to_numpy(float)])
    a = np.concatenate([[start_away], sp["away_score"].to_numpy(float)])
    s = np.concatenate([[half_start], sp["secs_left_reg"].to_numpy(float)])

    home_leads, away_leads = h > a, a > h
    lead_after = np.where(home_leads, end_home - h, np.where(away_leads, end_away - a, np.nan))
    trail_after = np.where(home_leads, end_away - a, np.where(away_leads, end_home - h, np.nan))
    return pd.DataFrame({
        "league_id": LEAGUE_ID, "season": season, "game_id": gid, "game_date": gdate,
        "home_team": home, "away_team": away, "half": half,
        "secs_left": s.astype(int),
        "score_diff": np.abs(h - a).astype(int),
        "leading_team": np.where(home_leads, home, np.where(away_leads, away, None)),
        "trailing_team": np.where(home_leads, away, np.where(away_leads, home, None)),
        "lead_pts_after": lead_after,
        "trail_pts_after": trail_after,
        "total_pts_after": ((end_home - h) + (end_away - a)).astype(int),
    })


def build(season: int, pbp_csv: str, info_csv: str) -> None:
    print(f"reading {pbp_csv}")
    df = load_pbp(pbp_csv)
    dates = load_dates(info_csv)
    print(f"  {len(df):,} regulation plays across {df['game_id'].nunique():,} games")

    # halftime score per game = end of half 1; used as the entering score for half 2
    h1 = df[df["half"] == 1].groupby("game_id")[["home_score", "away_score"]].max()
    halftime = {gid: (int(r.home_score), int(r.away_score)) for gid, r in h1.iterrows()}

    def start_score(gid: str, half: int) -> tuple[int, int]:
        return (0, 0) if half == 1 else halftime.get(gid, (0, 0))

    parts = [anchors_for_group(int(half), sub, dates.get(gid), season, *start_score(gid, int(half)))
             for (gid, half), sub in df.groupby(["game_id", "half"], sort=False)]
    out = pd.concat(parts, ignore_index=True)
    out = out.astype(object).where(pd.notnull(out), None)  # NaN/NaT -> None for psycopg2

    eng = engine_from_env()
    with eng.begin() as conn:
        conn.execute(text("delete from ncaam_anchor where league_id=:l and season=:s"),
                     {"l": LEAGUE_ID, "s": season})
        out.to_sql("ncaam_anchor", conn, if_exists="append", index=False,
                   method="multi", chunksize=500)
    eng.dispose()
    print(f"[{LEAGUE_ID} {season}] wrote {len(out):,} anchor rows")
    revalidate("lategame")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2025, help="season label (2024-25 -> 2025)")
    ap.add_argument("--pbp", default=DEF_PBP)
    ap.add_argument("--info", default=DEF_INFO)
    args = ap.parse_args()
    build(args.season, args.pbp, args.info)


if __name__ == "__main__":
    main()
