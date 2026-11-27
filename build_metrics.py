"""Metric precompute engine -- the heart of the dashboard.

For each active metric x situation x team x season it computes the team's value,
then the CROSS-TEAM distribution (mean/std/percentiles/histogram) and each team's
placement on that curve (z-score, percentile, rank, tail flag). Results are written
to the pre-calculated tables team_metrics + metric_distribution, which are the only
thing the web app reads.

    python build_metrics.py                 # all active leagues, all seasons
    python build_metrics.py --league ncaaf --season 2024

Idempotent: delete-then-append per (league, season), mirroring the feeder builders.
"""

import argparse
import json
import math

import numpy as np
import pandas as pd
from sqlalchemy import text

from db import engine_from_env, revalidate

ROBUST_Z = 2.0   # |modified z| (median/MAD, skew-robust) for a true-outlier "tail". Tunable.
MIN_GAMES = 3    # a team needs this many games in the dataset to join the curve /
                 # be tail-flagged. Excludes 1-2 game FCS "cameo" opponents whose
                 # tiny samples would otherwise pollute the tails on any metric.
TRIM_Z = 3.5     # within-team |modified z| (median/MAD) above which a single row
                 # (e.g. a drive) is an outlier and dropped before a 'trimmed_mean'
                 # metric averages — i.e. "the average minus the outliers". 3.5 is the
                 # textbook modified-z outlier cutoff (Iglewicz–Hoaglin); raise to trim
                 # less, lower to trim more. Tunable.


def feature_table(league_id: str, logical_name: str) -> str:
    """Resolve a catalog source_table to the actual table for a league.

    NCAAF's feature tables are named plainly (quarter_log/drive_log) and hold only
    NCAAF, so the logical name IS the table. Future leagues with their own tables
    register a mapping here. (Extension point -- not over-built for v1.)
    """
    return logical_name


def apply_filter(df: pd.DataFrame, filt: dict) -> pd.DataFrame:
    """Row filter from a situation's filter_json. Scalar => ==, list => IN.

    A filter on a column the source table doesn't have yields an empty frame
    (that metric/situation simply produces nothing).
    """
    for col, val in (filt or {}).items():
        if col not in df.columns:
            return df.iloc[0:0]
        series = df[col].astype(str)
        if isinstance(val, list):
            df = df[series.isin([str(x) for x in val])]
        else:
            df = df[series == str(val)]
    return df


def _robust_mean(vals: pd.Series) -> tuple[float, int]:
    """Mean after dropping within-group outliers via median/MAD modified-z >= TRIM_Z.

    Returns (mean_of_kept, n_kept); falls back to the plain mean when MAD is 0.
    """
    v = pd.to_numeric(vals, errors="coerce").dropna().to_numpy(dtype=float)
    if v.size == 0:
        return float("nan"), 0
    med = float(np.median(v))
    mad = float(np.median(np.abs(v - med)))
    if mad > 0:
        keep = v[np.abs(0.6745 * (v - med) / mad) < TRIM_Z]
        if keep.size:
            return float(keep.mean()), int(keep.size)
    return float(v.mean()), int(v.size)


def compute_team_values(sub: pd.DataFrame, metric) -> pd.DataFrame:
    """Per-team value for one metric over already-filtered rows.

    agg='ratio' (default): value = sum(numer_expr) / sum(denom_expr) (or simple mean
      if no denom); sample_size = the summed denominator (exposure / # of trials).
    agg='trimmed_mean': per group, the mean of numer_expr AFTER dropping within-group
      outliers (median/MAD, TRIM_Z) — the "average minus outliers"; sample_size = the
      # of rows kept.
    group_col selects the grouping: 'team' (default) or 'opponent' (a defense-allowed
      view over a per-event table like drive_log, which has no _against columns).
    """
    sub = sub.copy()
    gcol = metric.get("group_col")
    if not isinstance(gcol, str) or not gcol:
        gcol = "team"
    agg = metric.get("agg")
    if not isinstance(agg, str) or not agg:
        agg = "ratio"
    sub["__numer"] = pd.to_numeric(sub.eval(metric["numer_expr"], engine="python"), errors="coerce")

    if agg == "trimmed_mean":
        rows = []
        for key, part in sub.groupby(gcol):
            val, kept = _robust_mean(part["__numer"])
            rows.append({"team": key, "value": val, "numer": val,
                         "sample_size": kept, "games": int(part["game_id"].nunique())})
        g = pd.DataFrame(rows)
        if not g.empty:
            g = g[g["sample_size"] > 0].set_index("team")
        return g

    denom_expr = metric.get("denom_expr")
    if isinstance(denom_expr, str) and denom_expr.strip():
        sub["__denom"] = pd.to_numeric(sub.eval(denom_expr, engine="python"), errors="coerce")
    else:
        sub["__denom"] = 1.0
    g = sub.groupby(gcol).agg(
        numer=("__numer", "sum"),
        denom=("__denom", "sum"),
        games=("game_id", "nunique"),
    )
    g = g[g["denom"] > 0].copy()
    g["value"] = g["numer"] / g["denom"]
    g["sample_size"] = g["denom"].round().astype(int)
    g.index.name = "team"
    return g


