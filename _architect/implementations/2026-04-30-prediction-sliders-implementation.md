# Multi-Factor Election Prediction Slider System — Implementation Report

**Date:** 2026-04-30
**Source Plan:** `_architect/analysis/2026-04-30-prediction-sliders.md`
**Status:** Ready for implementation

---

## 1. Implementation Overview

This report decomposes the strategic plan for the multi-factor election prediction slider system into granular, actionable implementation steps. The work transforms the existing three-parameter prediction engine into a twelve-to-fifteen-slider instrument with both formula-based and ML-based prediction paths, grounded in data science research on TCPD election datasets.

The implementation spans five phases across four areas of the codebase. Phase 1 produces data science research in `datascience/notebooks/`, exporting regression coefficients and trained ONNX models. Phase 2 adds new API endpoints in `api/` for factor metadata and ML prediction. Phase 3 refactors the client-side prediction engine in `frontend/src/engine/predictionEngine.ts` to support multiplicative multi-factor adjustment. Phase 4 extends the slider UI in `frontend/src/components/PredictionPanel.tsx` with new collapsible factor sections and alliance configuration. Phase 5 validates the full system end-to-end.

The critical path for a single developer is Phase 1 → Phase 3 → Phase 4 (formula-only) → ship → Phase 2 → Phase 4 (ML integration) → Phase 5. Phases 1 and 3 together produce a complete, shippable formula-based multi-factor prediction system.

---

## 2. Technology Stack Summary

**Backend (api/):** Python FastAPI 0.115.12, asyncpg 0.30.0 for PostgreSQL connection pooling (not SQLAlchemy — the API uses raw asyncpg queries throughout), Redis via `redis[hiredis]>=5.0.0` for caching, Pydantic v2 for request/response validation. The API uses `ORJSONResponse` as the default response class. Route organization follows a multi-file pattern: `routes.py` (main data endpoints), `auth_routes.py`, `bookmark_routes.py`, `admin_routes.py`, `national_routes.py`, `export_routes.py`, `payment_routes.py`, `apikey_routes.py`, `og_routes.py`. Each route file defines an `APIRouter` instance. All routers are registered in `main.py` under a `v1 = APIRouter(prefix="/v1")` router as the primary path, with legacy unprefixed routes registered separately during a deprecation period. The codebase uses parameterized SQL queries (`$1`, `$2` syntax) throughout, not ORM queries.

**Database:** PostgreSQL accessed via asyncpg. Tables created inline in the `lifespan` handler of `main.py` (not via Alembic migrations for the core `tcpd_ae` table — Alembic is used for supplementary tables like subscriptions, prediction scores, composite indexes, and materialized views). The `alembic/versions/` directory contains five migration files. The main election data table `tcpd_ae` has forty-six columns including all TCPD fields.

**Frontend (frontend/):** React 19.2.4 with TypeScript 6.0.3, Vite 8.0.4 as bundler, Tailwind CSS 4.2.4 via `@tailwindcss/vite` plugin. UI primitives from Radix UI: `@radix-ui/react-collapsible` (1.1.11), `@radix-ui/react-slider` (1.3.5), `@radix-ui/react-dialog`, `@radix-ui/react-select`, `@radix-ui/react-tabs`, `@radix-ui/react-toggle-group`, `@radix-ui/react-tooltip`, `@radix-ui/react-visually-hidden`. State management is props-based with React Context (`AuthContext.tsx`, `StateContext.tsx`) and `useState` in `App.tsx`. Prediction parameters flow from `App.tsx` via `predParams`/`setPredParams` state through debounced updates (200ms via `useDebounce`). API calls go through `frontend/src/api.ts` which uses `fetch()` with Bearer token auth, CSRF tokens, and a client-side cache with 5-minute TTL. Lazy loading via `React.lazy()` for all route components.

**Prediction Engine:** Three functions in `frontend/src/engine/predictionEngine.ts`: `generateBaseline` (applies anti-incumbency swing, electorate scaling, turnout), `applyNewParty` (affinity-weighted vote redistribution), `aggregateResults` (seat count aggregation). The engine operates on `ConstituencyPredictionData` objects fetched from `GET /v1/predict/data`. Current parameters are `PredictionParams` (antiIncumbencyPct, turnoutPct, growthFactor) and `AppPredictionParams` which adds new party configuration (name, color, preset, statewide vote share, affinity weights, constituency overrides).

**Prediction UI:** `PredictionPanel.tsx` renders four Radix `Collapsible.Root` sections: Global Parameters (always visible, contains anti-incumbency slider, total electors input, turnout slider), New Party / Third Front (collapsed by default), Affinity Weights (collapsed by default), Per-Constituency Overrides (collapsed by default). A custom `Slider` component wraps `@radix-ui/react-slider` in `frontend/src/components/ui/slider.tsx`.

**Data Science (datascience/):** Jupyter notebooks 01-07, pandas 2.2.3, scikit-learn 1.6.1, XGBoost 3.0.0, SHAP 0.46.0, SQLAlchemy 2.0.40 for database queries via `datascience/db.py`. The `db.py` module provides `query()`, `query_all()`, `query_ae()`, `query_ge()` functions returning pandas DataFrames.

**Testing:** Frontend uses Vitest (configured in `vite.config.js` with `jsdom` environment and `globals: true`). Existing test file at `frontend/src/engine/__tests__/predictionEngine.test.ts` with fixtures for `generateBaseline`, `applyNewParty`, `aggregateResults`. Testing library: `@testing-library/react` 16.0.0, `@testing-library/jest-dom` 6.0.0. Backend uses pytest with `pytest-asyncio` and `httpx.AsyncClient` via `ASGITransport`. Test fixtures in `api/tests/conftest.py` provide `client`, `auth_headers`, `admin_headers`. Playwright configured for E2E testing (`@playwright/test` 1.52.0, `@axe-core/playwright` 4.11.2 for accessibility).

**Deployment:** Docker containers orchestrated via `docker-compose.yml`. Railway deployment with `railway.toml` in both root and `api/` directories.

---

## 3. Phase-by-Phase Implementation

### Phase 1: Data Science Research and Factor Discovery

#### Phase Header

This foundation phase conducts empirical research on TCPD datasets to produce the factor catalog, regression coefficients, trained ML models, and error margin parameters that both the formula and ML layers depend on. It delivers Jupyter notebook(s) in `datascience/notebooks/` and exported artifacts (coefficient JSON, ONNX model files) in `datascience/output/`. This phase has no dependencies on other phases and is the highest-risk, highest-effort phase.

#### Prerequisites

The PostgreSQL database must contain the `tcpd_ae` table populated with TCPD Assembly Election data for all Indian states. The `datascience/db.py` module must be functional with a valid `DATABASE_URL`. The datascience Python environment must have all dependencies from `datascience/requirements.txt` installed, which already includes pandas, scikit-learn, XGBoost, SHAP, and SQLAlchemy.

#### Step-by-Step Breakdown

**Step 1.1: Data Profiling and Completeness Analysis**

What to do: Create a new notebook `datascience/notebooks/08_factor_discovery.ipynb` that loads all three TCPD datasets (AE, GE, GA) using the `db.py` query functions. For the AE dataset, compute a completeness matrix showing the percentage of non-null values for every column, broken down by state and election year. Identify which states have three or more post-delimitation election cycles (post-2008 for states that underwent delimitation, post-2000 for others). Profile the GA dataset (`TCPD_GA_All_States`) by querying the database or loading from CSV to determine its structure and whether it contains supplementary data useful for predictions. Document findings in markdown cells.

Where to do it: `datascience/notebooks/08_factor_discovery.ipynb`. The notebook imports from `datascience/db.py` following the pattern established by notebooks 01-07 (each of which imports `from db import query, query_all, query_ae`).

How it connects: The completeness matrix determines which factors have sufficient data coverage (ninety percent or higher for post-2000 elections) to be included in the twelve-to-fifteen factor set. States with three or more cycles get constituency-specific calibration; others get state-level or national fallback.

Technology-specific guidance: Use `db.query_all()` without a state filter to get all AE data. Use `pd.DataFrame.isnull().mean()` for completeness. Group by `state_name` and `year` using pandas `groupby`. For the GA dataset, check whether the database has a `tcpd_ga` table; if not, load from CSV if the file exists in the workspace.

What to watch out for: The `election_type` column distinguishes AE from GE data within the `tcpd_ae` table — filter on `"State Assembly Election (AE)"`. The existing database stores all data in a single `tcpd_ae` table regardless of election type. The `age` column and `district_name` column may be missing from GE records, which is why GE is deferred.

Verification: The notebook contains a clear summary table showing data coverage per state, a list of states with three or more post-delimitation cycles, and a documented decision on whether the GA dataset is in scope.

**Step 1.2: Feature Engineering**

What to do: In the same notebook (or a continuation), engineer the twelve to fifteen candidate features from the raw TCPD columns. The target features are: `turnout_percentage` (directly available), `turnout_change` (derived: current year turnout minus previous year turnout for the same constituency), `previous_margin_percentage` (derived: margin percentage from the most recent previous election for the same constituency), `enop` (directly available), `n_cand` (directly available), `constituency_type` (directly available, encode as binary urban/rural), `is_female` (derived from `sex` column: 1 if female, 0 otherwise), `is_incumbent` (derived from `incumbent` column), `is_turncoat` (derived from `turncoat` column), `is_recontest` (derived from `recontest` column), `is_same_constituency` (derived from `same_constituency` column), `party_type_tcpd` (directly available, encode as categorical or ordinal), `previous_party_seats` (derived: number of seats the candidate's party won in the previous election in the same state), `previous_party_average_vote_share` (derived: average vote share of the candidate's party in the previous election in the same state). For each feature, compute univariate correlation with outcome (binary win at position 1), SHAP importance from a baseline Random Forest classifier, and coefficient from logistic regression. Rank features by predictive power.

Where to do it: Continue in `datascience/notebooks/08_factor_discovery.ipynb`.

How it connects: The feature ranking determines the final factor set. Features below a SHAP importance threshold are removed. The derived features require self-joins on the tcpd_ae table (matching constituencies across election years), which the `db.query()` function supports via custom SQL.

