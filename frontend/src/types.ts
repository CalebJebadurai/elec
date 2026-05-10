// ── Election Data Types ──────────────────────────────────

export interface Election {
  id: number;
  state_name: string | null;
  assembly_no: number | null;
  constituency_no: number | null;
  year: number | null;
  month: number | null;
  delim_id: number | null;
  poll_no: number | null;
  position: number | null;
  candidate: string | null;
  sex: string | null;
  party: string | null;
  votes: number | null;
  age: number | null;
  candidate_type: string | null;
  valid_votes: number | null;
  electors: number | null;
  constituency_name: string | null;
  constituency_type: string | null;
  district_name: string | null;
  sub_region: string | null;
  n_cand: number | null;
  turnout_percentage: number | null;
  vote_share_percentage: number | null;
  deposit_lost: string | null;
  margin: number | null;
  margin_percentage: number | null;
  enop: number | null;
  pid: string | null;
  party_type_tcpd: string | null;
  party_id: number | null;
  last_poll: string | null;
  contested: number | null;
  last_party: string | null;
  last_party_id: string | null;
  last_constituency_name: string | null;
  same_constituency: string | null;
  same_party: string | null;
  no_terms: number | null;
  turncoat: string | null;
  incumbent: string | null;
  recontest: string | null;
  myneta_education: string | null;
  tcpd_prof_main: string | null;
  tcpd_prof_main_desc: string | null;
  tcpd_prof_second: string | null;
  tcpd_prof_second_desc: string | null;
  election_type: string | null;
}

export interface ElectionListItem {
  id: number;
  year: number | null;
  state_name: string | null;
  constituency_name: string | null;
  constituency_no: number | null;
  party: string | null;
  candidate: string | null;
  votes: number | null;
  vote_share_percentage: number | null;
  position: number | null;
  margin: number | null;
  turnout_percentage: number | null;
  election_type: string | null;
  district_name: string | null;
}

export interface PaginatedElections {
  total: number;
  limit: number;
  offset: number;
  data: Election[];
}

export interface YearSummary {
  year: number;
  candidate_count: number;
}

export interface PartySummary {
  party: string | null;
  candidate_count: number;
  total_votes: number;
}

export interface ConstituencySummary {
  constituency_name: string | null;
  constituency_type: string | null;
  district_name: string | null;
}

export interface DistrictSummary {
  district_name: string | null;
  sub_region: string | null;
  constituency_count: number;
}

// ── State & Swing Types ─────────────────────────────────

export interface StateInfo {
  state_name: string;
  display_name: string;
  election_types: string[];
  ae_year_min: number | null;
  ae_year_max: number | null;
  ge_year_min: number | null;
  ge_year_max: number | null;
  ae_constituencies: number;
  ge_constituencies: number;
  latest_ae_general_year: number | null;
  next_election_est: number | null;
}

export interface StatsSummary {
  state_name: string | null;
  election_type: string | null;
  election_type_code: string;
  total_records: number;
  total_years: number;
  year_min: number;
  year_max: number;
  total_parties: number;
  total_constituencies: number;
  total_districts: number;
  general_years: number[];
  next_election_year: number | null;
  total_electors_latest: number | null;
}

export interface ConstituencyResult {
  year: number;
  constituency_name: string | null;
  constituency_no: number | null;
  winner: string | null;
  winner_party: string | null;
  winner_votes: number | null;
  runner_up: string | null;
  runner_up_party: string | null;
  runner_up_votes: number | null;
  margin: number | null;
  margin_percentage: number | null;
  turnout_percentage: number | null;
  enop: number | null;
  valid_votes: number | null;
  electors: number | null;
  n_cand: number | null;
}

export interface PartySwing {
  year: number;
  party: string | null;
  vote_share: number | null;
  seats_won: number;
  seats_contested: number;
  swing: number | null;
}

export interface ConstituencySwing {
  constituency_name: string | null;
  constituency_no: number | null;
  district_name: string | null;
  sub_region: string | null;
  constituency_type: string | null;
  results: ConstituencyResult[];
}

export interface StateSwingSummary {
  year: number;
  party: string | null;
  seats_won: number;
  total_seats: number;
  avg_vote_share: number | null;
  avg_margin: number | null;
  swing_from_prev: number | null;
}

export interface ConstituencySwingRow {
  constituency_name: string | null;
  constituency_no: number | null;
  district_name: string | null;
  sub_region: string | null;
  constituency_type: string | null;
  year: number;
  winner_party: string | null;
  winner: string | null;
  winner_votes: number | null;
  winner_vote_share: number | null;
  runner_up_party: string | null;
  margin_percentage: number | null;
  turnout_percentage: number | null;
}

// ── Prediction Types ────────────────────────────────────

export interface CandidateResult {
  party: string | null;
  votes: number | null;
  vote_share_percentage: number | null;
  position: number | null;
}

export interface ConstituencyPredictionData {
  constituency_name: string;
  constituency_no: number | null;
  constituency_type: string | null;
  district_name: string | null;
  sub_region: string | null;
  electors_latest: number | null;
  valid_votes_latest: number | null;
  turnout_percentage_latest: number | null;
  enop_latest: number | null;
  n_cand_latest: number | null;
  winner_latest: string | null;
  winner_party_latest: string | null;
  margin_latest: number | null;
  margin_percentage_latest: number | null;
  candidates_latest: CandidateResult[];
  candidates_prev: CandidateResult[];
}

