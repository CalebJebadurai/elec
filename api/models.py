from pydantic import BaseModel
from datetime import datetime


class Election(BaseModel):
    id: int
    state_name: str | None = None
    assembly_no: int | None = None
    constituency_no: int | None = None
    year: int | None = None
    month: int | None = None
    delim_id: int | None = None
    poll_no: int | None = None
    position: int | None = None
    candidate: str | None = None
    sex: str | None = None
    party: str | None = None
    votes: int | None = None
    age: int | None = None
    candidate_type: str | None = None
    valid_votes: int | None = None
    electors: int | None = None
    constituency_name: str | None = None
    constituency_type: str | None = None
    district_name: str | None = None
    sub_region: str | None = None
    n_cand: int | None = None
    turnout_percentage: float | None = None
    vote_share_percentage: float | None = None
    deposit_lost: str | None = None
    margin: int | None = None
    margin_percentage: float | None = None
    enop: float | None = None
    pid: str | None = None
    party_type_tcpd: str | None = None
    party_id: int | None = None
    last_poll: str | None = None
    contested: int | None = None
    last_party: str | None = None
    last_party_id: str | None = None
    last_constituency_name: str | None = None
    same_constituency: str | None = None
    same_party: str | None = None
    no_terms: int | None = None
    turncoat: str | None = None
    incumbent: str | None = None
    recontest: str | None = None
    myneta_education: str | None = None
    tcpd_prof_main: str | None = None
    tcpd_prof_main_desc: str | None = None
    tcpd_prof_second: str | None = None
    tcpd_prof_second_desc: str | None = None
    election_type: str | None = None


class YearSummary(BaseModel):
    year: int
    candidate_count: int


class PartySummary(BaseModel):
    party: str | None = None
    candidate_count: int
    total_votes: int | None = 0


class ConstituencySummary(BaseModel):
    constituency_name: str | None = None
    constituency_type: str | None = None
    district_name: str | None = None


class DistrictSummary(BaseModel):
    district_name: str | None = None
    sub_region: str | None = None
    constituency_count: int


class StateInfo(BaseModel):
    state_name: str
    display_name: str
    election_types: list[str] = []
    ae_year_min: int | None = None
    ae_year_max: int | None = None
    ge_year_min: int | None = None
    ge_year_max: int | None = None
    ae_constituencies: int = 0
    ge_constituencies: int = 0
    latest_ae_general_year: int | None = None
    next_election_est: int | None = None


class StatsSummary(BaseModel):
    state_name: str | None = None
    election_type: str | None = None
    election_type_code: str = "AE"
    total_records: int
    total_years: int
    year_min: int
    year_max: int
    total_parties: int
    total_constituencies: int
    total_districts: int
    general_years: list[int] = []
    next_election_year: int | None = None
    total_electors_latest: int | None = None


class PaginatedElections(BaseModel):
    total: int
    limit: int
    offset: int
    data: list[Election]


class ElectionListItem(BaseModel):
    id: int
    year: int | None = None
    state_name: str | None = None
    constituency_name: str | None = None
    constituency_no: int | None = None
    party: str | None = None
    candidate: str | None = None
    votes: int | None = None
    vote_share_percentage: float | None = None
    position: int | None = None
    margin: int | None = None
    turnout_percentage: float | None = None
    election_type: str | None = None
    district_name: str | None = None


class PaginatedElectionsList(BaseModel):
    total: int
    limit: int
    offset: int
    data: list[ElectionListItem]
    data: list[Election]


class ConstituencyResult(BaseModel):
    year: int
    constituency_name: str | None = None
    constituency_no: int | None = None
    winner: str | None = None
    winner_party: str | None = None
    winner_votes: int | None = None
    runner_up: str | None = None
    runner_up_party: str | None = None
    runner_up_votes: int | None = None
    margin: int | None = None
    margin_percentage: float | None = None
    turnout_percentage: float | None = None
    enop: float | None = None
    valid_votes: int | None = None
    electors: int | None = None
    n_cand: int | None = None