Technology-specific guidance: For derived features like `turnout_change` and `previous_margin_percentage`, use pandas merge/join on `(state_name, constituency_name)` across consecutive general election years. The `incumbent`, `turncoat`, `recontest`, and `same_constituency` columns contain string values like `"Yes"` or `"No"` — convert to binary integers. Use `sklearn.ensemble.RandomForestClassifier` for SHAP baseline (already in requirements). Use `shap.TreeExplainer` for SHAP values (SHAP 0.46.0 is in requirements).

What to watch out for: The `turncoat`, `incumbent`, `recontest`, and `same_constituency` columns may contain null values for many records — handle these as "unknown" or impute based on other fields. The `party_type_tcpd` column uses categories like "National", "State", "Registered (Unrecognized)" — decide on encoding. Ensure feature engineering is done strictly within the training window to avoid data leakage (no future data used to compute features for a given election year).

Verification: A ranked feature importance table with SHAP values, a correlation matrix visualization, and a clear list of the final twelve to fifteen features selected for the factor catalog.

**Step 1.3: Factor Catalog Documentation**

What to do: For each selected factor, document in a structured format: whether it is candidate-level, constituency-level, or state-level; its valid range (min/max observed values); its distribution (mean, median, standard deviation); its default value definition (constituency-specific actual value for constituency-level factors, state historical average for state-level factors, historically observed average effect coefficient for candidate-level impact sliders); and its expected direction and magnitude of effect on vote share. Produce the factor catalog as a markdown table in the notebook and as a JSON file exported to `datascience/output/factor_catalog.json`.

Where to do it: `datascience/notebooks/08_factor_discovery.ipynb` for the analysis, `datascience/output/factor_catalog.json` for the export.

How it connects: The factor catalog JSON is consumed by both the frontend (Phase 3, loaded as a TypeScript constant) and the API (Phase 2, returned by the factor metadata endpoint). The schema must match what both consumers expect.

Technology-specific guidance: Use `pd.DataFrame.describe()` for distribution statistics. Export the JSON using `json.dump()` with a schema structured as a list of factor objects, each with keys: `name`, `display_name`, `category` (one of "turnout_mobilization", "incumbency_dynamics", "electoral_competition", "geographic_structural", "party_strength"), `level` (one of "candidate", "constituency", "state"), `range` (object with `min` and `max`), `step` (slider step increment), `default_type` (one of "constituency_actual", "state_average", "coefficient"), `direction` (one of "positive", "negative", "bidirectional"), `tooltip` (human-readable description).

What to watch out for: The distinction between candidate-level impact sliders and constituency-level value sliders is critical. A slider labeled "Turncoat Penalty Severity" modulates the effect where turncoat status exists in the data. A slider labeled "Expected Turnout" directly sets the turnout value. The catalog must encode this distinction.

Verification: The JSON file parses correctly, contains twelve to fifteen entries, and every entry has all required fields with valid values within documented ranges.

**Step 1.4: Alliance Configuration Data Curation**

What to do: Extend the alliance data pattern from `datascience/db.py` (which currently hardcodes Tamil Nadu alliances for 2001-2021) to at least the ten major states listed in the plan (Tamil Nadu, Maharashtra, Uttar Pradesh, West Bengal, Karnataka, Madhya Pradesh, Rajasthan, Bihar, Andhra Pradesh, Gujarat). For each state, document alliance configurations for the last three election cycles. Design and export the alliance data as a JSON file at `datascience/output/alliance_data.json`.

Where to do it: `datascience/notebooks/08_factor_discovery.ipynb` for research. `datascience/output/alliance_data.json` for export. Reference the existing alliance pattern in `datascience/db.py`.

How it connects: The alliance data JSON is consumed by the frontend (Phase 4) to pre-populate alliance configuration UI defaults. The API (Phase 2) may serve this data via the factor metadata endpoint.

Technology-specific guidance: The alliance JSON schema should be: `{ "<state_name>": { "<year>": [ { "name": "<alliance_name>", "parties": ["<party1>", "<party2>"], "transfer_efficiency": 0.85 } ] } }`. The default transfer efficiency of 0.85 can be adjusted per alliance based on historical analysis.

What to watch out for: Alliance configurations change between elections. The `PARTY_ALIASES` in `routes.py` and `normalizeParty()` in `constants.ts` must be accounted for — alliance party names should use the normalized forms. Indian alliance politics is complex (pre-poll vs. post-poll alliances, seat-sharing arrangements) — simplify to pre-poll seat-sharing alliances for the initial release.

Verification: Alliance data covers at least ten states with at least two election cycles each. Party names in the alliance data match the normalized party names used throughout the codebase.

**Step 1.5: Formula Coefficient Derivation**

What to do: Using multivariate linear regression on historical AE data, compute the marginal effect of each factor on vote share percentage, controlling for all other factors. Produce state-specific coefficients for states with sufficient data (three or more post-delimitation cycles) and national-level coefficients as fallback. Apply Ridge or LASSO regularization to prevent coefficient inflation. Validate using temporal cross-validation: train on pre-2016 data to predict 2016 results, train on pre-2021 data to predict 2021 results. Export coefficients as JSON to `datascience/output/coefficients.json`.

Where to do it: `datascience/notebooks/08_factor_discovery.ipynb` for analysis. `datascience/output/coefficients.json` for export.

How it connects: The coefficients JSON is the primary input for the frontend formula engine (Phase 3). It is loaded as a static TypeScript constant. The JSON schema is: `{ "_national": { "<factor_name>": <coefficient_float>, ... }, "<state_name>": { "<factor_name>": <coefficient_float>, ... }, ... }`.

Technology-specific guidance: Use `sklearn.linear_model.Ridge` or `sklearn.linear_model.Lasso` for regularized regression. The dependent variable is vote share percentage. Normalize features to zero-mean, unit-variance before regression so that coefficients are comparable. Use `sklearn.model_selection.TimeSeriesSplit` or manual temporal splits for cross-validation. The `_national` key provides fallback coefficients used when a state has insufficient data.

What to watch out for: Temporal cross-validation must be strict — no future data in training. States with only one or two election cycles cannot have state-specific coefficients and must use national fallback. If validation reveals overfitting (validation accuracy drops more than ten percentage points below training accuracy), reduce to the top eight to ten features by SHAP importance and re-derive coefficients.

Verification: Coefficients JSON contains `_national` key plus at least ten state-specific keys. Validation metrics (RMSE, winner prediction accuracy) are documented per state and per holdout year. Formula predictions at default slider settings reproduce historical baselines within rounding tolerance.

**Step 1.6: ML Model Training and ONNX Export**

What to do: Train ensemble ML models (Random Forest, XGBoost, Gradient Boosting) on historical AE data with all selected factors as features. Use temporal cross-validation across at least two holdout years (2016 and 2021). Compute accuracy, RMSE, and calibration metrics per state. Serialize the best-performing model in ONNX format using `skl2onnx` (for scikit-learn models) or `onnxmltools` (for XGBoost). Verify that the ONNX model produces predictions identical to the native library within floating-point tolerance of 1e-6 on the full validation set. Compute SHAP values for the trained model.

Where to do it: `datascience/notebooks/08_factor_discovery.ipynb` for training. Export model to `datascience/output/prediction_model.onnx`. Export SHAP feature importances to `datascience/output/shap_importances.json`.

How it connects: The ONNX model is loaded by the API server (Phase 2) at runtime via `onnxruntime`. SHAP values are returned as per-prediction feature attributions in the ML endpoint response.

Technology-specific guidance: XGBoost 3.0.0 is already in the datascience requirements. For ONNX export, add `skl2onnx` and `onnxmltools` to `datascience/requirements.txt`. Use `xgboost.XGBClassifier` or `XGBRegressor` depending on whether predicting win/loss or vote share. For quantile predictions (needed for confidence intervals), train additional XGBoost models with `objective='reg:quantile'` at quantiles 0.10, 0.50, and 0.90. Pickle and joblib are explicitly forbidden for model serialization — ONNX only.

What to watch out for: Certain XGBoost configurations with custom objective functions or missing value handling can produce divergent ONNX output. If ONNX export fails or produces divergent predictions, simplify the model (reduce tree depth, remove custom objectives) until export is clean. If accuracy falls below sixty-five percent for a given state, flag that state for formula-only predictions.

Verification: ONNX model file exists and loads successfully with `onnxruntime.InferenceSession`. Predictions match native library output within 1e-6 tolerance. Per-state accuracy metrics are documented. States below sixty-five percent accuracy are flagged.

**Step 1.7: Error Margin Parameter Computation**

What to do: Compute analytic standard error formulas from the ensemble model's quantile predictions. For each factor and each state, estimate the variance of outcomes when the factor takes different values. Pre-compute the correlation structure between constituencies within each state (grouped by sub-region or district) to enable analytic variance propagation for aggregate seat-count uncertainty. Export error margin parameters to `datascience/output/error_margins.json`.

Where to do it: `datascience/notebooks/08_factor_discovery.ipynb`. `datascience/output/error_margins.json`.

How it connects: Error margin parameters are consumed by both the frontend formula engine (Phase 3, for approximate confidence intervals) and the API ML endpoint (Phase 2, for analytic confidence intervals). The correlation structure enables aggregate seat-count uncertainty computation.

Technology-specific guidance: Use the quantile regression models (q=0.10, q=0.50, q=0.90) trained in Step 1.6 to compute prediction intervals per constituency. For correlation structure, compute pairwise correlations between constituency-level residuals within each district/sub-region. Export as: `{ "<state_name>": { "constituency_variance": { "<constituency_name>": <variance_float> }, "district_correlation": { "<district_name>": <correlation_float> } } }`.

What to watch out for: Bootstrap resampling is explicitly prohibited for runtime confidence intervals due to the three-second latency budget. All error margin computation must be pre-computable or use analytic formulas at runtime.

Verification: Error margin JSON contains entries for all states with sufficient data. Confidence intervals from quantile models cover the actual outcomes at approximately the stated coverage rate (eighty percent of actuals fall within the eighty percent interval).