export interface PredictionDataResponse {
  total_electors_next: number;
  total_electors_latest: number;
  latest_year: number;
  prev_year: number;
  constituency_count: number;
  constituencies: ConstituencyPredictionData[];
  _state?: string;
}

// ── Prediction Engine Types ─────────────────────────────

export interface PredictionParty {
  party: string;
  originalParty: string;
  voteShare: number;
  votes: number;
  position: number | null;
  isNewParty?: boolean;
}

export interface PredictionResult {
  constituency_name: string;
  constituency_no: number | null;
  constituency_type: string | null;
  district_name: string | null;
  sub_region: string | null;
  electors_next: number;
  valid_votes_next: number;
  winner_party_latest: string | null;
  margin_percentage_latest: number | null;
  predicted_winner: string | null;
  predicted_winner_votes: number;
  predicted_winner_share: number;
  predicted_runner_up: string | null;
  predicted_runner_up_votes: number;
  predicted_margin: number;
  predicted_margin_pct: number;
  flipped: boolean;
  parties: PredictionParty[];
  new_party_votes?: number;
  new_party_share?: number;
  errorMarginLow?: number;
  errorMarginHigh?: number;
}

export interface PredictionParams {
  antiIncumbencyPct: number;
  turnoutPct: number;
  growthFactor: number;
}

export interface NewPartyConfig {
  name: string;
  color: string;
  statewideVoteShare: number;
  affinityWeights: Record<string, number>;
  constituencyOverrides: Record<string, number>;
}

export interface AggregateParty {
  party: string;
  seats: number;
  seatRangeLow: number;
  seatRangeHigh: number;
  avgVoteShare: number;
  totalVotes: number;
}

export interface FlippedConstituency {
  constituency: string;
  from: string | null;
  to: string;
  margin_latest: number | null;
  margin_next: number;
}

export interface AggregateResult {
  totalSeats: number;
  parties: AggregateParty[];
  flipped: FlippedConstituency[];
  flippedCount: number;
}

// ── National Dashboard Types ────────────────────────────

export interface NationalStateSummary {
  state_name: string;
  display_name: string;
  latest_year: number | null;
  total_constituencies: number;
  ruling_party: string | null;
  ruling_party_seats: number;
  runner_up_party: string | null;
  runner_up_seats: number;
  avg_turnout: number | null;
  total_electors: number | null;
}

export interface NationalPartyStrength {
  party: string;
  states_won_in: number;
  total_seats_won: number;
  avg_vote_share: number;
  years_active: number[];
}

export interface NationalTurnoutTrend {
  year: number;
  avg_turnout: number;
  total_electors: number | null;
  states_counted: number;
}

export interface UpcomingElection {
  state_name: string;
  display_name: string;
  last_election_year: number;
  estimated_next_year: number;
  election_type_code: string;
}

export interface PartyMapEntry {
  state_name: string;
  display_name: string;
  seats_won: number;
  total_seats: number;
  vote_share: number | null;
  year: number | null;
}

// ── Auth Types ──────────────────────────────────────────

export interface User {
  id: number;
  mobile: string;
  display_name: string | null;
  google_email: string | null;
  role: string;
  avatar_url: string | null;
  date_of_birth: string | null;
  age: number | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface UserProfile {
  display_name: string | null;
}

// ── Bookmark Types ──────────────────────────────────────

export interface Bookmark {
  id: number;
  user_id: number;
  title: string;
  description: string;
  params: Record<string, unknown>;
  is_public: boolean;
  like_count: number;
  dislike_count: number;
  created_at: string;
  updated_at: string;
  author_name: string | null;
  author_avatar: string | null;
  my_vote: string | null;
}

// ── Subscription & API Key Types ────────────────────────

export interface SubscriptionOut {
  id: number;
  tier: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_period_end: string | null;
  created_at: string;
  canceled_at: string | null;
}

export interface ApiKeyOut {
  id: number;
  key_prefix: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

export interface ApiKeyCreated {
  id: number;
  key: string;
  key_prefix: string;
  label: string | null;
}

export interface UsageSummaryOut {
  date: string;
  endpoint_group: string | null;
  request_count: number;
  total_response_time_ms: number;
}

// ── App-level Prediction Params ─────────────────────────

export interface AllianceBloc {
  name: string;
  parties: string[];
  transferEfficiency: number;
}

export interface AppPredictionParams {
  antiIncumbencyPct: number;
  totalElectors: number | null;
  turnoutPct: number;
  newPartyName: string;
  newPartyColor: string;
  newPartyPreset: string;
  newPartyStatewideVoteShare: number;
  affinityWeights: Record<string, number>;
  constituencyOverrides: Record<string, number>;

  // Multi-factor slider params (default 0 = use historical baseline)
  turnoutChange: number;
  incumbencyFatigue: number;
  turncoatPenalty: number;
  recontestBonus: number;
  sameConstituencyBonus: number;
  previousMarginFactor: number;
  enopFactor: number;
  nCandFactor: number;
  constituencyTypeFactor: number;
  genderFactor: number;
  partyStrengthFactor: number;
  partyVoteShareFactor: number;

  // Alliance configuration
  allianceConfig: AllianceBloc[];

  // Prediction mode
  predictionMode: 'formula' | 'ml';
}

export interface AffinityPreset {
  label: string;
  weights: Record<string, number>;
}

export type AffinityPresets = Record<string, AffinityPreset>;
