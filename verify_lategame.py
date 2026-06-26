"""Sanity-check ncaam_anchor: counts, a start-of-half invariant, and the core
conditional-distribution query the /totals page will run.

    python verify_lategame.py
"""

from sqlalchemy import text

from db import engine_from_env

SEASON = 2025


def main() -> None:
    eng = engine_from_env()
    with eng.connect() as conn:
        n, g, d = conn.execute(text(
            "select count(*), count(distinct game_id), count(distinct game_date) "
            "from ncaam_anchor where season=:s"), {"s": SEASON}).one()
        print(f"rows={n:,}  games={g:,}  distinct_dates={d}")

        # Invariant: a start-of-half-1 row is the 0-0 tie, and its total_pts_after
        # equals the whole game's first-half combined points.
        bad = conn.execute(text(
            "select count(*) from ncaam_anchor "
            "where season=:s and half=1 and secs_left=2400 and score_diff<>0"), {"s": SEASON}).scalar()
        print(f"half-1 start rows that aren't 0-0 (should be 0): {bad}")

        # Core query: snap each game to its anchor at/just before T, then bucket by
        # the differential AT that anchor, then aggregate the outcome. The user
        # enters time-left-in-HALF; convert to secs_left_reg the way the UI will.
        def secs_left_reg(half, mm, ss):
            return (1200 if half == 1 else 0) + mm * 60 + ss

        def sample(half, mm, ss, lo, hi, col):
            t = secs_left_reg(half, mm, ss)
            row = conn.execute(text(f"""
                with picked as (
                  select distinct on (game_id) game_id, score_diff, {col} as outcome
                  from ncaam_anchor
                  where season=:s and half=:h and secs_left >= :t
                  order by game_id, secs_left asc
                )
                select count(*) n, round(avg(outcome)::numeric,2) mean,
                       round(stddev_samp(outcome)::numeric,2) sd,
                       percentile_cont(0.5) within group (order by outcome) p50,
                       min(outcome) lo, max(outcome) hi
                from picked where score_diff between :lo and :hi
            """), {"s": SEASON, "h": half, "t": t, "lo": lo, "hi": hi}).one()
            print(f"  half={half} {mm}:{ss:02d} left diff {lo}-{hi} [{col}] -> "
                  f"n={row.n} mean={row.mean} sd={row.sd} p50={row.p50} range=[{row.lo},{row.hi}]")

        print("\nconditional samples (points from the anchor to end of half):")
        sample(2, 4, 0, 1, 3, "total_pts_after")
        sample(2, 4, 0, 1, 3, "lead_pts_after")
        sample(2, 4, 0, 1, 3, "trail_pts_after")
        sample(2, 2, 0, 4, 6, "total_pts_after")
        sample(1, 4, 0, 1, 5, "total_pts_after")

        # Eyeball one game's late 2nd-half anchors.
        gid = conn.execute(text(
            "select game_id from ncaam_anchor where season=:s and half=2 "
            "order by random() limit 1"), {"s": SEASON}).scalar()
        print(f"\nsample game {gid}, 2nd-half anchors near 4:00:")
        rows = conn.execute(text(
            "select secs_left, score_diff, leading_team, lead_pts_after, trail_pts_after, total_pts_after "
            "from ncaam_anchor where game_id=:g and half=2 and secs_left between 200 and 280 "
            "order by secs_left desc"), {"g": gid}).all()
        for r in rows:
            print(f"  {r.secs_left}s diff={r.score_diff} lead={r.leading_team} "
                  f"L+{r.lead_pts_after} T+{r.trail_pts_after} tot+{r.total_pts_after}")
    eng.dispose()


if __name__ == "__main__":
    main()
