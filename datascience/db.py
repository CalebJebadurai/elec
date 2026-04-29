"""Database connection helper for Jupyter notebooks."""

import os

import pandas as pd
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://elec:elec@localhost:5434/elec"
)

_engine = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(DATABASE_URL)
    return _engine


def query(sql: str, params: dict | None = None) -> pd.DataFrame:
    """Run a SQL query and return a DataFrame."""
    engine = get_engine()
    with engine.connect() as conn:
        return pd.read_sql(text(sql), conn, params=params)


def query_all(state: str | None = None, election_type: str = "AE") -> pd.DataFrame:
    """Load election data, optionally filtered by state and election type."""
    sql = "SELECT * FROM tcpd_ae WHERE election_type = :et"
    params: dict = {"et": election_type}
    if state:
        sql += " AND state_name = :state"
        params["state"] = state
    sql += " ORDER BY year, constituency_no, position"
    return query(sql, params)


def query_states() -> pd.DataFrame:
    """List all distinct states in the dataset."""
    return query("SELECT DISTINCT state_name FROM tcpd_ae ORDER BY state_name")


def query_ge(state: str | None = None) -> pd.DataFrame:
    """Load General Election (Lok Sabha) data, optionally filtered by state."""
    return query_all(state=state, election_type="GE")


def query_ae(state: str | None = None) -> pd.DataFrame:
    """Load Assembly Election data, optionally filtered by state."""
    return query_all(state=state, election_type="AE")


# ── Tamil Nadu–specific constants ────────────────────────
# These are kept for backward compatibility with existing notebooks.
# For other states, query the database directly.

# TN general elections (filter out by-elections with few candidates)
GENERAL_ELECTION_YEARS = [1971, 1977, 1980, 1984, 1989, 1991, 1996, 2001, 2006, 2011, 2016, 2021]

# Post-2008 delimitation years (234 fixed constituencies in TN)
POST_DELIM_YEARS = [2011, 2016, 2021]

# TN major parties
MAJOR_PARTIES = ["DMK", "ADMK", "INC", "PMK", "DMDK", "BJP", "CPM", "CPI", "MDMK", "NTK", "ADK"]

# TN alliance blocs (approximate — shifted over elections)
ALLIANCES = {
    2021: {
        "DMK+": ["DMK", "INC", "CPM", "CPI", "MDMK", "VCK", "MMK"],
        "ADMK+": ["ADMK", "PMK", "BJP"],
        "NTK": ["NTK"],
        "MNM": ["MNM"],
    },
    2016: {
        "DMK+": ["DMK", "INC", "IUML"],
        "ADMK+": ["ADMK"],
        "PMK+": ["PMK", "BJP"],
        "DMDK+": ["DMDK", "TMC(M)", "VCK"],
    },
    2011: {
        "DMK+": ["DMK", "INC", "PMK", "CPM", "CPI"],
        "ADMK+": ["ADMK", "DMDK", "CPI", "CPM", "MDMK"],
    },
    2006: {
        "DMK+": ["DMK", "PMK", "MDMK", "CPI", "CPM"],
        "ADMK+": ["ADMK", "BJP"],
    },
    2001: {
        "DMK+": ["DMK", "PMK", "MDMK"],
        "ADMK+": ["ADMK", "INC", "CPM", "CPI", "TMC(M)"],
    },
}

# TN sub-regions
SUB_REGIONS = [
    "CHENNAI CITY REGION",
    "WESTERN REGION",
    "CENTRAL REGION",
    "SOUTHERN REGION",
]