**Step 1.8: Fairness Assessment**

What to do: Evaluate whether predictions systematically under- or over-predict outcomes for SC/ST reserved constituencies, female candidates, or specific party types. Document bias patterns. If systematic bias exceeds two percentage points of vote share for any protected group, apply post-hoc calibration or feature interaction terms.

Where to do it: `datascience/notebooks/08_factor_discovery.ipynb`.

How it connects: The fairness assessment informs the model card documentation in Phase 5. It does not block release but documents known limitations.

Verification: Assessment is documented with quantified bias metrics per protected group.

**Step 1.9: Artifact Export**

What to do: Ensure all deliverables are exported to `datascience/output/`: `factor_catalog.json`, `coefficients.json`, `alliance_data.json`, `prediction_model.onnx`, `prediction_model_q10.onnx`, `prediction_model_q90.onnx` (quantile models), `shap_importances.json`, `error_margins.json`. Each file must be self-contained and machine-readable.

Where to do it: `datascience/output/`.

How it connects: Phase 2 consumes the ONNX models, SHAP importances, and error margins. Phase 3 consumes the coefficients and factor catalog. Phase 4 consumes the alliance data and factor catalog.

Verification: All files exist, parse correctly, and are consistent with each other (same factor names, same state names, same feature ordering).

#### Phase Deliverables

A comprehensive Jupyter notebook `datascience/notebooks/08_factor_discovery.ipynb` with all analysis, visualizations, and documentation. Eight exported artifact files in `datascience/output/`. Updated `datascience/requirements.txt` with any new dependencies (skl2onnx, onnxmltools, onnxruntime).

#### Phase Risks and Mitigations

Data sparsity for small states: mitigated by national-level fallback coefficients in the `_national` key of coefficients.json. Overfitting with twelve-plus features across three cycles: mitigated by Ridge/LASSO regularization, temporal cross-validation, and willingness to reduce to eight-to-ten features. ONNX export incompatibility: mitigated by model simplification if export produces divergent predictions.

---

### Phase 2: Backend API Development

#### Phase Header

This phase creates the backend infrastructure to serve factor metadata, ML predictions, and error margin computations. It adds two new route files and supporting infrastructure to the `api/` directory. This phase depends on Phase 1 model artifacts.

#### Prerequisites

Phase 1 artifacts must exist in `datascience/output/`: factor catalog JSON, ONNX model files, SHAP importances, error margins, and coefficients. The `api/` directory structure and conventions must be understood. The `onnxruntime` package must be added to `api/requirements.txt`.

#### Step-by-Step Breakdown

**Step 2.1: Factor Metadata Endpoints**

What to do: Create a new file `api/factor_routes.py` containing a `factor_router = APIRouter()` with two GET endpoints. The first, `GET /factors`, returns the full factor catalog loaded from the Phase 1 JSON export (or from a database table if preferred). The second, `GET /factors/{state}`, returns state-specific factor distributions and defaults. Both endpoints use the Redis-backed caching pattern from `cache.py` with a twenty-four-hour TTL, following the same `_get_cached_async`/`_set_cached_async` pattern used in `routes.py`.

Where to do it: Create `api/factor_routes.py`. Register it in `api/main.py` under both the `v1` router and app-level router.

How it connects: Registration in `main.py` follows the exact pattern of other route files. Add `from factor_routes import factor_router` to the imports at the top of `main.py`. Then add `v1.include_router(factor_router)` alongside the existing router registrations (after line 549 in `main.py` where `v1.include_router(router)` is). For the legacy unprefixed path, add `app.include_router(factor_router)` alongside the existing legacy registrations.

Technology-specific guidance: The route file follows the same structure as `bookmark_routes.py` or `admin_routes.py`: define an `APIRouter()`, define Pydantic response models, define endpoint functions with `async def`. The factor catalog JSON can be loaded once at module level (it is static data). Use `JSONResponse` or the default `ORJSONResponse` for the response. Cache keys should be `"factors:all"` and `"factors:{state}"`.

What to watch out for: The existing `GET /predict/data` endpoint in `routes.py` must not be moved — it serves constituency-level prediction data and is consumed by the existing frontend. The new factor endpoints provide metadata about the factors themselves, not prediction data.

Verification: Both endpoints respond with 200 status and valid JSON when hit via `httpx` test client. The factor catalog contains twelve to fifteen entries with all required fields.

**Step 2.2: Pydantic Prediction Models**

What to do: Define Pydantic request and response models for the ML prediction endpoint. The request model (`MLPredictionRequest`) must include `Field` constraints with `ge` and `le` bounds for every slider parameter: `turnout_pct: float = Field(ge=0.0, le=100.0)`, `turnout_change: float = Field(ge=-50.0, le=50.0)`, `previous_margin_pct: float = Field(ge=0.0, le=100.0)`, `enop: float = Field(ge=1.0, le=20.0)`, `n_cand: int = Field(ge=1, le=50)`, and so on for all factors. Include an optional `alliance_config` field: a list of alliance bloc objects, each containing `parties: list[str]` and `transfer_efficiency: float = Field(ge=0.5, le=1.0)`. The response model (`MLPredictionResponse`) includes per-constituency predictions with confidence intervals and SHAP attributions.

Where to do it: Define these models in either `api/factor_routes.py` or `api/prediction_routes.py` (or in `api/models.py` if preferred for co-location with existing models). The existing codebase defines Pydantic models in both `models.py` and inline within route files — follow whichever pattern is appropriate for the scope. Since these are prediction-specific, defining them in `prediction_routes.py` alongside the endpoint is consistent with how `bookmark_routes.py` defines `CreateBookmarkRequest` inline.

How it connects: The request model validates all incoming slider values before they reach inference code, preventing out-of-range values or type mismatches.

Technology-specific guidance: Follow the existing Pydantic v2 patterns in `models.py`: use `str | None = None` for optional fields (not `Optional[str]`), use `BaseModel` as the base class. Add `@field_validator` for any complex validation (e.g., verifying that alliance party names match known parties). The response model should include: `state: str`, `constituencies: list[ConstituencyMLPrediction]` (each with `constituency_name`, `predicted_winner`, `predicted_vote_shares: dict[str, float]`, `confidence_interval_low: float`, `confidence_interval_high: float`, `shap_top_factors: list[dict]`), and `aggregate: dict` with seat counts and uncertainty ranges.

What to watch out for: Every factor in the catalog must have explicit range validation. Do not rely on the model to silently clamp values — reject invalid inputs with 422 errors.

Verification: Submitting a request with out-of-range values returns 422. Submitting a valid request passes validation. All documented factors have corresponding fields with range constraints.

**Step 2.3: ML Prediction Endpoint**

What to do: Create a new file `api/prediction_routes.py` containing a `prediction_router = APIRouter()` with a `POST /predict/ml` endpoint. This endpoint accepts the validated `MLPredictionRequest` payload, loads the ONNX model via `onnxruntime`, assembles feature data from the database for all constituencies in the requested state, runs inference, and returns constituency-level predictions with analytic confidence intervals and top-five SHAP feature attributions per constituency. Feature data is assembled via a single batch SQL query retrieving all historical data for the state across the last three election cycles, then feature assembly happens in Python. The assembled feature data is cached per state with a twenty-four-hour TTL.

Where to do it: Create `api/prediction_routes.py`. Register in `api/main.py` following the same dual-registration pattern.

How it connects: The endpoint uses the ONNX model loaded at module level (or lazily on first request — see Step 2.5). It queries the same `tcpd_ae` table using `asyncpg` parameterized queries. Feature assembly mirrors the feature engineering logic from the Phase 1 notebook but implemented in Python for the API context.

Technology-specific guidance: The batch SQL query should fetch all data needed for feature assembly in one query, similar to how `prediction_data()` in `routes.py` fetches data with a single query filtered by state and years. Avoid N+1 patterns. Use `pool.fetch()` for the query (asyncpg pattern from existing code). Apply a dedicated rate limit of twenty requests per sixty seconds for this endpoint — implement this by adding a check at the top of the endpoint function using the existing Redis rate-limiting infrastructure in `main.py`, or by adding path-specific rate limiting configuration similar to `_AUTH_PATHS`/`_AUTH_RATE_LIMIT`.

What to watch out for: The ONNX model expects features in a specific order matching the training feature order. This order must be documented and enforced during feature assembly. The three-second latency target for the largest states (UP with 403 constituencies) requires efficient batch inference — use `onnxruntime.InferenceSession.run()` with batched input arrays, not per-constituency inference calls.

Verification: The endpoint returns 200 with valid prediction data for a known state. Response latency is under three seconds for large states. Rate limiting prevents more than twenty requests per sixty seconds from a single IP.

**Step 2.4: Error Margin Computation**

What to do: Implement error margin computation as part of the ML prediction response. Error margins combine three uncertainty sources: model uncertainty (spread between tenth and ninetieth percentile predictions from quantile models), data quality penalty (wider intervals when factor data is missing for the state, proportional to fraction of missing features), and slider divergence penalty (wider intervals when Euclidean distance of slider values from defaults exceeds a threshold). Aggregate seat-count uncertainty uses analytic variance propagation with block-correlated constituency win probabilities.

Where to do it: Within `api/prediction_routes.py`, as part of the prediction computation logic.

How it connects: The quantile models (loaded as separate ONNX files) provide the base uncertainty. The pre-computed correlation structure from Phase 1 error margins JSON provides the constituency correlation data for aggregate uncertainty.

Technology-specific guidance: Load the three ONNX models (q10, q50, q90) separately. Run inference with all three for each prediction request. The aggregate seat uncertainty formula is: expected seats for party P = sum of constituency-level win probabilities; variance = sum of individual variances plus pairwise covariance terms within each district group. The covariance terms come from the pre-computed correlation structure.

What to watch out for: The slider divergence penalty must increase monotonically with distance from defaults. Define a formula such as: `penalty_multiplier = 1 + 0.5 * (euclidean_distance / max_distance)` where `max_distance` is the distance when all sliders are at their extremes.

Verification: Confidence intervals widen when slider values deviate from defaults. Aggregate seat ranges are wider than what would result from assuming independent constituency outcomes.

