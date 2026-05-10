# Deep Technical Research: Multi-Factor Election Prediction System

**Date:** 2026-04-30  
**Analyst:** GitHub Copilot (Senior Technical Analyst)  
**Subject:** Comprehensive research findings for building a 20+ factor prediction slider system on the Indian election analytics platform

---

## Codebase Findings

### 1. TCPD Dataset Structure and Coverage

The platform ingests three TCPD (Trivedi Centre for Political Data) datasets, stored as compressed CSVs at `data/TCPD_AE_All_States_2026-4-30.csv.gz`, `data/TCPD_GA_All_States_2026-4-30.csv.gz`, and `data/TCPD_GE_All_States_2026-4-30.csv.gz`. All three are loaded into a single PostgreSQL table `tcpd_ae` (defined in `init.sql`) differentiated by the `election_type` column.

**Assembly Election (AE) columns — 47 fields total:**

| Column | Type | Description | Prediction Relevance |
|--------|------|-------------|---------------------|
| `state_name` | TEXT | State identifier | Grouping/filtering |
| `assembly_no` | INTEGER | Assembly session number | Temporal ordering |
| `constituency_no` | INTEGER | Constituency identifier | Unit of prediction |
| `year` | INTEGER | Election year | Temporal feature |
| `month` | INTEGER | Election month | Seasonality proxy |
| `delim_id` | INTEGER | Delimitation period ID | Boundary grouping |
| `poll_no` | INTEGER | 0=general, >0=by-election | Filter by-elections |
| `position` | INTEGER | Rank of candidate (1=winner) | Target variable |
| `candidate` | TEXT | Candidate name | Identity tracking |
| `sex` | TEXT | M/F | Gender factor |
| `party` | TEXT | Party abbreviation | Core feature |
| `votes` | INTEGER | Absolute votes received | Outcome variable |
| `age` | INTEGER | Candidate age | Candidate profile factor |
| `candidate_type` | TEXT | Candidate classification | Not widely populated |
| `valid_votes` | INTEGER | Total valid votes in constituency | Turnout calculation |
| `electors` | INTEGER | Registered voters | Electorate size |
| `constituency_name` | TEXT | Human-readable name | Display/join key |
| `constituency_type` | TEXT | GEN/SC/ST | Reserved seat factor |
| `district_name` | TEXT | District | Geographic grouping |
| `sub_region` | TEXT | Regional cluster within state | Regional dynamics |
| `n_cand` | INTEGER | Number of candidates | Competition intensity |
| `turnout_percentage` | NUMERIC | Voter turnout % | Core prediction factor |
| `vote_share_percentage` | NUMERIC | Candidate's vote share % | Core outcome variable |
| `deposit_lost` | TEXT | yes/no — lost deposit | Fringe candidate indicator |
| `margin` | INTEGER | Absolute vote margin (winner only) | Outcome strength |
| `margin_percentage` | NUMERIC | Margin as % of valid votes | Outcome strength |
| `enop` | NUMERIC | Effective Number of Parties | Competition structure |
| `pid` | TEXT | TCPD person ID | Career tracking |
| `party_type_tcpd` | TEXT | national/state/independent | Party classification |
| `party_id` | INTEGER | TCPD party ID | Party tracking |
| `last_poll` | TEXT | TRUE/FALSE — contested last election | Re-contest indicator |
| `contested` | INTEGER | Number of elections contested | Experience proxy |
| `last_party` | TEXT | Party in last election | Party-switching detection |
| `last_party_id` | TEXT | Last party's TCPD ID | Party tracking |
| `last_constituency_name` | TEXT | Previous constituency | Migration tracking |
| `same_constituency` | TEXT | TRUE/FALSE — same seat as last time | Constituency loyalty |
| `same_party` | TEXT | TRUE/FALSE — same party as last time | Party loyalty |
| `no_terms` | INTEGER | Number of prior terms won | Experience/incumbency depth |
| `turncoat` | TEXT | TRUE/FALSE — switched parties | Turncoat factor |
| `incumbent` | TEXT | TRUE/FALSE — current MLA | Incumbency factor |
| `recontest` | TEXT | TRUE/FALSE — contesting again | Re-contest dynamics |
| `myneta_education` | TEXT | Education level from MyNeta | Education factor |
| `tcpd_prof_main` | TEXT | Primary profession code | Profession factor |
| `tcpd_prof_main_desc` | TEXT | Primary profession description | Display |
| `tcpd_prof_second` | TEXT | Secondary profession code | Profession factor |
| `tcpd_prof_second_desc` | TEXT | Secondary profession description | Display |
| `election_type` | TEXT | "State Assembly Election (AE)" | Type filter |

**General Election (GE) differences:** The GE dataset lacks the `age` and `district_name` columns (these are NULL when loaded). The column order differs slightly (`poll_no` before `delim_id`), but all records go into the same `tcpd_ae` table. The `election_type` value is "Lok Sabha Election (GE)".

**General Assembly (GA) dataset:** The `TCPD_GA_All_States_2026-4-30.csv.gz` file exists in the `data/` directory but is not currently loaded into the database. No code references this dataset. It likely represents a supplementary or aggregated form of assembly data. Its structure and coverage are unknown without decompressing it.

**Data coverage observations from the codebase:**

The `db.py` helper file defines Tamil Nadu general election years as `[1971, 1977, 1980, 1984, 1989, 1991, 1996, 2001, 2006, 2011, 2016, 2021]` — 12 election cycles. Post-delimitation years (2008 onwards) with stable 234-constituency boundaries are `[2011, 2016, 2021]` — only 3 cycles. The platform's `_get_general_years()` function in `routes.py` dynamically detects general election years for any state by finding years where constituency counts exceed 40% of the maximum observed count for that state — this handles varying historical data depth across states.

The `init.sql` shows that the data loads without validation (just `COPY FROM`), and a post-load deduplication step removes duplicate candidate entries by keeping the lowest `id` for each `(state_name, year, constituency_no, candidate, poll_no, election_type)` combination.