class PartySwing(BaseModel):
    year: int
    party: str | None = None
    vote_share: float | None = None
    seats_won: int = 0
    seats_contested: int = 0
    swing: float | None = None


class ConstituencySwing(BaseModel):
    constituency_name: str | None = None
    constituency_no: int | None = None
    district_name: str | None = None
    sub_region: str | None = None
    constituency_type: str | None = None
    results: list[ConstituencyResult] = []


class StateSwingSummary(BaseModel):
    year: int
    party: str | None = None
    seats_won: int = 0
    total_seats: int = 0
    avg_vote_share: float | None = None
    avg_margin: float | None = None
    swing_from_prev: float | None = None


class ConstituencySwingRow(BaseModel):
    constituency_name: str | None = None
    constituency_no: int | None = None
    district_name: str | None = None
    sub_region: str | None = None
    constituency_type: str | None = None
    year: int
    winner_party: str | None = None
    winner: str | None = None
    winner_votes: int | None = None
    winner_vote_share: float | None = None
    runner_up_party: str | None = None
    margin_percentage: float | None = None
    turnout_percentage: float | None = None


# ---------------------------------------------------------------------------
# Prediction data models
# ---------------------------------------------------------------------------
class CandidateResult(BaseModel):
    party: str | None = None
    votes: int | None = None
    vote_share_percentage: float | None = None
    position: int | None = None


class ConstituencyPredictionData(BaseModel):
    constituency_name: str
    constituency_no: int | None = None
    constituency_type: str | None = None
    district_name: str | None = None
    sub_region: str | None = None
    electors_latest: int | None = None
    valid_votes_latest: int | None = None
    turnout_percentage_latest: float | None = None
    enop_latest: float | None = None
    n_cand_latest: int | None = None
    winner_latest: str | None = None
    winner_party_latest: str | None = None
    margin_latest: int | None = None
    margin_percentage_latest: float | None = None
    candidates_latest: list[CandidateResult] = []
    candidates_prev: list[CandidateResult] = []


class PredictionDataResponse(BaseModel):
    total_electors_next: int
    total_electors_latest: int
    latest_year: int
    prev_year: int
    constituency_count: int
    constituencies: list[ConstituencyPredictionData]


# ---------------------------------------------------------------------------
# National dashboard models
# ---------------------------------------------------------------------------
class NationalPartyStrength(BaseModel):
    party: str
    states_won_in: int = 0
    total_seats_won: int = 0
    avg_vote_share: float = 0.0
    years_active: list[int] = []


class NationalStateSummary(BaseModel):
    state_name: str
    display_name: str = ""
    latest_year: int | None = None
    total_constituencies: int = 0
    ruling_party: str | None = None
    ruling_party_seats: int = 0
    runner_up_party: str | None = None
    runner_up_seats: int = 0
    avg_turnout: float | None = None
    total_electors: int | None = None


class UpcomingElection(BaseModel):
    state_name: str
    display_name: str = ""
    last_election_year: int
    estimated_next_year: int
    election_type_code: str


class NationalTurnoutTrend(BaseModel):
    year: int
    avg_turnout: float
    total_electors: int | None = None
    states_counted: int = 0


class PartyMapEntry(BaseModel):
    state_name: str
    display_name: str = ""
    seats_won: int = 0
    total_seats: int = 0
    vote_share: float | None = None
    year: int | None = None


# ── Subscription & API key models ──────────────────────────

class SubscriptionOut(BaseModel):
    id: int
    tier: str
    status: str
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    grace_period_end: datetime | None = None
    created_at: datetime
    canceled_at: datetime | None = None


class ApiKeyOut(BaseModel):
    id: int
    key_prefix: str
    label: str | None = None
    created_at: datetime
    last_used_at: datetime | None = None
    is_active: bool


class ApiKeyCreated(BaseModel):
    id: int
    key: str
    key_prefix: str
    label: str | None = None


class UsageSummaryOut(BaseModel):
    date: str
    endpoint_group: str | None = None
    request_count: int
    total_response_time_ms: int