**Step 2.5: Model Loading and Versioning**

What to do: Implement lazy loading of the ONNX models on first prediction request rather than at application startup, to mitigate cold-start latency on Railway. Add a `model_metadata` table in PostgreSQL with columns: `id SERIAL PRIMARY KEY`, `version TEXT NOT NULL`, `training_date TIMESTAMPTZ NOT NULL`, `accuracy_metrics JSONB`, `active BOOLEAN NOT NULL DEFAULT false`, `model_path TEXT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`. Create an Alembic migration for this table. Add a `GET /predict/model-health` endpoint that reports whether the model is loaded and the active model version.

Where to do it: Model loading logic in `api/prediction_routes.py`. Migration in `api/alembic/versions/0006_model_metadata.py`. Model health endpoint in `api/prediction_routes.py`.

How it connects: The `model_metadata` table allows model version management — insert a new row and set it active to deploy a new model, rollback by re-activating the previous version. The Alembic migration follows the existing pattern in `api/alembic/versions/` (files numbered 0001-0005).

Technology-specific guidance: Use `onnxruntime.InferenceSession(model_path)` for model loading. Store a module-level variable `_model_session: onnxruntime.InferenceSession | None = None` and load lazily. The Alembic migration file follows the pattern of existing migrations — use `op.create_table()` with appropriate column definitions. The migration file should be named `0006_model_metadata.py` with an auto-generated revision ID.

What to watch out for: The ONNX model file path must be relative to the API directory or configurable via environment variable. On Railway, the model file must be included in the Docker image or downloaded at startup. If the model is still loading when a request arrives, return a 503 response with a `Retry-After` header rather than hanging.

Verification: The model health endpoint returns the active model version and loaded status. The first ML prediction request triggers model loading. Subsequent requests use the cached model.

**Step 2.6: Circuit-Breaker Pattern**