**Data quality indicators observed in ingest.py:** The ingestion pipeline (`ingest.py`) treats empty strings, "NA", "N/A", "nan", and "None" as NULL values. Integer and numeric columns are coerced with try/except, defaulting to NULL on failure. This suggests the raw TCPD data has inconsistent NULL representation across states and years.

**Key data quality concerns for prediction:**

The `age` column is absent in GE data entirely. The `myneta_education` field likely has sparse coverage for older elections (MyNeta data collection began around 2004-2009). The `tcpd_prof_main` and `tcpd_prof_second` profession fields are probably inconsistently populated across states and years. The `sub_region` field is defined for Tamil Nadu but may not be populated for all states. The `district_name` is missing from GE data. The `contested`, `last_poll`, `last_party`, `same_constituency`, `same_party`, `no_terms`, `turncoat`, `incumbent`, and `recontest` fields require TCPD's longitudinal career tracking to be populated — these are likely well-populated for post-2000 elections but increasingly sparse going back to the 1960s-1970s.

---

### 2. Existing Prediction Architecture

The current prediction system is a **purely frontend-computed, formula-based approach** with three adjustable parameters:

**Frontend prediction engine** (`frontend/src/engine/predictionEngine.ts`):

The `generateBaseline()` function accepts an array of `ConstituencyPredictionData` objects (fetched from the backend) and a `PredictionParams` object containing `antiIncumbencyPct` (0-100), `turnoutPct` (0-100), and `growthFactor` (derived from total electors). For each constituency, it scales the latest election's elector count by `growthFactor`, computes expected valid votes as `scaledElectors × turnoutPct/100`, then applies a uniform anti-incumbency formula: the incumbent party (position=1 winner from latest election) loses `voteShare × antiIncumbencyPct/100` of its vote share, with 70% of that loss going to the runner-up and 30% split equally among all other parties. Vote shares are then renormalized to sum to 1.0 and converted to absolute votes.

The `applyNewParty()` function layers on top of baseline results. It introduces a hypothetical new party with a configurable statewide vote share and affinity-weighted redistribution: existing parties lose votes proportional to `affinityWeight × currentVotes / weightedSum`. This is an additive adjustment after baseline, not an integrated factor.

The `aggregateResults()` function summarizes constituency-level predictions into party seat counts, average vote shares, total votes, and a list of flipped constituencies (where predicted winner differs from latest actual winner).

**Key limitations of the current approach:**

1. **Uniform anti-incumbency:** The same percentage is applied to every constituency regardless of local dynamics. A state-level slider of 10% means the incumbent party loses exactly 10% of its vote share everywhere, even in safe seats or competitive ones.

2. **No constituency-specific factors:** No consideration of individual candidate profiles (age, gender, incumbency depth, turncoat status), constituency characteristics (urban/rural, reserved seats), or historical patterns (margin trends, turnout changes, party strength trajectories).

3. **Static vote share redistribution:** The 70/30 split (runner-up gets 70%, others share 30%) is hardcoded with no empirical basis. In practice, anti-incumbency vote redistribution varies enormously by context — in bipolar states the challenger may absorb nearly all, while in multi-party states votes fragment across several alternatives.

4. **No error margins or confidence intervals:** Predictions are point estimates with no quantification of uncertainty.

5. **AE-only restriction:** The backend endpoint (`/predict/data`) explicitly rejects GE requests with a 501 status, limiting predictions to state assembly elections.

6. **No ML integration:** The ML models in the notebook are completely disconnected from the application.

**Backend prediction data endpoint** (`api/routes.py`, lines 618-720):

The `GET /predict/data` endpoint retrieves the last two general election years for a state, fetches all candidate records for those years, and structures them into `ConstituencyPredictionData` objects. Each constituency gets: latest election metadata (electors, turnout, ENOP, candidate count, winner info, margin), a list of latest candidates with party/votes/vote_share/position, and a list of previous election candidates. The response also includes `total_electors_next` (currently just the latest total) and `total_electors_latest`. This endpoint caches results for 24 hours. No historical features (incumbency depth, turncoat status, turnout change, etc.) are passed to the frontend — only raw latest/previous candidate data.

**Frontend prediction UI** (`frontend/src/components/PredictionPanel.tsx`):

The panel renders in a sticky sidebar (280px wide on desktop, full width on mobile) with:
- "Global Parameters" section (always visible): anti-incumbency slider (0-100%, step 1), total electors numeric input, expected turnout slider (0-100%, step 0.5)
- "New Party / Third Front" collapsible: party name text input, color picker, alliance proximity preset selector, statewide vote share slider (0-100%, step 0.5)
- "Affinity Weights" collapsible: per-party sliders (0-1, step 0.05) controlling how much each existing party loses to the new party
- "Per-Constituency Overrides" collapsible: constituency-specific vote share overrides
- Reset button

The panel uses Radix UI `Collapsible` components for sections and a custom `Slider` component. State management is handled in `App.tsx` via `useState<AppPredictionParams>` with a 200ms debounce via `useDebounce`. Predictions are recomputed as `useMemo` chains: `predData → baseline → predictions → summary`.

**ML notebook** (`datascience/notebooks/06_predictive_model.ipynb`):

The notebook implements a complete classification and regression pipeline scoped to Tamil Nadu:

Feature engineering builds 19 features from historical data: `age`, `n_cand`, `enop`, `turnout_percentage`, `prev_margin_pct`, `prev_winner_vote_share`, `prev_turnout`, `prev_party_seats`, `prev_party_avg_vote_share`, `is_incumbent_party`, `is_incumbent`, `is_turncoat`, `is_recontest`, `is_female`, `is_same_constituency`, `is_major_party`, `turnout_change`, `no_terms`, `contested`. The notebook trains on 2011+2016 data and tests on 2021 data. It uses `RandomForestClassifier` (200 trees, max_depth=10, balanced class weights) and `XGBClassifier` (200 estimators, max_depth=6, learning_rate=0.1, scale_pos_weight adjusted for class imbalance). Missing values are filled with 0. SHAP analysis provides feature importance rankings. A `GradientBoostingRegressor` predicts winner margins. The notebook also includes 2026 scenario modeling that identifies vulnerable DMK seats based on win probability.