def _histogram(vals: np.ndarray) -> list:
    n = len(vals)
    nbins = int(min(20, max(8, round(n / 8)))) if n >= 8 else max(1, n)
    counts, edges = np.histogram(vals, bins=nbins)
    return [{"lo": round(float(edges[i]), 6), "hi": round(float(edges[i + 1]), 6),
             "count": int(counts[i])} for i in range(len(counts))]


def build(leagues: list[str] | None = None, seasons: list[int] | None = None) -> None:
    eng = engine_from_env()
    with eng.connect() as conn:
        metrics = pd.read_sql_query(text(
            "select * from metric_catalog where is_active = true order by sort_order"), conn)
        situations = pd.read_sql_query(text(
            "select * from situation_catalog order by sort_order"), conn)
        leagues_df = pd.read_sql_query(text(
            "select league_id, sport_id from league where is_active = true"), conn)

    if leagues:
        leagues_df = leagues_df[leagues_df["league_id"].isin(leagues)]
    if leagues_df.empty:
        print("no active leagues to process"); return

    for _, lg in leagues_df.iterrows():
        league_id, sport_id = lg["league_id"], lg["sport_id"]
        mset = metrics[metrics["sport_id"] == sport_id]
        sset = situations[situations["sport_id"] == sport_id]
        if mset.empty or sset.empty:
            print(f"[{league_id}] no metrics/situations for sport '{sport_id}', skipping"); continue

        # load each referenced feature table once
        sources: dict[str, pd.DataFrame] = {}
        for tbl in sorted(mset["source_table"].unique()):
            real = feature_table(league_id, tbl)
            try:
                with eng.connect() as conn:
                    sources[tbl] = pd.read_sql_query(text(f"select * from {real}"), conn)
            except Exception as e:
                print(f"[{league_id}] could not read feature table '{real}': {e}")

        # seasons present across loaded sources
        avail = sorted({int(s) for df in sources.values() if "season" in df
                        for s in pd.to_numeric(df["season"], errors="coerce").dropna().unique()})
        todo = [s for s in avail if (not seasons or s in seasons)]
        if not todo:
            print(f"[{league_id}] no seasons to process"); continue

        # parse situation filters once
        sit_filters = []
        for _, s in sset.iterrows():
            f = s["filter_json"]
            f = json.loads(f) if isinstance(f, str) else (f or {})
            sit_filters.append((s["situation_key"], f))

        for season in todo:
            tm_rows, dist_rows, n_tail = [], [], 0
            for _, metric in mset.iterrows():
                src = sources.get(metric["source_table"])
                if src is None or "season" not in src:
                    continue
                df_season = src[pd.to_numeric(src["season"], errors="coerce") == season]
                if df_season.empty:
                    continue
                min_sample = int(metric["min_sample"])
                for situation_key, filt in sit_filters:
                    sub = apply_filter(df_season, filt)
                    if sub.empty:
                        continue
                    try:
                        g = compute_team_values(sub, metric)
                    except Exception as e:
                        print(f"[{league_id} {season}] metric '{metric['metric_id']}' failed: {e}")
                        break  # bad expr -> skip this metric entirely
                    if g.empty:
                        continue

                    qual = g[(g["sample_size"] >= min_sample) & (g["games"] >= MIN_GAMES)]
                    n = len(qual)
                    has_dist = n >= 2
                    if has_dist:
                        vals_sorted = np.sort(qual["value"].to_numpy())
                        mean = float(qual["value"].mean())
                        std = float(qual["value"].std(ddof=0))
                        rank_map = {t: i + 1 for i, t in
                                    enumerate(qual["value"].sort_values(ascending=False).index)}
                        p10, p25, p50, p75, p90 = (float(x) for x in
                                                   np.percentile(vals_sorted, [10, 25, 50, 75, 90]))
                        mad = float(np.median(np.abs(vals_sorted - p50)))  # median abs deviation
                        dist_rows.append({
                            "league_id": league_id, "season": int(season),
                            "metric_id": metric["metric_id"], "situation_key": situation_key,
                            "n_teams": n, "mean": mean, "std": std,
                            "val_min": float(vals_sorted[0]), "val_max": float(vals_sorted[-1]),
                            "p10": p10, "p25": p25, "p50": p50, "p75": p75, "p90": p90,
                            "histogram": json.dumps(_histogram(vals_sorted)),
                        })

                    for team, row in g.iterrows():
                        val = float(row["value"]); ss = int(row["sample_size"])
                        is_qual = ss >= min_sample and int(row["games"]) >= MIN_GAMES
                        if has_dist and std > 0:
                            z = (val - mean) / std
                        elif has_dist:
                            z = 0.0
                        else:
                            z = None
                        # skew-robust outlier score: modified z via median + MAD
                        if has_dist and mad > 0:
                            rz = 0.6745 * (val - p50) / mad
                        elif has_dist:
                            rz = 0.0
                        else:
                            rz = None
                        pctile = (float(np.searchsorted(vals_sorted, val, side="right")) / n * 100.0
                                  if has_dist else None)
                        is_tail = bool(is_qual and rz is not None and abs(rz) >= ROBUST_Z)
                        if is_tail:
                            n_tail += 1
                        tm_rows.append({
                            "league_id": league_id, "season": int(season), "team": team,
                            "metric_id": metric["metric_id"], "situation_key": situation_key,
                            "value": val, "sample_size": ss,
                            "numerator": round(float(row["numer"]), 3),
                            "league_n": n if has_dist else None,
                            "pctile": (round(pctile, 2) if pctile is not None else None),
                            "zscore": (round(z, 4) if z is not None else None),
                            "rank": (rank_map.get(team) if is_qual and has_dist else None),
                            "is_tail": is_tail,
                            "tail_side": ("high" if rz and rz > 0 else "low") if is_tail else None,
                            "low_sample": (not is_qual),
                        })

            with eng.begin() as conn:
                conn.execute(text("delete from team_metrics where league_id=:l and season=:s"),
                             {"l": league_id, "s": int(season)})
                conn.execute(text("delete from metric_distribution where league_id=:l and season=:s"),
                             {"l": league_id, "s": int(season)})
                if tm_rows:
                    tdf = pd.DataFrame(tm_rows)
                    tdf = tdf.astype(object).where(pd.notnull(tdf), None)
                    tdf.to_sql("team_metrics", conn, if_exists="append", index=False,
                               method="multi", chunksize=500)
                if dist_rows:
                    conn.execute(text("""
                        insert into metric_distribution
                          (league_id, season, metric_id, situation_key, n_teams, mean, std,
                           val_min, p10, p25, p50, p75, p90, val_max, histogram)
                        values
                          (:league_id,:season,:metric_id,:situation_key,:n_teams,:mean,:std,
                           :val_min,:p10,:p25,:p50,:p75,:p90,:val_max, cast(:histogram as jsonb))
                    """), dist_rows)
            print(f"[{league_id} {season}] {len(tm_rows):,} team-metric rows, "
                  f"{len(dist_rows)} curves, {n_tail} tail flags")

    eng.dispose()
    revalidate("metrics")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", action="append", help="league_id (repeatable); default = all active")
    ap.add_argument("--season", type=int, action="append", help="season (repeatable); default = all")
    args = ap.parse_args()
    build(leagues=args.league, seasons=args.season)


if __name__ == "__main__":
    main()
