"""Shared Supabase Postgres connection helper for the dashboard analytics layer.

Mirrors NCAAF/setup_db.py:engine_from_env so both repos connect the same way.
The dashboard only ever READS the per-sport feature tables (quarter_log,
drive_log, ...) and READS/WRITES its own pre-calculated tables (team_metrics,
metric_distribution) + registry. It never mutates the feeders' tables.
"""

import os

from dotenv import load_dotenv
from sqlalchemy import create_engine

load_dotenv()


def engine_from_env():
    """Build a SQLAlchemy engine from SUPABASE_DB_URL (.env)."""
    url = os.getenv("SUPABASE_DB_URL")
    if not url:
        raise SystemExit("SUPABASE_DB_URL not set in .env (copy .env.example)")
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            url = "postgresql+psycopg2://" + url[len(prefix):]
            break
    return create_engine(url, pool_pre_ping=True, connect_args={"connect_timeout": 20})


def revalidate(*tags: str) -> None:
    """Best-effort: tell the web app to purge cached reads after a build, so the site
    reflects fresh data immediately instead of waiting for the cache TTL. No-op if the
    web app isn't reachable (the cache still expires on its own as a backstop).

    Tags: registry | catalog | metrics | lategame | schedule. Set WEB_BASE_URL (and a
    matching RECOMPUTE_TOKEN) in .env to point at the running web app.
    """
    base = os.getenv("WEB_BASE_URL", "http://localhost:3000").rstrip("/")
    token = os.getenv("RECOMPUTE_TOKEN", "")
    try:
        import requests

        r = requests.post(f"{base}/api/revalidate",
                          params={"token": token, "tag": list(tags)}, timeout=5)
        print(f"  cache revalidate {list(tags)} -> HTTP {r.status_code}")
    except Exception as e:  # web not running / unreachable — fine, TTL covers it
        print(f"  cache revalidate skipped ({e})")
