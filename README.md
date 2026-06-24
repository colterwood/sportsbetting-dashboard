# Sportsbetting Dashboard — Multi-Sport Outlier Finder

A fast, phone-friendly dashboard that finds **cross-team outliers**. For any metric
(e.g. *Q1 scoring-drive rate*), it computes the value for every team in a league,
lays them on a curve, and highlights the teams in the **tails** — the bet-for /
bet-against candidates. Stack multiple metrics to surface teams that are outliers
across several signals.

It is **sport-agnostic**: a league lights up automatically once its feature tables
and metric definitions exist. NCAAF is the first league online.

## Architecture

```
NCAAF feeder (../NCAAF)  ─►  quarter_log / drive_log  ─┐   (per-sport feature tables in Supabase)
other-sport feeders      ─►  <sport>_* tables  ────────┤
                                                       ▼
                       build_metrics.py  (reads Supabase, runs offline)
                                                       ▼
                 team_metrics + metric_distribution  (pre-calculated)
                                                       ▼
                          web/  (Next.js — reads only)
```

The web app **only reads pre-calculated rows** — all heavy aggregation happens
offline in `build_metrics.py`, so pages load instantly.

## Layout

| Path | What |
|---|---|
| `db.py` | Shared Supabase connection helper. |
| `setup_common_db.py` | Idempotent DDL: registry (sport/league/team/game) + metric tables. |
| `metrics/catalog_seed.py` | Metric + situation definitions (declarative; adding a metric = one row). |
| `load_registry.py` | Populates sport/league/team/game from the Supabase feature tables. |
| `build_metrics.py` | The precompute engine: per-team values + cross-team distributions. |
| `web/` | Next.js dashboard (Outlier Explorer, Team Profile, Slate). |

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env          # fill in SUPABASE_DB_URL (same project as the NCAAF feeder)

python setup_common_db.py     # create tables (idempotent)
python load_registry.py       # sport / league / team / game
python metrics/catalog_seed.py  # seed metric + situation definitions
python build_metrics.py       # compute team_metrics + metric_distribution
```

Then the web app:

```bash
cd web
npm install
cp .env.example .env.local    # NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

## Adding a metric

Insert a row into `metric_catalog` (or add to `metrics/catalog_seed.py`):
a numerator/denominator over a feature table + a situation filter. Re-run
`build_metrics.py`. No schema or UI change needed. A metric whose input columns
don't exist yet stays `is_active = false` until the feeder adds them.

## Refresh

`build_metrics.py` is idempotent (delete-then-append per league+season). Run it on a
schedule (after the feeders' daily update) or on demand. Distribution data only
changes when games finalize, so daily is sufficient.
