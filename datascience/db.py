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


def query_all() -> pd.DataFrame:
    """Load the entire tcpd_ae table."""
    return query("SELECT * FROM tcpd_ae ORDER BY year, constituency_no, position")


# General elections only (filter out by-elections with few candidates)
GENERAL_ELECTION_YEARS = [1971, 1977, 1980, 1984, 1989, 1991, 1996, 2001, 2006, 2011, 2016, 2021]

# Post-2008 delimitation years (234 fixed constituencies)
POST_DELIM_YEARS = [2011, 2016, 2021]

# Major parties for focused analysis
MAJOR_PARTIES = ["DMK", "ADMK", "INC", "PMK", "DMDK", "BJP", "CPM", "CPI", "MDMK", "NTK", "ADK"]

# Alliance blocs (approximate — shifted over elections)
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

# Sub-regions
SUB_REGIONS = [
    "CHENNAI CITY REGION",
    "WESTERN REGION",
    "CENTRAL REGION",
    "SOUTHERN REGION",
]