The notebook is entirely self-contained — models are not serialized, no API integration exists, and it only processes Tamil Nadu data. All data comes through the `db.py` helper which queries the PostgreSQL database.

---

### 3. Factor Identification and Catalog

Based on the TCPD data columns, the existing ML notebook features, and established political science literature on Indian elections, the following 25 factors can be derived from available data. Each factor is assessed for data source, expected direction of effect, granularity level, and data availability.

#### Category A: Candidate Demographics (6 factors)

**Factor 1: Candidate Gender (is_female)**
- TCPD column: `sex` (M/F)
- Expected effect: Female candidates have historically underperformed by ~2-4pp vote share on average in Indian elections, though this gap has been narrowing. The direction is mildly negative for female candidates overall but may be positive in certain progressive urban constituencies.
- Level: Candidate-level
- Data availability: Well-populated across all states and years for AE data. Missing for NOTA entries. Not applicable for GE (column present but well-populated).

**Factor 2: Candidate Age**
- TCPD column: `age`
- Expected effect: Non-linear. Very young (<30) and very old (>75) candidates tend to underperform. The sweet spot is approximately 45-65. Age is also a proxy for experience and generational appeal.
- Level: Candidate-level
- Data availability: Present in AE data but completely absent from GE data. Likely sparse for older elections (pre-2000). MyNeta integration improved coverage post-2009.

**Factor 3: Education Level**
- TCPD column: `myneta_education`
- Expected effect: Weakly positive — higher education correlates with slightly higher vote share in urban constituencies, but the effect is negligible or reversed in rural constituencies where local connections matter more.
- Level: Candidate-level
- Data availability: Sparse. MyNeta education data is only available from approximately 2004 onwards and coverage varies by state. Expect 30-60% missing values even in recent elections.

**Factor 4: Professional Background**
- TCPD columns: `tcpd_prof_main`, `tcpd_prof_main_desc`, `tcpd_prof_second`
- Expected effect: Certain professions (lawyers, business owners) correlate with higher win rates, likely due to resources and networks rather than profession per se. Agricultural background may be advantageous in rural constituencies.
- Level: Candidate-level
- Data availability: Inconsistently populated. TCPD's profession coding has evolved over time. Expect significant missing data, especially for minor party and independent candidates.

**Factor 5: Number of Prior Terms (Incumbency Depth)**
- TCPD column: `no_terms`
- Expected effect: Diminishing returns. First-term incumbents often benefit from incumbency advantage, but multi-term incumbents (3+) face increasing anti-incumbency sentiment. The relationship is approximately inverse-U shaped.
- Level: Candidate-level
- Data availability: Requires longitudinal career tracking. Well-populated for post-2000 elections in major states. Increasingly incomplete going back in time due to TCPD's tracking limitations for pre-digitization eras.

**Factor 6: Number of Elections Contested**
- TCPD column: `contested`
- Expected effect: Positive up to a point. Candidates with 2-4 prior contests have established name recognition. Perennial candidates (8+ contests) are often fringe.
- Level: Candidate-level
- Data availability: Same as `no_terms` — requires longitudinal tracking. Reasonably complete for recent decades.

#### Category B: Incumbency and Re-contest Dynamics (5 factors)

**Factor 7: Incumbent Status**
- TCPD column: `incumbent` (TRUE/FALSE)
- Expected effect: Complex. Incumbents in India face anti-incumbency ranging from -3pp to -15pp vote share depending on governance performance, caste dynamics, and alliance shifts. The effect is strongly state-specific and wave-dependent.
- Level: Candidate-level
- Data availability: Well-populated for post-1990 elections. Requires knowing who won the previous election in the same constituency.

**Factor 8: Turncoat Status**
- TCPD column: `turncoat` (TRUE/FALSE)
- Expected effect: Generally negative. Party-switching candidates lose credibility with loyal voters of both parties. However, in specific contexts (joining a winning alliance), turncoat status can be offset by alliance support.
- Level: Candidate-level
- Data availability: Requires career tracking. Well-populated for recent decades.

**Factor 9: Re-contest Status**
- TCPD column: `recontest` (TRUE/FALSE)
- Expected effect: Positive. Candidates who re-contest have organizational continuity and name recognition. The correlation with winning is positive but confounded — parties tend to re-nominate winning candidates.
- Level: Candidate-level
- Data availability: Well-populated for recent elections.

**Factor 10: Same Constituency**
- TCPD column: `same_constituency` (TRUE/FALSE)
- Expected effect: Positive. Candidates contesting from the same seat have deeper local connections, established booth-level networks, and voter familiarity. Effect is approximately +2-5pp vote share compared to parachute candidates.
- Level: Candidate-level
- Data availability: Well-populated for recent elections.

**Factor 11: Same Party Continuity**
- TCPD column: `same_party` (TRUE/FALSE)
- Expected effect: Positive. Staying with the same party signals commitment and retains party worker networks. Switching parties (turncoat) is penalized by voters.
- Level: Candidate-level
- Data availability: Well-populated for recent elections.

#### Category C: Electoral Dynamics (6 factors)

**Factor 12: Turnout Percentage**
- TCPD column: `turnout_percentage`
- Expected effect: Higher turnout is historically correlated with anti-incumbency in Indian elections — motivated opposition voters drive turnout up. The effect varies by state: in TN, ~1pp turnout increase correlates with ~0.5-1pp swing away from the ruling party.
- Level: Constituency-level (observed), applied as state-level slider
- Data availability: Universally populated across all states and years. This is the most complete and reliable field.

