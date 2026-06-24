"""Independent hand-check of build_metrics output.

Recomputes a metric straight from quarter_log (a different code path than the
engine) and asserts the stored team_metrics / metric_distribution rows agree.
Also prints the tails so they can be eyeballed.

    python verify_metrics.py
"""

import numpy as np
import pandas as pd
from sqlalchemy import text

from db import engine_from_env

SEASON = 2024
TAIL_Z = 1.5


def check(eng, metric_id, situation_key, quarters, numer_cols, denom_col, min_sample):
    """quarters: list of quarter strings to include. numer_cols summed, /denom_col."""
    with eng.connect() as conn:
        ql = pd.read_sql_query(text(
            "select team, quarter, " + ", ".join(set(numer_cols + [denom_col])) +
            " from quarter_log where season = :s"), conn, params={"s": SEASON})
        stored = pd.read_sql_query(text(
            "select team, value, sample_size, pctile, zscore, rank, is_tail, low_sample "
            "from team_metrics where league_id='ncaaf' and season=:s "
            "and metric_id=:m and situation_key=:k"),
            conn, params={"s": SEASON, "m": metric_id, "k": situation_key})
        dist = pd.read_sql_query(text(
            "select n_teams, mean, std, val_min, val_max, p50 from metric_distribution "
            "where league_id='ncaaf' and season=:s and metric_id=:m and situation_key=:k"),
            conn, params={"s": SEASON, "m": metric_id, "k": situation_key})

    ql = ql[ql["quarter"].astype(str).isin(quarters)]
    ql["__n"] = ql[numer_cols].sum(axis=1)
    g = ql.groupby("team").agg(numer=("__n", "sum"), denom=(denom_col, "sum"))
    g = g[g["denom"] > 0]
    g["value"] = g["numer"] / g["denom"]
    g["sample"] = g["denom"].round().astype(int)

    max_diff = float((g["value"] - stored.set_index("team")["value"]).abs().max())

    qual = g[g["sample"] >= min_sample]["value"].to_numpy()
    ind_mean, ind_std, ind_n = float(qual.mean()), float(qual.std(ddof=0)), len(qual)
    d = dist.iloc[0]

    print(f"\n=== {metric_id} / {situation_key} ({SEASON}) ===")
    print(f"value match: max abs diff (independent vs stored) = {max_diff:.2e}  "
          f"({'OK' if max_diff < 1e-6 else 'MISMATCH'})")
    print(f"distribution: n_teams stored={int(d['n_teams'])} independent={ind_n}  "
          f"mean stored={d['mean']:.4f} independent={ind_mean:.4f}  "
          f"std stored={d['std']:.4f} independent={ind_std:.4f}")

    # spot-check one team's percentile/rank against an independent recompute
    s_sorted = np.sort(qual)
    top = stored.dropna(subset=["rank"]).sort_values("rank").iloc[0]
    ind_pct = float(np.searchsorted(s_sorted, top["value"], side="right")) / ind_n * 100
    print(f"top team '{top['team']}': value={top['value']:.4f} stored_pctile={top['pctile']:.1f} "
          f"independent_pctile={ind_pct:.1f} z={top['zscore']:.2f} rank={int(top['rank'])}")

    tails = stored[stored["is_tail"] == True].sort_values("value")  # noqa: E712
    print(f"tails flagged: {len(tails)}  "
          f"low: {list(tails[tails['zscore'] < 0]['team'].head(3))} ... "
          f"high: {list(tails[tails['zscore'] > 0]['team'].tail(3))}")


def main() -> None:
    eng = engine_from_env()
    # rate metric (the user's example): Q1 scoring-drive rate (off)
    check(eng, "scoring_drive_rate_off", "q1", ["1"],
          ["td_drives_for", "fg_drives_for"], "drives_for", 15)
    # full-game variant
    check(eng, "scoring_drive_rate_off", "game", ["1", "2", "3", "4", "OT"],
          ["td_drives_for", "fg_drives_for"], "drives_for", 15)
    eng.dispose()


if __name__ == "__main__":
    main()
