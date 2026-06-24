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