**Factor 13: Turnout Change (Delta from Previous Election)**
- TCPD columns: Derived from `turnout_percentage` across consecutive elections
- Expected effect: Positive turnout change (more people voting than last time) is a strong anti-incumbency signal. Negative turnout change may indicate voter fatigue or satisfaction with status quo. The user's referenced formula `P_AI = 50 + (ΔT × 5)` captures this relationship.
- Level: Constituency-level
- Data availability: Derivable wherever two consecutive elections exist for the same constituency. Requires matching constituencies across delimitations.

**Factor 14: Previous Margin**
- TCPD columns: `margin`, `margin_percentage` from previous election
- Expected effect: Constituencies with large previous margins are harder to flip (safe seats). Marginal seats (< 5% margin) are most susceptible to swings. This is a strong predictor of competitiveness.
- Level: Constituency-level
- Data availability: Well-populated. Derivable by looking up position=1 winner's margin from the previous election.

**Factor 15: Effective Number of Parties (ENOP)**
- TCPD column: `enop`
- Expected effect: Higher ENOP indicates fragmented competition. In fragmented contests, smaller vote shares can win (plurality winner with 30-35% share). ENOP > 3 significantly increases uncertainty. ENOP also interacts with alliance arithmetic — a high ENOP with alliance consolidation is very different from high ENOP with fragmentation.
- Level: Constituency-level
- Data availability: Universally populated. Computed by TCPD using the Laakso-Taagepera formula.

**Factor 16: Number of Candidates**
- TCPD column: `n_cand`
- Expected effect: More candidates generally fragment the vote, benefiting the strongest party (plurality advantage). Very high candidate counts (15+) often indicate many frivolous candidates who split minor vote share.
- Level: Constituency-level
- Data availability: Universally populated.

**Factor 17: Deposit Loss Rate**
- TCPD column: `deposit_lost` (yes/no)
- Expected effect: The fraction of candidates who lose deposits in a constituency is a proxy for frivolous candidacy. High deposit loss rates indicate concentrated competition among 2-3 serious candidates. This field is per-candidate but can be aggregated to constituency level.
- Level: Constituency-level (derived)
- Data availability: Well-populated for recent elections.

#### Category D: Geographic and Structural Factors (4 factors)

**Factor 18: Constituency Type (Reserved/General)**
- TCPD column: `constituency_type` (GEN/SC/ST)
- Expected effect: SC and ST reserved constituencies have distinct voting patterns — limited candidate pool, different party dynamics, and typically lower vote shares for national parties. The reserved status constrains which parties can field candidates effectively.
- Level: Constituency-level (static)
- Data availability: Universally populated.