What to do: Implement a circuit-breaker that validates the ML model's predictions against known historical election results. On model load (or on first prediction), run the model against the most recent held-out year's actual data. If the model's predictions deviate from actual results by more than ten percent of the state's total constituencies (e.g., twenty-three seats for Tamil Nadu's 234 constituencies), the ML endpoint returns a degraded response indicating that formula predictions should be preferred, and logs a warning.

Where to do it: Within `api/prediction_routes.py`, as a validation step during model initialization.

How it connects: The circuit-breaker prevents deployment of badly-retrained models. The degraded response must be handled gracefully by the frontend (Phase 4) — the prediction mode toggle should show a warning when ML predictions are degraded.

Technology-specific guidance: Store the circuit-breaker state as a module-level boolean. The validation runs once per model load. If validation fails, set a flag that causes the ML endpoint to return a response with a `"degraded": true` field and a `"warning"` message. Log the deviation details at WARNING level using the existing `logging.getLogger()` pattern.

What to watch out for: The percentage-based threshold (ten percent of total constituencies) ensures appropriate sensitivity for both small states (Goa with ~40 constituencies: four seat threshold) and large states (UP with 403: forty seat threshold). The validation must use held-out data that was not used during training.

Verification: A model with deliberately poor accuracy triggers the circuit-breaker. A model with acceptable accuracy passes validation.

**Step 2.7: Bucketed Prediction Caching**

What to do: Implement bucketed caching for ML predictions. Quantize slider values to the nearest five-percentage-point increment before computing cache keys, so that nearby slider configurations share cache entries. Pre-compute and cache default-configuration predictions for each state on first request. Custom slider configurations are cached for one hour with LRU eviction.

Where to do it: Within `api/prediction_routes.py`, wrapping the inference logic.

How it connects: Uses the existing `cache.py` module's `get_cached`/`set_cached` functions with appropriate TTLs. The cache key format should be `"ml_predict:{state}:{quantized_params_hash}"`.

Technology-specific guidance: Quantize each float slider value: `quantized = round(value / 5) * 5`. Compute a deterministic hash of the quantized parameters for the cache key. Use `hashlib.md5` or similar for the hash (not security-sensitive, just for cache key uniqueness). The default predictions cache key is simply `"ml_predict:{state}:defaults"`.

What to watch out for: The quantization means that predictions for slider values of 42% and 44% will return the same cached result (both quantize to 40%). This is acceptable for the use case but should be documented. Do not cache error responses or degraded circuit-breaker responses.

Verification: Two requests with slightly different slider values (within the same quantization bucket) return identical cached results. Requests with the same parameters within the TTL do not trigger model inference.

**Step 2.8: Database Migrations**

What to do: Create Alembic migration `0006_model_metadata.py` for the `model_metadata` table. If factor coefficients are served from the database rather than static files, create an additional migration for a `factor_coefficients` table. Optionally, create a migration for an alliance data table if the alliance configurations will be stored in the database rather than loaded from static JSON.

Where to do it: `api/alembic/versions/0006_model_metadata.py` (and potentially `0007_factor_coefficients.py`).

How it connects: Follows the existing Alembic migration pattern. The `alembic/env.py` uses synchronous SQLAlchemy with `create_engine`. Migration files use `op.create_table()`, `op.create_index()`, etc.

Technology-specific guidance: Follow the pattern of existing migrations (e.g., `0002_subscriptions.py`). Use `sa.Column` with appropriate types: `sa.String`, `sa.Boolean`, `sa.DateTime(timezone=True)`, `sa.JSON` (for JSONB). The migration must be reversible with a `downgrade()` function that drops the created tables.

What to watch out for: The `lifespan` handler in `main.py` also creates tables with `CREATE TABLE IF NOT EXISTS` — decide whether the `model_metadata` table should also be created there for safety, or rely solely on Alembic migrations. The existing pattern uses both (Alembic for formal migrations, lifespan handler for core tables).

Verification: Running `alembic upgrade head` creates the new table(s). Running `alembic downgrade -1` removes them.

**Step 2.9: Bookmark Deserialization Hardening**

What to do: When bookmarks containing prediction parameters are loaded in `bookmark_routes.py`, validate all parameter types and ranges against the prediction Pydantic model before using them. Add a `@field_validator` to the `CreateBookmarkRequest.params` field that checks for unexpected field types, out-of-range values, or injection attempts in the JSONB payload. Existing bookmarks with the old three-parameter schema must load correctly — missing fields should default to their calibrated values.

Where to do it: `api/bookmark_routes.py`, extending the existing `validate_params` field validator.

How it connects: The existing `CreateBookmarkRequest` in `bookmark_routes.py` already validates that params is a dict and its serialized size is under 10KB. Extend this validation to also verify that numeric fields are within expected ranges if they exist.

Technology-specific guidance: Add validation logic within the existing `validate_params` classmethod. Check for known prediction parameter keys and validate their types and ranges. Unknown keys should be preserved (for forward compatibility) but known numeric keys should be range-checked. Do not break existing bookmark loading — the validation should be lenient for missing fields (which will be filled with defaults by the frontend).

What to watch out for: Over-strict validation could break existing bookmarks. The validation should only reject clearly malicious values (e.g., negative turnout, turnout above 100, non-numeric values for numeric fields), not missing fields or extra fields.

Verification: Loading an old three-parameter bookmark returns valid data. Submitting a bookmark with out-of-range prediction values is rejected with an informative error.

#### Phase Deliverables

Two new route files (`factor_routes.py`, `prediction_routes.py`) registered in `main.py`. Pydantic models for prediction request/response. ONNX model loading with lazy initialization. Circuit-breaker validation. Bucketed caching. At least one Alembic migration. Updated `requirements.txt` with `onnxruntime`. Bookmark validation hardening.

#### Phase Risks and Mitigations

ML inference latency exceeding three seconds: mitigated by batch inference, bucketed caching, and lazy model loading. ONNX runtime compatibility issues on Railway's Linux environment: mitigated by testing in Docker locally before deployment. Model file size making Docker images large: mitigated by storing models as separate artifacts and downloading at startup if needed.

---

### Phase 3: Frontend Formula Engine Extension

#### Phase Header

This phase extends the client-side prediction engine with multi-factor adjustment formulas. Combined with Phase 1, this phase produces a complete, independently shippable product — the formula-based multi-factor prediction system with twelve to fifteen sliders. This phase depends on Phase 1 formula coefficients and factor catalog.

#### Prerequisites

Phase 1 artifacts must exist: `datascience/output/coefficients.json` and `datascience/output/factor_catalog.json`. The existing prediction engine in `frontend/src/engine/predictionEngine.ts` must be understood, along with the type definitions in `frontend/src/types.ts`.

#### Step-by-Step Breakdown

**Step 3.1: Extended AppPredictionParams Type**

What to do: Extend the `AppPredictionParams` interface in `frontend/src/types.ts` to include all twelve to fifteen slider fields, organized by category. Each new field has a documented type and default value. Maintain backward compatibility — the existing fields (`antiIncumbencyPct`, `totalElectors`, `turnoutPct`, `newPartyName`, `newPartyColor`, `newPartyPreset`, `newPartyStatewideVoteShare`, `affinityWeights`, `constituencyOverrides`) must remain. Add new fields for each factor with sensible defaults. Add a `predictionMode` field (`'formula' | 'ml'`). Add an `allianceConfig` field for alliance bloc specification.

Where to do it: `frontend/src/types.ts`, extending the `AppPredictionParams` interface (currently at line 429). Also update `DEFAULT_PREDICTION_PARAMS` in `frontend/src/constants.ts`.

How it connects: `AppPredictionParams` is the central type used by `App.tsx` (in `useState<AppPredictionParams>`), `PredictionPanel.tsx` (as a prop), and will be consumed by the refactored `predictionEngine.ts`. The `DEFAULT_PREDICTION_PARAMS` constant in `constants.ts` must include default values for all new fields so that old bookmarks (which lack these fields) deserialize with correct defaults.

Technology-specific guidance: Add fields like: `turnoutChangeFactor: number` (default 0, meaning no change from historical), `previousMarginFactor: number` (default 0), `enopFactor: number` (default 0), `incumbencyFatigueLevel: number` (default 0), `turncoatPenalty: number` (default 0), `recontestBonus: number` (default 0), `genderFactor: number` (default 0), `constituencyTypeFactor: number` (default 0), `partyStrengthFactor: number` (default 0), etc. The exact field names and defaults come from the Phase 1 factor catalog. Default of 0 for factor adjustment fields means "use historical baseline — no modification." Add `predictionMode: 'formula' | 'ml'` with default `'formula'`. Add `allianceConfig: AllianceBloc[]` where `AllianceBloc = { name: string; parties: string[]; transferEfficiency: number }`.

What to watch out for: Backward compatibility is critical. When `DEFAULT_PREDICTION_PARAMS` is spread over an old bookmark's params (as happens on line 223 of `App.tsx`: `setPredParams({ ...DEFAULT_PREDICTION_PARAMS, ...rest })`), the new fields must default to values that produce predictions equivalent to the current formula.

Verification: Old bookmarks load correctly with new fields at defaults. TypeScript compilation succeeds with no type errors.

**Step 3.2: Factor Configuration Module**

What to do: Create a new file `frontend/src/engine/factorConfig.ts` that exports the factor catalog as a TypeScript constant. This module loads from the Phase 1 JSON export (either embedded as a static constant or loaded from a JSON file via Vite's JSON import). It exports a `FACTOR_CATALOG` array and a `COEFFICIENTS` object (mapping state names to per-factor coefficients with `_national` fallback).

Where to do it: Create `frontend/src/engine/factorConfig.ts`. Optionally copy the Phase 1 JSON files to `frontend/src/engine/data/coefficients.json` and `frontend/src/engine/data/factor_catalog.json`.

How it connects: The factor catalog is consumed by `PredictionPanel.tsx` (Phase 4) for rendering slider labels, ranges, tooltips. The coefficients are consumed by `predictionEngine.ts` for computing factor modifiers.

Technology-specific guidance: Vite supports JSON imports natively. Create the data directory and copy the Phase 1 JSON exports. Import them as: `import coefficients from './data/coefficients.json'`. Export typed constants: `export const COEFFICIENTS: Record<string, Record<string, number>> = coefficients`. Define TypeScript interfaces for the factor catalog entries matching the JSON schema from Phase 1 Step 1.3.

What to watch out for: Coefficient values must exactly match the Phase 1 exports — no manual transcription. Use JSON import, not copy-paste into TypeScript. The `_national` key in coefficients provides fallback values when a state-specific key does not exist.

Verification: The TypeScript module compiles without errors. Factor names in the catalog match the coefficient keys. The `_national` fallback key exists and contains all factor names.

**Step 3.3: Factor Granularity Mapping**

What to do: Within `frontend/src/engine/factorConfig.ts`, define the mapping between slider types and their granularity. The system uses two kinds of sliders: state-level impact sliders (which modulate the severity of a factor's effect across all constituencies — labeled "Effect of X") and constituency-level value sliders (which override the actual value of a factor for specific constituencies). Document which factors are which type. State-level factors (turnout change, previous party seats, party average vote share) get a single slider applied uniformly. Candidate-level factors used as state-wide impact sliders (turncoat penalty, incumbency fatigue, recontest bonus, gender factor) modulate the penalty/bonus where the factor exists in the data. Constituency-level factors (previous margin, ENOP, candidate count, constituency type) can be overridden per constituency.

Where to do it: `frontend/src/engine/factorConfig.ts`, as part of the factor catalog type definition.

How it connects: This mapping determines how the formula engine (Step 3.4) applies each factor. Impact sliders multiply the regression coefficient by the slider value; value override sliders replace the constituency's actual value with the slider value.

Technology-specific guidance: Add a `sliderType: 'impact' | 'value' | 'state'` field to each factor catalog entry. Impact sliders have a range of [-1.0, 1.0] centered at 0 (default). Value sliders have ranges matching the factor's natural range. State sliders are applied uniformly.

What to watch out for: The distinction between "Effect of Turncoat Penalty" (impact slider) and "Turnout %" (value slider) is critical for user understanding. This mapping drives the UI labeling in Phase 4.

Verification: Every factor in the catalog has an assigned slider type. The mapping is consistent with the factor's granularity level (candidate/constituency/state).

**Step 3.4: Refactored predictionEngine.ts**

What to do: Refactor `generateBaseline()` in `frontend/src/engine/predictionEngine.ts` to support multi-factor adjustments. Replace the single anti-incumbency transfer logic with a multiplicative proportional swing model. For each constituency and each party, compute the vote share adjustment as the product of factor modifiers: each modifier is $(1 + \alpha_f \times x_{c,f})$ where $\alpha_f$ is the regression coefficient for factor $f$ and $x_{c,f}$ is the normalized factor value (zero at default, positive or negative for deviations). Clamp the total modifier product to $[0.5, 2.0]$. Apply factors in the canonical order: state-level factors first, then constituency-level, then candidate-level. Within each level, multiply modifiers simultaneously. After all factors are applied, renormalize vote shares to sum to one, and ensure total predicted votes do not exceed valid votes.

Where to do it: `frontend/src/engine/predictionEngine.ts`, modifying the `generateBaseline()` function. The function signature must be updated to accept the extended `AppPredictionParams` (or a new `MultiFactorPredictionParams` type) instead of the current `PredictionParams`.

How it connects: The function is called from `App.tsx` (or the component that manages prediction state). The coefficients come from the `factorConfig.ts` module. The constituency data comes from the existing `ConstituencyPredictionData` type, which already contains the raw factor values (turnout_percentage, enop, n_cand, constituency_type, etc.) as returned by the `GET /v1/predict/data` endpoint.

Technology-specific guidance: The existing `generateBaseline()` already computes vote share adjustments and normalizes them to sum to one — extend this pattern rather than rewriting from scratch. Keep the existing anti-incumbency logic as one of the factor modifiers. The growth factor and turnout adjustment logic can remain as-is since they are already implemented. The new factor modifiers are computed by looking up each factor's value from the `ConstituencyPredictionData` object, comparing it to the default (via the slider value), computing the modifier, and multiplying into the cumulative modifier for each party. Import `COEFFICIENTS` and `FACTOR_CATALOG` from `factorConfig.ts`.

What to watch out for: Vote conservation is the critical invariant. After all modifiers and renormalization, shares must sum to one within floating-point tolerance, and total votes must not exceed valid votes. The clamping to $[0.5, 2.0]$ prevents multiplicative explosion but must be applied per-party (not globally). The existing `normalizeParty()` function is used throughout the engine — continue using it for party name matching.

Verification: Default slider values produce predictions identical to the current baseline (within rounding tolerance). Moving a single slider from its default changes the prediction. Vote shares sum to one for all constituencies. Total predicted votes do not exceed valid votes.

**Step 3.5: Alliance Configuration Logic**

What to do: Implement alliance vote transfer logic in the formula engine. When alliance blocs are specified in `AppPredictionParams.allianceConfig`, redistribute votes among allied parties. In constituencies where allied parties previously competed, transfer the weaker allied party's historical vote share to the stronger party at the specified efficiency rate (default eighty-five percent). Subtract transferred votes from the weaker party.

Where to do it: `frontend/src/engine/predictionEngine.ts`, as a post-processing step after the multi-factor modifiers are applied but before final normalization. This is conceptually similar to how `applyNewParty()` works — it redistributes votes between parties.

How it connects: The alliance config comes from `AppPredictionParams.allianceConfig`, set by the alliance configuration UI in Phase 4. The logic extends the existing vote redistribution pattern established by `applyNewParty()`.

Technology-specific guidance: For each constituency, identify which parties in the results are part of alliance blocs. Within each bloc, find the party with the highest vote share (the "lead" party). Transfer each non-lead allied party's votes to the lead party at the efficiency rate. This is a post-modifier adjustment: apply alliance transfers after factor modifiers but before the final renormalization step.

What to watch out for: A party might appear in multiple constituencies with different relative strengths — the lead party within a bloc is determined per-constituency, not globally. The efficiency factor must be clamped to [0.5, 1.0]. Alliance transfers must preserve vote conservation.

Verification: Forming an alliance increases the lead party's vote share. Breaking an alliance decreases it. Vote conservation is maintained.

**Step 3.6: Formula-Based Error Margins**

What to do: Implement approximate confidence interval computation in the formula engine using the variance parameters from Phase 1 error margins JSON. For each constituency, compute an error range based on the historical variance of outcomes under similar conditions. Widen the range when slider values deviate from defaults. Expose these as optional fields on the `PredictionResult` type: `errorMarginLow: number | null`, `errorMarginHigh: number | null`.

Where to do it: `frontend/src/engine/predictionEngine.ts`, as part of the `generateBaseline()` return value. Extend the `PredictionResult` interface in `frontend/src/types.ts` with error margin fields.

How it connects: The error margins are displayed by Phase 4 UI components (Step 4.3). The variance parameters are loaded from the Phase 1 export via `factorConfig.ts`.

Technology-specific guidance: Load error margin parameters alongside coefficients in `factorConfig.ts`. For each constituency, compute: `base_error = constituency_variance_from_phase1`. Apply slider divergence penalty: `adjusted_error = base_error * (1 + 0.5 * (slider_distance / max_distance))` where `slider_distance` is the Euclidean distance of all slider values from their defaults, normalized by the maximum possible distance.

What to watch out for: Error margins should be displayed as ranges (e.g., "42-48% vote share"), not as single values. The aggregate seat-count error margins require summing constituency-level uncertainties with the correlation structure — this is more complex and can be simplified for the formula layer by using a rough approximation (e.g., seat range = expected seats ± sqrt(N) where N is the number of competitive constituencies).

Verification: Error margins are non-negative. Error margins widen when sliders deviate from defaults. Error margins are tighter for constituencies with larger historical data.

**Step 3.7: Frontend Tests**

What to do: Extend the existing test file at `frontend/src/engine/__tests__/predictionEngine.test.ts` with new tests for the multi-factor formulas. Add test cases verifying: each factor formula produces expected adjustments for known inputs; default slider values reproduce historical baseline predictions; vote conservation holds across randomized slider inputs (property-based testing); alliance logic increases lead party share; error margins widen with slider deviation. Follow the existing test patterns: `describe`/`it` blocks, `makeConstituency()` fixture factory, `expect(...).toBeCloseTo()` for floating-point comparisons.

Where to do it: `frontend/src/engine/__tests__/predictionEngine.test.ts` (extend existing file) and optionally `frontend/src/engine/__tests__/factorConfig.test.ts` for configuration validation tests.

How it connects: Tests run via `npm test` (Vitest). The existing test infrastructure (Vitest with jsdom, globals enabled) is already configured in `vite.config.js`.

Technology-specific guidance: Follow the existing test patterns exactly. The `makeConstituency()` helper creates test fixtures with configurable overrides. Extend it to include the additional fields that the multi-factor engine needs (e.g., set `turncoat`, `incumbent`, `recontest` values on the fixture). For property-based testing of vote conservation, consider adding `fast-check` to devDependencies and using `fc.assert(fc.property(...))` to verify conservation across random slider configurations.

What to watch out for: The existing tests for `generateBaseline` verify specific numeric outcomes (e.g., "incumbent loses 22.5% absolute with 50% anti-incumbency"). After refactoring, these tests may need updating if the anti-incumbency logic changes — ensure the existing tests either still pass or are updated with documented rationale.

Verification: All existing tests continue to pass (or are updated with justification). New tests cover each factor formula. Vote conservation property test passes across one thousand random configurations.

#### Phase Deliverables

Extended `AppPredictionParams` type with twelve to fifteen factor fields. Factor configuration module with coefficients and catalog. Refactored `generateBaseline()` with multiplicative multi-factor swing. Alliance vote transfer logic. Formula-based error margins. Comprehensive test suite.

#### Phase Risks and Mitigations

Breaking existing predictions: mitigated by ensuring default slider values produce identical results to the current baseline. Performance degradation with twelve-plus factor computations: mitigated by the fact that the computation is simple arithmetic per constituency, well within the 100ms target for even 400 constituencies. Type compatibility issues: mitigated by extending existing types rather than replacing them.

---

### Phase 4: Frontend UI — Slider Panel and Alliance Configuration

#### Phase Header

This phase builds the interactive slider interface, alliance configuration UI, survey data import mechanism, and prediction mode toggle. It depends on Phase 3 (engine) for the factor-aware prediction pipeline and partially on Phase 2 (API) for ML mode integration.

#### Prerequisites

Phase 3 must be complete: the extended `AppPredictionParams` type, factor configuration module, and refactored prediction engine must be functional. The factor catalog must be available as a TypeScript constant for rendering slider labels and ranges. For ML mode integration, Phase 2 must be complete; however, the formula-only UI can be built without Phase 2.

#### Step-by-Step Breakdown

**Step 4.1: Extended PredictionPanel Sections**

What to do: Extend `PredictionPanel.tsx` with new `Collapsible.Root` sections for each factor category. The existing "Global Parameters" section stays at the top. Below it, add five new collapsible sections: "Turnout & Mobilization" (turnout percentage, turnout change), "Incumbency Dynamics" (incumbency fatigue, turncoat penalty, recontest bonus, same constituency bonus), "Electoral Competition" (previous margin factor, ENOP factor, candidate count factor), "Geographic & Structural" (constituency type factor), "Party Strength" (party seats factor, party vote share factor). Each section uses the same Radix `Collapsible.Root` / `Collapsible.Trigger` / `Collapsible.Content` pattern already used by the "New Party / Third Front" section. New sections default to collapsed.

Where to do it: `frontend/src/components/PredictionPanel.tsx`, adding new JSX blocks after the existing "Global Parameters" section and before the "New Party / Third Front" section.

How it connects: Each slider calls `update(key, value)` using the existing `update` callback pattern, which propagates changes through `onChange` to `App.tsx`'s `setPredParams`. The 200ms debounce in `App.tsx` prevents excessive recalculation.

Technology-specific guidance: Follow the exact pattern of the existing collapsible sections. Each section has: a `Collapsible.Root` with optional `defaultOpen`, a `Collapsible.Trigger` with a `h2` heading in `text-primary-300` and a `▾` indicator, and `Collapsible.Content` containing sliders. Use the existing `Slider` component from `./ui/slider` for each factor. State-level impact sliders should be labeled with "Effect of" prefix (e.g., "Effect of Turncoat Penalty") to distinguish them from value sliders (e.g., "Expected Turnout").

What to watch out for: The PredictionPanel is already quite long with four sections. Adding five more sections requires ensuring the scrollable container (`lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto`) works correctly on all viewport sizes. Each section should be collapsed by default to prevent overwhelming the user.

Verification: All new sections render correctly. Collapsing and expanding works. Slider adjustments trigger prediction updates via the existing debounce mechanism.

**Step 4.2: FactorSlider Component**

What to do: Create a reusable `FactorSlider` component that renders a labeled slider with: current value display, a visual marker for the default value on the track, a tooltip with the factor description (using `@radix-ui/react-tooltip` which is already a dependency), and a reset-to-default button. This component wraps the existing `Slider` component and adds the factor-specific metadata from the factor catalog.

Where to do it: Create `frontend/src/components/ui/FactorSlider.tsx`.

How it connects: Used by PredictionPanel.tsx instead of bare `Slider` components for factor sliders. Consumes factor metadata from `FACTOR_CATALOG`. The tooltip component uses `@radix-ui/react-tooltip` which is already installed (version 1.2.7).

Technology-specific guidance: Props interface: `{ factorName: string; value: number; defaultValue: number; min: number; max: number; step: number; label: string; tooltip: string; labelPrefix?: string; onValueChange: (v: number) => void; onReset: () => void }`. The default value marker can be a small dot or line on the slider track, positioned at `((defaultValue - min) / (max - min)) * 100` percent. The reset button should be a small icon button that sets the value back to `defaultValue`. The tooltip should use the Radix Tooltip pattern: `Tooltip.Provider > Tooltip.Root > Tooltip.Trigger > Tooltip.Portal > Tooltip.Content`.

What to watch out for: The existing `Slider` component in `ui/slider.tsx` uses `React.forwardRef` and wraps `@radix-ui/react-slider`. The `FactorSlider` component should compose with it, not replace it. Ensure the default value marker does not interfere with the slider thumb's drag behavior.

Verification: The component renders with the correct label, current value, default marker, tooltip, and reset button. The tooltip displays on hover/focus. The reset button restores the default value.

**Step 4.3: Error Margin Display**

What to do: Implement error margin visualization in the prediction results. Show seat count ranges (e.g., "Party A: 48-55 seats") in the aggregate results view (`PredictionResults.jsx`). Show per-constituency margin of error indicators in the constituency results table (`PredictionConstituencyTable.jsx`). Display a visual warning when multiple sliders are far from their defaults, indicating extrapolation beyond historical precedent.

Where to do it: `frontend/src/components/PredictionResults.jsx` for aggregate error ranges. `frontend/src/components/PredictionConstituencyTable.jsx` for per-constituency indicators.

How it connects: The error margin data comes from the `PredictionResult` objects returned by the refactored `generateBaseline()` (Phase 3, Step 3.6). The aggregate error margins are computed by the `aggregateResults()` function or a new companion function.

Technology-specific guidance: For the aggregate seat ranges, display them as a range after the seat count: "DMK: 120 (115-125)". For per-constituency margins, add a small ± indicator in the margin column. For the extrapolation warning, compute the total slider deviation from defaults and show a yellow warning banner when it exceeds a threshold. Use existing Tailwind utility classes for styling: `text-yellow-400` for warnings, `text-neutral-500` for secondary text.

What to watch out for: The existing `PredictionResults.jsx` and `PredictionConstituencyTable.jsx` are JavaScript files (.jsx), not TypeScript. Any type annotations or imports from TypeScript modules will need to work with the JSX/TSX boundary (Vite handles this fine, but be aware of the mix). Error margins should not dominate the UI — they are secondary information.

Verification: Seat ranges are displayed alongside seat counts. Per-constituency error indicators appear. The extrapolation warning shows when sliders are at extreme values.

**Step 4.4: Alliance Configuration UI**

What to do: Build an "Alliance Configuration" collapsible section as a separate section below the existing "New Party / Third Front" section. Users group existing parties into alliance blocs using a checkbox-based interface: display a list of parties (from the top parties in the current state) with checkboxes, where checking multiple parties and assigning them to a named alliance bloc groups them. For each alliance bloc, display the estimated combined vote share and an adjustable vote transfer efficiency slider (default 85%). Pre-populate alliance configurations for recent elections using the Phase 1 alliance data. All interactive elements must include appropriate ARIA attributes: `role="group"` for alliance blocs, `aria-label` for each checkbox, and `aria-live="polite"` for dynamic vote share displays.

Where to do it: Add a new section in `frontend/src/components/PredictionPanel.tsx` after the "New Party / Third Front" section.

How it connects: The alliance configuration is stored in `AppPredictionParams.allianceConfig` and consumed by the alliance logic in `predictionEngine.ts` (Phase 3, Step 3.5). The top parties list comes from the `topParties` prop already passed to `PredictionPanel`.

Technology-specific guidance: Use HTML checkboxes styled with Tailwind (the codebase does not use Radix Checkbox). For the alliance bloc container, use a `<fieldset>` with `role="group"` and a `<legend>` for the bloc name. The transfer efficiency slider uses the existing `Slider` component. Pre-populated alliance data is loaded from the Phase 1 export via `factorConfig.ts` and displayed as preset options using a select dropdown similar to the existing "Alliance Proximity" preset selector.

What to watch out for: The checkbox interaction must be mobile-friendly and touch-accessible. Each checkbox must be at least 44x44 pixels (the codebase already follows this minimum for interactive elements, as seen in the `min-h-[44px]` and `min-w-[44px]` classes used elsewhere). Do not use drag-and-drop as it is not accessible on mobile.

Verification: Users can create alliance blocs by checking parties. Combined vote share updates dynamically. Transfer efficiency slider works. Pre-populated alliances load for supported states. Keyboard navigation works for all interactive elements.

**Step 4.5: Survey Data Import**

What to do: Add a "Load Survey Data" button within the slider panel that opens a dialog (using `@radix-ui/react-dialog`, already a dependency) for importing CSV or JSON files. The import mechanism reads the file, validates column/key names against the factor catalog, validates values against factor ranges, and populates constituency-specific slider overrides in `AppPredictionParams.constituencyOverrides` and factor values.

Where to do it: Add a button in `PredictionPanel.tsx` and create a new `SurveyImportModal.tsx` component in `frontend/src/components/`.

How it connects: The import modal uses `@radix-ui/react-dialog` (version 1.1.14, already installed) following the same pattern as `SaveBookmarkModal.tsx` and `LoginModal.tsx`. The parsed data populates the existing `constituencyOverrides` field and the new factor fields in `AppPredictionParams`.

Technology-specific guidance: Use the browser's `FileReader` API for reading the uploaded file. For CSV parsing, use a simple split-based parser (the codebase does not include a CSV parsing library and this is for small files). For JSON, use `JSON.parse()`. Validate each row/entry: constituency name must match a known constituency, factor values must be within the factor catalog's stated ranges. Show validation errors in the modal before applying.

What to watch out for: Do not execute or eval any content from uploaded files — parse strictly as text data. Validate all imported values against the factor catalog ranges before applying them. Large files could cause performance issues — limit import to a reasonable size (e.g., 1MB).

Verification: Importing a valid CSV/JSON populates slider overrides. Invalid values are rejected with informative errors. The dialog opens and closes correctly.

**Step 4.6: Prediction Mode Toggle**

What to do: Add a prediction mode toggle control at the top of the PredictionPanel that allows switching between "Formula" and "ML" modes. When Formula mode is active (default), predictions are computed client-side using the refactored engine. When ML mode is selected, fire an API call to `POST /v1/predict/ml` (via `api.ts`) and display results alongside formula results. Show formula results immediately while ML results load asynchronously. When the two modes diverge by more than five seats, display a divergence indicator.

Where to do it: `frontend/src/components/PredictionPanel.tsx` for the toggle control. `frontend/src/api.ts` for the API call. `frontend/src/App.tsx` for managing the ML prediction state.

How it connects: The toggle sets `predictionMode` in `AppPredictionParams`. When ML mode is active, `App.tsx` fires an API call via `api.ts` when debounced params change, stores the ML results in separate state, and passes both formula and ML results to the results components. Add a new API method in `api.ts`: `mlPredict(state: string, params: MLPredictionRequest): Promise<MLPredictionResponse>` using the `post()` helper.

Technology-specific guidance: The toggle can use `@radix-ui/react-toggle-group` (already a dependency, version 1.1.7) for a segmented control with "Formula" and "ML" options. Style it to match the existing dark theme. For the ML API call, add a method to the `api` object in `api.ts` following the existing pattern (e.g., `bookmarkCreate` uses `post()`). Handle loading state by showing a spinner or skeleton alongside the formula results.

What to watch out for: ML mode requires Phase 2 to be complete. If Phase 2 is not yet deployed, the ML toggle should be hidden or disabled (check via the model health endpoint). The divergence indicator should explain in plain language that the two modes differ, not just show a warning icon.

Verification: The toggle renders and switches between modes. Formula mode works without any API calls. ML mode fires an API call and displays results when Phase 2 is available. Divergence indicator appears when results differ by more than five seats.

**Step 4.7: Prediction Disclaimer**

What to do: Add a persistent disclaimer note below the prediction results: "These predictions are exploratory what-if scenarios, not forecasts. They reflect the mathematical implications of your slider settings combined with historical patterns. Actual election outcomes depend on factors not captured by this model." This should be visible at all times when prediction results are displayed.

Where to do it: `frontend/src/components/PredictionResults.jsx`, as a section at the bottom of the results view.

How it connects: This is a static UI element. No data dependencies.

Technology-specific guidance: Use a `<p>` element styled with `text-xs text-neutral-500` to match the existing secondary text styling. Consider adding an info icon from the Radix icons or a simple "ℹ️" character.

What to watch out for: The disclaimer should be visible but not dominant. It should not be inside a collapsible section (users should always see it).

Verification: The disclaimer is visible below prediction results on all viewport sizes.

**Step 4.8: Mobile Performance Optimization**

What to do: Apply `React.memo` to the `FactorSlider` component to prevent unnecessary re-renders when sibling sliders change. Consider using `useTransition` for non-urgent slider updates that trigger expensive prediction recomputation. Test on mobile viewports to ensure sliders are touch-friendly and the expanded panel does not cause jank.

Where to do it: `frontend/src/components/ui/FactorSlider.tsx` for `React.memo`. `frontend/src/App.tsx` for `useTransition` if needed.

How it connects: The existing 200ms debounce on prediction params (via `useDebounce` in `App.tsx`) already mitigates rapid re-computation. `React.memo` on FactorSlider prevents each slider from re-rendering when any other slider changes (since each slider only depends on its own value).

Technology-specific guidance: Wrap the FactorSlider component with `React.memo`: `export const FactorSlider = React.memo(function FactorSlider(...) { ... })`. For `useTransition`, wrap the prediction computation in `startTransition(() => { /* compute predictions */ })` so that slider interactions remain responsive even during heavy computation.

What to watch out for: `React.memo` requires stable callback references — ensure `onValueChange` and `onReset` are wrapped in `useCallback` at the parent level (PredictionPanel already uses `useCallback` for its `update` function). Test on actual mobile devices, not just responsive mode in desktop browsers.

Verification: Slider interactions feel smooth on mobile viewports. React DevTools Profiler shows minimal unnecessary re-renders for unchanged sliders.

#### Phase Deliverables

Extended PredictionPanel with five new collapsible factor sections. FactorSlider component with default marker, tooltip, and reset. Error margin display in results. Alliance configuration UI with checkbox-based party grouping. Survey data import modal. Prediction mode toggle. Disclaimer. Mobile performance optimization.

#### Phase Risks and Mitigations

UI complexity overwhelming users: mitigated by collapsing all new sections by default and using clear section labels. Mobile performance issues: mitigated by `React.memo`, `useTransition`, and the existing 200ms debounce. Accessibility regressions: mitigated by following Radix UI's built-in accessibility and adding ARIA attributes to custom elements.

---

### Phase 5: Integration, Testing, and Validation

#### Phase Header

This phase validates the full system end-to-end, verifies accuracy targets, and confirms backward compatibility. It depends on all prior phases.

#### Prerequisites

Phases 1-4 must be complete. The formula-based prediction system must be functional. If ML mode is included, the ML endpoint must be deployed and serving predictions.

#### Step-by-Step Breakdown

**Step 5.1: Full Pipeline Integration Test**

What to do: Test the complete pipeline: slider adjustment in the frontend triggers formula prediction update and (when ML mode is active) an ML API call, both returning predictions with error margins. Verify that alliance configuration adjustments propagate correctly through both paths.

Where to do it: Integration tests in `frontend/src/__tests__/` (following the existing `api.test.ts` pattern) and in `api/tests/` for backend integration. Playwright E2E tests following the existing `playwright.config.ts`.

How it connects: Frontend tests use Vitest with the testing-library. Backend tests use pytest with httpx AsyncClient. Playwright tests drive the full application.

Verification: Slider changes produce updated predictions. Alliance configuration changes produce different predictions. ML mode returns results from the API.

**Step 5.2: Holdout Validation**

What to do: Validate predictions against held-out election data using both 2016 and 2021 as holdout years. For each state, verify: ML winner prediction accuracy meets 75% (or 65% minimum, or ML is disabled), formula predictions at defaults reproduce historical baseline, RMSE for ML vote share is under 6 percentage points.

Where to do it: `datascience/notebooks/08_factor_discovery.ipynb` (validation section) or a new notebook `09_validation.ipynb`.

Verification: Per-state accuracy metrics are documented and meet thresholds.

**Step 5.3: Baseline Alignment Validation**

What to do: Verify that formula and ML predictions agree within five seats for every state when all sliders are at default values. If they disagree, debug the coefficient calibration or model training.

Where to do it: Automated test in `api/tests/` or `datascience/notebooks/`.

Verification: For every state with ML support, default-slider formula and ML predictions agree within five seats.

**Step 5.4: Performance Testing**

What to do: Test the ML endpoint for sub-three-second response time at p95 latency under ten concurrent users for the largest states.

Where to do it: Use a load testing tool (k6 or locust) targeting the deployed API.

Verification: p95 latency is under three seconds for UP (403 constituencies).

**Step 5.5: Backward Compatibility Testing**

What to do: Verify that existing bookmarks with three-parameter configurations load and produce predictions using default values for new sliders. Old bookmark predictions must match previous behavior within one seat tolerance.

Where to do it: Frontend test in `frontend/src/engine/__tests__/predictionEngine.test.ts` and Playwright E2E test.

Verification: Old bookmarks load without errors. Predictions match previous behavior within tolerance.

**Step 5.6: Blended Mode Evaluation**

What to do: Evaluate whether a weighted average of formula and ML predictions outperforms both individual modes on the validation set. If it does, add blending as a third option. If not, document findings and keep only formula and ML.

Where to do it: `datascience/notebooks/` validation.

Verification: Evaluation is documented with metrics showing whether blending improves accuracy.

**Step 5.7: Documentation**

What to do: Write user-facing documentation for the factor catalog — what each slider measures and how to set values based on survey data. Write a model card for the ML model with training data scope, feature list, accuracy, and fairness assessment.

Where to do it: Update `frontend/README.md` or create a user guide. Add model card as `datascience/output/MODEL_CARD.md`.

Verification: Documentation exists and accurately describes the system.

**Step 5.8: Model Retraining Schedule**

What to do: Define and document the retraining protocol: retrain within thirty days of each new major election, validate via circuit-breaker before activation, follow temporal cross-validation protocol from Phase 1.

Where to do it: Document in `datascience/README.md` or the model card.

Verification: Retraining schedule is documented with clear steps.

#### Phase Deliverables

Integration test suite. Holdout validation results. Performance benchmarks. Backward compatibility confirmation. Blended mode evaluation. Documentation and model card.

#### Phase Risks and Mitigations

Accuracy targets not met: mitigated by the 65% fallback threshold and per-state ML disabling. Performance targets not met: mitigated by model simplification, bucketed caching, and lazy loading.

---

## 4. Cross-Cutting Concerns

**Error handling patterns:** The API follows FastAPI's `HTTPException` pattern with appropriate status codes (422 for validation errors, 501 for unsupported features, 503 for model loading). The frontend catches API errors in `fetch` wrappers in `api.ts` and throws `Error` objects. New endpoints should follow these patterns. The ML endpoint should return 503 with `Retry-After` if the model is still loading, 422 for invalid slider values, and 200 with a `degraded: true` field if the circuit-breaker has tripped.

**Logging and monitoring:** The API uses Python's `logging` module with named loggers (`security`, `cache`, `usage`). ML prediction requests should be logged at INFO level with the state name and latency. Circuit-breaker trips should be logged at WARNING level. Sentry integration (already configured in `main.py`) will capture any unhandled exceptions in the new endpoints.

**Security considerations:** All slider input values must be validated by Pydantic Field constraints before reaching any computation. ONNX format is mandatory for model serialization — pickle is forbidden. The existing CSRF middleware, rate limiting, and security headers middleware in `main.py` protect the new endpoints automatically. The ML prediction endpoint gets a stricter rate limit (twenty per sixty seconds) to prevent abuse. Survey data import uses `FileReader` in the browser (no file is uploaded to the server), eliminating server-side file processing risks.

**Performance considerations:** The formula engine computation is O(constituencies × factors) per prediction — with 400 constituencies and 15 factors, this is approximately 6,000 multiplications, completing well under 100ms. ML inference via ONNX runtime is batch-optimized. Bucketed caching prevents redundant inference. The 200ms debounce on slider changes prevents excessive recalculation. `React.memo` and `useTransition` prevent unnecessary re-renders.

**Accessibility:** All new sliders inherit accessibility from the Radix Slider primitive (`aria-valuemin`, `aria-valuemax`, `aria-valuenow`). The `FactorSlider` component adds `aria-label` with the factor description. Alliance checkboxes use standard HTML checkboxes (natively accessible). Dynamic content updates (seat counts, error margins) use `aria-live="polite"` regions. The existing `@axe-core/playwright` dependency enables automated accessibility testing in Playwright E2E tests.

---

## 5. Migration and Data Considerations

One database migration is required: the `model_metadata` table for ML model versioning (Phase 2, Step 2.8). This is an additive migration (new table, no changes to existing tables) and does not affect existing data. The `tcpd_ae` table is read-only for this feature — no schema changes are needed since all required columns already exist.

If factor coefficients or alliance data are stored in the database (rather than static JSON files), additional migrations will be needed. However, the recommended approach is to use static JSON files loaded at startup, avoiding the need for extra migrations.

Rollback for the migration: drop the `model_metadata` table. No data backfill or transformation is required.

---

## 6. Integration Points

**Frontend → API (existing):** `GET /v1/predict/data?state={state}&election_type=AE` — returns `PredictionDataResponse` with constituency-level data. This endpoint is unchanged. The frontend continues to call it for prediction data.

**Frontend → API (new):** `GET /v1/factors` — returns the full factor catalog. `GET /v1/factors/{state}` — returns state-specific factor defaults. `POST /v1/predict/ml` — accepts `MLPredictionRequest` (state, slider values, optional alliance config), returns `MLPredictionResponse` (per-constituency predictions with confidence intervals and SHAP attributions). `GET /v1/predict/model-health` — returns model loaded status and active version.

**Data science → Frontend:** Phase 1 exports (`coefficients.json`, `factor_catalog.json`, `alliance_data.json`, `error_margins.json`) are copied to `frontend/src/engine/data/` and imported as static JSON. These files are updated by re-running the Phase 1 notebook and re-copying.

**Data science → API:** Phase 1 exports (`prediction_model.onnx`, quantile model files, `shap_importances.json`, `error_margins.json`) are deployed with the API container or loaded from a configured path. The model path is configurable via environment variable.

---

## 7. Configuration and Environment

**New environment variables for the API:**
- `PREDICTION_MODEL_PATH` — path to the ONNX model file (default: `./models/prediction_model.onnx`)
- `ML_PREDICT_RATE_LIMIT` — rate limit for the ML prediction endpoint (default: `20`)
- `ML_PREDICT_CACHE_TTL` — TTL for bucketed ML prediction cache in seconds (default: `3600`)

**New dependencies:**
- `api/requirements.txt`: add `onnxruntime>=1.17.0`
- `datascience/requirements.txt`: add `skl2onnx>=1.16.0`, `onnxmltools>=1.12.0`, `onnxruntime>=1.17.0`

**Docker configuration:** The API Dockerfile in `api/Dockerfile` may need to be updated to copy ONNX model files into the container. Alternatively, model files can be stored in a volume or downloaded at startup from a configured URL.

**No changes required:** No changes to nginx configuration, Vite proxy configuration, Terraform, or CI/CD pipelines (beyond adding the new test commands).

---

## 8. Implementation Order and Dependencies

**Hard dependencies (must be sequential):**
- Phase 1 must complete before Phase 2 (ML model artifacts) and Phase 3 (coefficients)
- Phase 3 must complete before Phase 4 (UI depends on engine types and functions)
- Phase 4 ML integration steps (4.6) depend on Phase 2
- Phase 5 depends on all prior phases

**Can be done in parallel:**
- Within Phase 1, Steps 1.1-1.3 (data profiling, feature engineering, catalog) can proceed sequentially, then Steps 1.4-1.6 (alliance data, coefficients, ML training) can proceed somewhat in parallel since they are independent analyses
- Phase 2 and Phase 3 can proceed in parallel after Phase 1, but since this is a single developer, they must be serialized
- Within Phase 4, Steps 4.1-4.3 (UI sections, slider component, error display) can proceed independently of Steps 4.4-4.5 (alliance UI, survey import)

**Recommended order for a single developer:**
1. Phase 1, Steps 1.1-1.9 (data science research — all steps sequentially)
2. Phase 3, Steps 3.1-3.7 (frontend formula engine — depends on Phase 1 exports)
3. Phase 4, Steps 4.1-4.5, 4.7-4.8 (formula-only UI)
4. **Ship formula-only release** — this is a complete, valuable product milestone
5. Phase 2, Steps 2.1-2.9 (backend API for ML)
6. Phase 4, Step 4.6 (ML mode toggle in UI)
7. Phase 5, Steps 5.1-5.8 (integration, validation, documentation)

**How to split across multiple developers:**
- Developer A: Phase 1 (data science) → Phase 2 (backend API)
- Developer B: Phase 3 (frontend engine, using mock coefficients) → Phase 4 (UI)
- Join for Phase 5 (integration testing)

---

## 9. Completion Criteria

**Phase 1 complete when:** All eight artifact files exist in `datascience/output/`, the notebook runs end-to-end with documented analysis, at least ten states have state-specific coefficients, at least ten states have alliance data, and the ONNX model loads and produces valid predictions.

**Phase 2 complete when:** `GET /v1/factors`, `POST /v1/predict/ml`, and `GET /v1/predict/model-health` endpoints respond correctly. Pydantic validation rejects out-of-range values. Circuit-breaker validation passes. API tests in `api/tests/` pass. Rate limiting is configured.

**Phase 3 complete when:** The refactored `generateBaseline()` produces predictions for all factor combinations. Default slider values produce predictions identical to the previous baseline (within one-seat tolerance). Vote conservation holds across one thousand random slider configurations. All existing predictionEngine tests pass. New factor formula tests pass.

**Phase 4 complete when:** The PredictionPanel renders all factor sections with working sliders. Alliance configuration UI is functional. Survey data import works for CSV and JSON. Error margins display in results. The prediction disclaimer is visible. Mobile performance is acceptable (no visible jank on slider interaction).

**Phase 5 complete when:** Integration tests pass end-to-end. Holdout validation metrics are documented. Performance benchmarks meet targets. Backward compatibility is confirmed. Documentation is complete.

**Overall implementation complete when:** All five phases are complete, formula predictions work for all Indian states, ML predictions work for states above the accuracy threshold, error margins are displayed, alliance configuration is functional, and backward compatibility with existing bookmarks is confirmed.

---

## 10. Implementation Report Summary

This report decomposes the multi-factor prediction slider system into five phases containing approximately forty discrete implementation steps. Phase 1 (data science research, nine steps) produces the empirical foundation: a twelve-to-fifteen factor catalog, per-state regression coefficients, trained ONNX models, alliance data, and error margin parameters — this is the highest-effort phase at six to ten weeks. Phase 2 (backend API, nine steps) adds factor metadata endpoints, an ML prediction endpoint with ONNX runtime, model versioning, circuit-breaker validation, and bucketed caching. Phase 3 (frontend formula engine, seven steps) refactors the client-side prediction engine with multiplicative multi-factor swing, alliance vote transfer, and formula-based error margins. Phase 4 (frontend UI, eight steps) builds the slider panel with five new collapsible factor sections, a FactorSlider component, alliance configuration UI, survey data import, prediction mode toggle, and mobile optimization. Phase 5 (integration and validation, eight steps) validates accuracy, performance, and backward compatibility.

The critical decision point is after Phases 1 and 3: the formula-only system is a complete, shippable product. The ML layer (Phases 2, 4.6, and 5) can be deferred to a separate initiative. Key dependencies flow linearly: Phase 1 → Phase 3 → Phase 4 → ship formula-only → Phase 2 → Phase 4 ML → Phase 5.

Critical files affected: `frontend/src/engine/predictionEngine.ts` (core refactoring), `frontend/src/types.ts` (type extensions), `frontend/src/constants.ts` (default params), `frontend/src/components/PredictionPanel.tsx` (UI extension), `api/main.py` (route registration), plus new files `api/factor_routes.py`, `api/prediction_routes.py`, `frontend/src/engine/factorConfig.ts`, `frontend/src/components/ui/FactorSlider.tsx`. Data science work centers on `datascience/notebooks/08_factor_discovery.ipynb` with exports to `datascience/output/`.