**Factor 19: Urban/Rural Classification**
- TCPD column: `constituency_type` can proxy this (but TCPD's field is reservation-type, not urban/rural). The `district_name` field combined with external knowledge can approximate urbanization.
- Expected effect: Urban constituencies have higher voter awareness, lower party loyalty, and more volatile swings. Rural constituencies are more stable with stronger caste/community-based voting.
- Level: Constituency-level
- Data availability: The `constituency_type` field in TCPD primarily indicates reservation status (GEN/SC/ST), not urban/rural. However, the `sub_region` field (populated for some states like Tamil Nadu) partially captures this. True urban/rural classification would require external data (Census urban/rural constituency mapping).

**Factor 20: Sub-Region / District Effect**
- TCPD columns: `sub_region`, `district_name`
- Expected effect: Strong regional voting blocs exist in many Indian states. For example, Tamil Nadu's sub-regions (Chennai City, Western, Central, Southern, Northern, Delta) have distinct political leanings. District-level effects capture local caste demographics and development patterns.
- Level: Constituency-level (geographic group)
- Data availability: `district_name` is populated for AE but missing from GE data. `sub_region` is defined for some states (TN has 8 sub-regions defined in `db.py`) but coverage varies across states.

**Factor 21: State-Level Electoral Cycle Position**
- TCPD columns: Derived from `year`, `assembly_no`
- Expected effect: Indian states exhibit strong cyclical anti-incumbency. The ruling party's fate depends on where the state is in its cycle — mid-term elections, end-of-term elections, and snap elections have different dynamics. Tamil Nadu has exhibited near-perfect alternation between DMK and ADMK since 1996 (broken only in 2016).
- Level: State-level
- Data availability: Derivable from the historical record.

#### Category E: Party-Level Factors (4 factors)

**Factor 22: Party Classification (National/State/Independent)**
- TCPD column: `party_type_tcpd`
- Expected effect: National parties (BJP, INC) have different dynamics than state parties. National party performance correlates with national mood and central government performance. State party performance correlates with state-level governance and regional identity.
- Level: Candidate-level
- Data availability: Well-populated.

**Factor 23: Previous Party Seats (State-Level Party Strength)**
- TCPD columns: Derived — count of position=1 for each party in the previous election
- Expected effect: Parties that won more seats in the previous election face higher cumulative anti-incumbency. A party that won 180/234 seats has more to lose than one that won 50/234. This captures the "rubber band" effect — large wins often lead to regression to the mean.
- Level: Party-level within state
- Data availability: Derivable from historical data. Well-populated.

**Factor 24: Previous Party Average Vote Share**
- TCPD columns: Derived — mean `vote_share_percentage` per party across all constituencies in the previous election
- Expected effect: Higher average vote share in the previous election indicates stronger baseline support but also higher vulnerability to uniform swing against. Parties near the 40-45% vote share mark in a two-party system are in a strong but precarious position.
- Level: Party-level within state
- Data availability: Derivable from historical data.

**Factor 25: Alliance Configuration**
- TCPD columns: Derived from `party` field across elections — requires external alliance definitions or inference from vote transfer patterns
- Expected effect: Alliance formation/breakup is the single most powerful predictor of election outcomes in Indian politics. When parties that previously competed ally together, their combined vote share minus a friction factor (~10-15% of the weaker partner's vote) becomes the alliance's expected share. Alliance breakup disperses votes. The 2021 Tamil Nadu election demonstrated alliance arithmetic overriding turnout models.
- Level: State-level configuration, applied constituency-level
- Data availability: Not directly in TCPD. The existing codebase has hardcoded alliance definitions in `db.py` for Tamil Nadu elections 2001-2021. For other states, alliance data would need to be curated manually or inferred from seat-sharing patterns (e.g., if party A contests 150/234 seats and party B contests 84/234, they are likely allies).

---

## Architectural Constraints

### Backend Architecture

The API is built with **FastAPI** (Python) using **asyncpg** for PostgreSQL access. All election data resides in a single `tcpd_ae` table with approximately 47 columns. The application uses a server-side caching layer (`cache.py`) with Redis-backed caching and in-memory fallback, with a 24-hour TTL. Routes are defined in a single `routes.py` file (plus separate files for admin, auth, bookmarks, exports, payments, and national dashboard routes). The prediction endpoint (`GET /predict/data`) currently only returns raw data — all computation happens in the frontend.

The backend uses Pydantic models (`models.py`) for request/response validation. The `ConstituencyPredictionData` model currently passes only a subset of available fields (electors, votes, turnout, ENOP, candidate count, winner info, margin, and candidate lists). Adding new prediction factors would require either extending this model or creating a new endpoint that returns enriched feature data.

The database schema uses a composite unique index on `(state_name, year, constituency_no, candidate, poll_no, election_type)` for deduplication. Indexes exist for efficient querying by state+year, state+constituency+year, and state+election_type combinations. No materialized views or precomputed feature tables exist.

### Frontend Architecture

The frontend is a **React + TypeScript** SPA built with **Vite**, using **Radix UI** for accessible components and **Tailwind CSS** for styling. The prediction flow is entirely client-side: `App.tsx` manages prediction state (`AppPredictionParams`) with `useState` and a 200ms `useDebounce`, then computes predictions through a chain of `useMemo` hooks: `predData → baseline → predictions → summary`. This architecture means adding 20+ sliders would increase the state surface but not fundamentally change the reactive computation pattern — each slider adjustment triggers a 200ms debounced recomputation.

The `AppPredictionParams` interface currently has 9 fields. Extending it to 30+ fields is straightforward at the type level but requires careful UI design to avoid overwhelming users. The existing `PredictionPanel.tsx` already uses `Collapsible` components for progressive disclosure, which is the right pattern to extend.

Bookmarks serialize `AppPredictionParams` to JSON in the database. Adding new fields with sensible defaults ensures backward compatibility — old bookmarks will load with new fields at their defaults, producing predictions equivalent to "typical historical conditions."

### Data Flow Constraints

The current prediction data flow is: Backend SQL query → `ConstituencyPredictionData` JSON → Frontend `generateBaseline()` → `applyNewParty()` → `aggregateResults()` → React rendering. All computation is client-side. For a 200-constituency state, the frontend processes ~200 objects through 3 transformation stages, which completes in under 50ms on modern hardware. Adding factor-based adjustments to each constituency would scale linearly — 200 constituencies × 25 factors = 5000 arithmetic operations, still well under the 3-second performance target.

If ML-based predictions are added, they cannot run in the browser (no ONNX runtime or equivalent is currently set up). ML inference would need to happen on the backend, requiring a new endpoint that accepts slider values and returns predictions. This would shift the architecture from pure-frontend computation to a hybrid model where formula-based predictions run client-side and ML predictions require a backend round-trip.

### Constraints from Bookmarks and Backward Compatibility

The `bookmarks` table stores prediction parameters as `JSONB`. Old bookmarks contain the 9-field `AppPredictionParams` structure. Any extension must ensure that old bookmarks deserialize correctly, with new fields defaulting to values that produce predictions equivalent to the current formula. This is achievable if all new slider fields default to their "neutral" or "historical average" values.

---

## Industry Approaches

### Approach 1: Uniform National Swing (UNS) Model

The Uniform National Swing model, widely used in UK election analysis (and historically by the BBC and Nuffield studies), assumes that the change in party vote share from one election to the next is uniform across all constituencies. Given a predicted national/state-level swing of X% toward Party B and away from Party A, UNS applies this swing equally to every constituency, then determines winners based on the adjusted vote shares.

In the Indian context, UNS would be implemented as a state-level swing model: user-specified sliders set the expected swing for each major party, and the model applies these uniformly across all constituencies. This is essentially what the current `generateBaseline()` function does with its `antiIncumbencyPct` parameter, but generalized to multi-party swings rather than a binary incumbent-vs-challenger transfer.

UNS is simple to implement and interpret but known to be inaccurate in Indian elections because swing is highly non-uniform — urban constituencies swing differently from rural ones, alliance realignment creates localized surges, and candidate-level factors dominate in many seats.

### Approach 2: Proportional Swing Model with Factor Adjustments

This approach extends UNS by allowing non-uniform swing driven by constituency-level factors. Each factor modifies the base swing for a specific constituency. For example, if the base anti-incumbency swing is 5% against the incumbent party, but a constituency has a strong incumbent candidate (high `no_terms`, same constituency, high previous margin), the effective swing for that constituency might be reduced to 2%. Conversely, a weak incumbent (turncoat, first-term, slim margin) might face 8% swing.

Mathematically, for each constituency $c$ and party $p$:

$$\Delta V_{c,p} = S_p \cdot \prod_{f \in F} (1 + \alpha_f \cdot x_{c,f})$$

where $S_p$ is the base swing for party $p$, $F$ is the set of factors, $\alpha_f$ is the factor coefficient, and $x_{c,f}$ is the normalized factor value for constituency $c$. This multiplicative formulation ensures factors interact (e.g., high turnout + weak incumbent amplifies swing) rather than simply adding independently.

This is the approach most naturally suited to a slider-based UI — each slider controls one factor's base value, and the engine applies constituency-specific adjustments.

### Approach 3: Regression-Based Vote Share Prediction

This approach treats vote share prediction as a supervised regression problem. For each candidate-constituency pair, a linear or regularized regression model predicts vote share percentage based on the 25 identified features. The model is trained on historical data (all states, all years with sufficient feature coverage) and applied to predict future elections by inputting expected feature values.

The slider interface maps naturally to this approach: each slider controls one feature's value, and the regression coefficients translate slider changes to vote share changes. Users effectively explore the regression surface. Confidence intervals come from the regression's residual variance.

The challenge is that linear regression may not capture interaction effects (e.g., the interaction between turnout change and incumbency) and may overfit with 25 features when some constituencies have only 3 historical data points. Ridge or LASSO regularization can mitigate overfitting.

### Approach 4: Ensemble ML Classification + Regression

This approach follows the pattern established in the existing notebook: train ensemble models (Random Forest, XGBoost, Gradient Boosting) on historical data with all features, use classification to predict win/loss probability and regression to predict vote share. The ML models capture non-linear interactions and feature importance hierarchies automatically.

The slider UI would work by adjusting feature values fed to the model. Default slider positions correspond to historical averages, and adjustments change the model's input features. The model outputs probability distributions rather than point estimates, enabling natural confidence intervals.

This approach requires backend inference (models too large for browser), serialized model artifacts (pickle, ONNX, or joblib), and a new API endpoint. The existing notebook already demonstrates the training pipeline; the gap is deployment and integration.

### Approach 5: Hybrid Formula + ML with Ensemble Averaging

This approach runs two prediction modes in parallel: a formula-based proportional swing model (Approach 2) and an ML model (Approach 4), then combines their outputs using a weighted average or stacking. The formula-based model provides interpretability and immediate responsiveness (runs client-side), while the ML model provides accuracy and captures complex interactions.

Users see both predictions — the formula estimate, the ML estimate, and a blended average. The blend weight can itself be a parameter or fixed based on validation performance. This gives users transparency into how different methodologies produce different results.

### Approach 6: Bayesian Hierarchical Model

This approach models election outcomes using a Bayesian hierarchical framework. Prior distributions for each factor are learned from historical data at the national level, then updated with state-level and constituency-level data. The posterior predictive distribution naturally provides credible intervals (Bayesian confidence intervals).

The hierarchical structure handles data sparsity gracefully: constituencies with limited data borrow strength from state-level and national-level priors. This is particularly valuable for newly formed states or constituencies with only 1-2 historical elections.

However, Bayesian models are computationally expensive (MCMC or variational inference), complex to implement, and difficult to explain to users. They are academically elegant but may be over-engineered for a slider-based prediction UI.

---

## Approach Compatibility Assessment

### Approach 1 (UNS): Low Compatibility
The current system already implements a simplified UNS model. Extending it to 20+ sliders without factor adjustments would still produce uniform predictions — all sliders would affect all constituencies equally. This defeats the stated goal of constituency-specific predictions. UNS can serve as a fallback baseline for data-sparse constituencies but is insufficient as the primary approach.

### Approach 2 (Proportional Swing + Factors): High Compatibility
This approach is the most natural fit for the existing architecture. The `generateBaseline()` function already applies a uniform factor (anti-incumbency) and would be extended to apply 20+ factors with constituency-specific adjustments. All computation can remain client-side. The slider UI maps directly to factor values. The `ConstituencyPredictionData` model needs enrichment with factor data (which the backend can precompute), but the reactive `useMemo` chain stays the same. Backward compatibility is preserved by defaulting all new factors to neutral values.

### Approach 3 (Regression): Medium Compatibility
Regression coefficients can be precomputed and stored as static data, allowing client-side prediction. The slider-to-coefficient mapping is elegant. However, linear regression struggles with the non-linear interactions that are important in Indian elections (e.g., turnout × incumbency). Feature engineering to capture interactions increases model complexity beyond what's interpretable in a slider UI.

### Approach 4 (ML Ensemble): Medium Compatibility
Requires a backend inference endpoint, which is a new architectural component. The existing backend is FastAPI-based and can serve ML predictions, but serialized models need to be stored, loaded, and versioned. The 3-second performance constraint is achievable for state-level inference (200 constituencies × 25 features → ~200 model predictions, feasible in <1 second even with XGBoost). However, this approach makes predictions opaque — users adjust sliders but can't trace how each slider affects the output.

### Approach 5 (Hybrid Formula + ML): High Compatibility
This combines the strengths of Approaches 2 and 4. The formula-based mode runs client-side with immediate feedback, while the ML mode requires a backend round-trip. Users can choose between modes or see both. This adds complexity but matches the refined prompt's requirement for both formula-based and ML-based prediction modes. Implementation is phased: formula-based first (pure frontend), ML second (backend integration).

### Approach 6 (Bayesian): Low Compatibility
The computational requirements (MCMC) are incompatible with the 3-second constraint unless inference is pre-computed. The complexity is disproportionate to the UI's slider-based interaction model. While theoretically superior for handling data sparsity, the practical implementation challenges outweigh the benefits for this use case.

---

## Edge Cases and Risks

### Data Sparsity Risks

**Small states and new states:** States like Goa (40 constituencies), Sikkim (32), Mizoram (40), and Nagaland (60) have very few constituencies, often with only 3-5 general election cycles. With 25 features and 120-200 data points, overfitting is virtually guaranteed for state-specific models. Mitigation: use national-level models with state indicators, or fall back to simpler 3-5 factor models for data-sparse states.

**New delimitation boundaries:** Post-2008 delimitation changed constituency boundaries in many states. This creates a "cold start" problem — constituencies that existed before delimitation cannot be directly compared to post-delimitation constituencies. The `delim_id` field helps group constituencies within the same delimitation period, but cross-delimitation comparison is explicitly out of scope.

**Missing feature fields:** The `age` column is entirely absent for GE elections. The `myneta_education` field is sparse for pre-2009 elections. The `sub_region` field is inconsistently populated across states. Any model relying on these features must handle missing values gracefully — either through imputation (median/mode from same state), exclusion from the model for that constituency, or using a reduced-feature model that omits unavailable factors.

### Overfitting Risks

With 25 features and potentially only 3 post-delimitation election cycles per state (3 × 200 constituencies = 600 observations), the feature-to-observation ratio is borderline. Many features are correlated (e.g., `is_incumbent`, `recontest`, `same_constituency`, `no_terms` all capture aspects of incumbency). Multicollinearity will inflate coefficient variance in regression models and produce unstable feature importance rankings.

Mitigation strategies: (a) regularization (LASSO/Ridge for regression, tree depth limits for ensembles), (b) feature selection guided by SHAP importance to reduce to 10-15 non-redundant features, (c) cross-validation across years (leave-one-election-out) rather than random splits that would leak constituency-level patterns.

### Computational Cost

**Formula-based predictions (client-side):** Negligible. Even with 25 factors × 300 constituencies, the computation is ~7500 arithmetic operations — microseconds on any modern device. No risk here.

**ML-based predictions (server-side):** XGBoost inference for 200 constituencies × 25 features takes approximately 5-50ms on a single CPU core. Well within the 3-second budget. The bottleneck would be database queries to fetch feature data, not model inference. Pre-computing and caching feature data (as the current `/predict/data` endpoint already does) eliminates this concern.

**Model training:** Training 19-feature XGBoost on ~10,000 records takes seconds. Training a national model on ~500,000+ records takes minutes. Training should happen offline (in notebooks or CI pipeline), not at request time.

### Slider Interaction Risks

When users adjust multiple correlated sliders simultaneously, the combined effect may produce implausible scenarios. For example, setting turnout to 95% (extreme high) while also setting anti-incumbency to 0% (no change desire) is internally contradictory — very high turnout in Indian elections almost always correlates with strong anti-incumbency sentiment. The system should not prevent users from creating such scenarios (they may have valid local knowledge), but should display warnings when slider configurations are historically unprecedented.

If factors are treated as independently adjustable but the underlying model was trained on correlated features, the prediction surface may be poorly calibrated in regions of feature space that have no historical precedent (extrapolation). Error margins should widen significantly when multiple sliders are far from their defaults.

### Alliance Modeling Risk

Alliance configuration is the single most powerful predictor of Indian election outcomes, but it is not directly captured in TCPD data. The existing codebase has hardcoded alliance definitions only for Tamil Nadu 2001-2021. Extending this to all states requires either: (a) a manually curated alliance database (high maintenance cost), (b) inference from seat-sharing patterns (unreliable — pre-electoral alliances don't always show up in seat-sharing data), or (c) treating alliance as a user-input parameter (the most practical approach — let users specify which parties are allied, and the system adjusts vote transfer assumptions accordingly).

### Handling of By-Elections and Multi-Phase Polls

The `poll_no` field distinguishes general elections (poll_no=0 or NULL) from by-elections (poll_no > 0). By-elections have fundamentally different dynamics — lower turnout, local issues dominate, national mood may not apply. The prediction system should filter out by-elections when computing historical baselines and factor averages. The current `_get_general_years()` function already does this implicitly by counting constituencies per year and filtering for "large" years.

Some Indian states conduct elections in multiple phases (common in UP, Bihar, West Bengal). All phases are tagged with the same `year` but may have different `month` values. Phase-specific effects (voter fatigue in later phases, influence of early-phase results on later phases) are not captured in TCPD data and cannot be modeled.

---

## Security Findings

### Current Security Posture

The prediction endpoint (`GET /predict/data`) requires authentication via `require_user` (in contrast to some other endpoints that use the more permissive `get_current_user` which allows anonymous access). This is appropriate — prediction data involves more detailed constituency breakdowns and should be access-controlled.

Input validation for the prediction endpoint is minimal — only `state` (required query parameter) and `election_type` (default "AE") are accepted, and the election type is validated against a whitelist ("AE" only). SQL queries use parameterized queries (`$1`, `$2`, etc.) via asyncpg, which prevents SQL injection.

### Security Considerations for New Prediction Endpoints

If new endpoints accept 25+ slider values as parameters, input validation becomes more critical. Each slider value must be validated against its expected range (e.g., turnout 0-100%, anti-incumbency 0-100%, age 18-100). Without validation, attackers could submit extreme or NaN values that cause prediction engine errors or produce misleading cached results.

If ML model inference is added, the model file (pickle/joblib) must be loaded from a trusted path — not from user-uploaded files. Pickle deserialization is a known arbitrary code execution vector. ONNX or TensorFlow SavedModel formats are safer alternatives.

Rate limiting should be applied to prediction endpoints to prevent abuse (automated parameter sweeps, denial-of-service via expensive computations). The existing API key and subscription infrastructure suggests rate limiting may already be partially implemented.

The bookmark system stores prediction parameters as JSONB. If the parameter schema is extended, ensure that bookmark deserialization validates parameter types and ranges — maliciously crafted JSONB payloads could contain unexpected field types.

---

## Performance Findings

### Current Performance Characteristics

The `GET /predict/data` endpoint executes a single SQL query joining two election years for a state. For Tamil Nadu (234 constituencies × ~12 candidates × 2 years ≈ 5600 rows), this is a lightweight query with proper indexing (`idx_tcpd_state_year`). The result is cached for 24 hours. Frontend prediction computation (200 constituencies × 3 factors) completes in <10ms. The 200ms debounce on slider changes prevents excessive recomputation.

### Performance Implications of 20+ Factors

**Data fetch:** If the backend needs to return enriched factor data (historical averages, previous election metrics, turncoat flags, etc.), the query becomes more complex — potentially requiring self-joins to look up previous election results for each constituency. For a 200-constituency state with 3 historical cycles, this could mean ~600 row lookups. With proper indexing, this should complete in <100ms. Pre-computing and caching factor data per state is recommended.

**Frontend computation:** Adding 20 factor adjustments per constituency increases computation by ~7x (from 3 factors to ~25). For 200 constituencies, this is still ~5000 operations — <1ms. No performance concern for formula-based predictions.

**ML inference:** If backend ML inference is added, the latency budget is: ~50ms for model prediction + ~100ms for data fetch + ~50ms for serialization/deserialization = ~200ms total. Well within the 3-second target. However, if the ML endpoint also needs to compute confidence intervals via bootstrapping (e.g., 100 bootstrap iterations), the cost multiplies to ~5000ms — potentially exceeding the budget. Pre-computed quantile predictions or analytic standard error formulas would be faster alternatives.

**Caching strategy:** The current 24-hour cache TTL is appropriate for prediction data (election records don't change frequently). For ML predictions, caching at the `(state, slider_configuration)` level would be beneficial but the combinatorial explosion of 25 continuous sliders makes exact-match caching impractical. Caching at "default slider values" for each state is the practical minimum.

### N+1 Query Risk

The current prediction data endpoint executes a single query for all constituencies. If factor enrichment requires per-constituency lookups (e.g., looking up previous election results for each constituency individually), this would create an N+1 query pattern. Mitigation: use a batch query that retrieves all historical data for a state in one query, then perform the join/enrichment in Python.

---

## Factor Data Availability Matrix

The following matrix estimates field population rates across Indian states and election eras. These are approximations based on TCPD data characteristics observed in the codebase.

| Factor | Pre-2000 AE | Post-2000 AE | Post-2010 AE | GE (all years) |
|--------|-------------|--------------|--------------|----------------|
| sex | 90%+ | 95%+ | 98%+ | 95%+ |
| age | 50-70% | 70-85% | 85-95% | **0% (missing)** |
| myneta_education | **0%** | 10-40% | 40-70% | 30-60% |
| tcpd_prof_main | 20-40% | 40-60% | 60-80% | 40-60% |
| no_terms | 30-50% | 70-85% | 85-95% | 60-80% |
| contested | 30-50% | 70-85% | 85-95% | 60-80% |
| incumbent | 40-60% | 80-90% | 90-98% | 70-85% |
| turncoat | 30-50% | 70-85% | 85-95% | 60-80% |
| recontest | 30-50% | 70-85% | 85-95% | 60-80% |
| same_constituency | 30-50% | 70-85% | 85-95% | 60-80% |
| same_party | 30-50% | 70-85% | 85-95% | 60-80% |
| turnout_percentage | 98%+ | 99%+ | 99%+ | 98%+ |
| vote_share_percentage | 98%+ | 99%+ | 99%+ | 98%+ |
| margin/margin_pct | 95%+ | 98%+ | 99%+ | 95%+ |
| enop | 95%+ | 98%+ | 99%+ | 95%+ |
| n_cand | 98%+ | 99%+ | 99%+ | 98%+ |
| constituency_type | 98%+ | 99%+ | 99%+ | 98%+ |
| district_name | 90%+ | 95%+ | 98%+ | **0% (missing)** |
| sub_region | Varies by state | Varies | Varies | Varies |
| party_type_tcpd | 80%+ | 90%+ | 95%+ | 85%+ |
| deposit_lost | 80%+ | 90%+ | 95%+ | 80%+ |

This matrix shows that the "safe" factors with near-universal availability are: turnout, vote share, margin, ENOP, candidate count, constituency type, sex, party, and party type. The "risky" factors with significant missing data are: age (missing for GE), education, profession, and sub-region.

---

## Summary of Key Findings

1. **The TCPD dataset provides 47 columns per record** across all Indian states, from which 25 prediction-relevant factors can be derived. Of these, approximately 15 have reliable data coverage across states and years, while 10 have significant gaps that require imputation or fallback strategies.

2. **The existing prediction engine is a simple 3-parameter uniform swing model** running entirely in the browser. It applies the same anti-incumbency percentage to every constituency and uses a hardcoded 70/30 vote redistribution rule. There are no error margins, no constituency-specific adjustments, and no ML integration.

3. **The ML notebook demonstrates a viable 19-feature classification and regression pipeline** for Tamil Nadu, achieving reasonable accuracy on held-out 2021 data. However, it is completely disconnected from the application — no model serialization, no API endpoint, no frontend integration.

4. **The most compatible approach for the slider-based UI is a proportional swing model with constituency-specific factor adjustments** (Approach 2), optionally augmented with ML predictions served from the backend (Approach 5 hybrid). The formula-based model can run entirely client-side with immediate feedback, preserving the current architecture.

5. **Alliance configuration is the most powerful but hardest-to-model factor.** It is not directly available in TCPD data and currently hardcoded only for Tamil Nadu. A practical solution is to let users specify alliances in the UI and have the system adjust vote transfer assumptions accordingly.

6. **Data sparsity is a real concern for state-specific models.** With only 3 post-delimitation election cycles for many states and 25 features, overfitting is a significant risk. National-level models with state indicators, regularization, and feature selection are necessary mitigations.

7. **The 3-second performance target is achievable** for both formula-based predictions (client-side, <10ms) and ML-based predictions (server-side, <200ms for inference). The bottleneck would be bootstrap-based confidence intervals, which should be replaced by analytic approximations or pre-computed quantiles.

8. **Backward compatibility with existing bookmarks** is achievable by defaulting all new slider fields to their "neutral" historical average values. Old bookmarks will produce the same predictions as before (within rounding tolerance).

9. **The `TCPD_GA_All_States_2026-4-30.csv.gz` dataset** is not currently loaded or referenced in the codebase. Its structure and relationship to the AE/GE datasets is unknown and should be investigated before assuming it provides additional prediction factors.

10. **Error margin calculation** should combine three sources of uncertainty: (a) historical variance for similar slider configurations (empirical confidence intervals from past elections), (b) data quality penalties (wider intervals when factor data is missing or imputed), and (c) slider divergence penalties (wider intervals when multiple sliders are far from their defaults, indicating extrapolation into uncharted territory).
