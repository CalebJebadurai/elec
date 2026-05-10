# Multi-Factor Election Prediction Slider System

**Date:** 2026-04-30

**Pipeline Tier:** Extended
**Routing Rationale:** Cross-cutting architectural change affecting datascience, API, frontend prediction engine, and database — involves ML model training and data science research across all Indian states with high technical risk.
**Status:** Final
**Iterations:** 3
**Final Dimension Scores:** Security 4, Performance 4, Approach Validity 4, Pros/Cons 5, Industry Standards 4, Completeness 5, Feasibility 4, Risk Assessment 4, Codebase Alignment 5, Test Coverage 4, Logical Soundness 4
**Total Score:** 47/55
**Verifier Result:** PASS

---

## 1. Introduction

The election analysis platform currently provides a constituency-level prediction engine that allows users to model electoral outcomes by adjusting three parameters: anti-incumbency percentage, expected voter turnout, and total electorate size. While this engine produces directionally useful results for simple what-if scenarios, it represents a dramatically simplified view of the factors that drive election outcomes. Indian elections are shaped by an intricate web of demographic shifts, candidate characteristics, historical voting patterns, geographic dynamics, party system fragmentation, and incumbency effects — none of which the current system captures with any granularity.

This document presents a strategic plan for transforming the prediction engine into a robust, multi-factor system with twenty or more adjustable sliders, each grounded in data science research conducted on the Trivedi Centre for Political Data datasets covering all Indian state assembly and general elections. The system will provide constituency-specific predictions with automatically calculated error margins, support both formula-based and machine-learning-based prediction modes, and allow users to override default values with their own survey data or ground intelligence. The goal is not a black-box predictor but a transparent, tunable instrument that makes the mathematics of election prediction legible and interactive.

## 2. Motivation

Three concrete pain points motivate this work. First, the existing three-parameter model applies a uniform anti-incumbency swing across all constituencies in a state, ignoring the well-documented reality that anti-incumbency effects vary dramatically by constituency type, candidate profile, and local conditions. A rural constituency with a three-term incumbent behaves very differently from an urban constituency with a first-time challenger, yet the current engine treats them identically.

Second, the platform already contains rich candidate-level and constituency-level data in its database — fields like age, sex, incumbent status, turncoat status, recontest status, number of prior terms, constituency type (urban/rural), effective number of parties, number of candidates, and historical margins — but none of these fields influence predictions. The prediction engine operates on a tiny fraction of the data the platform has already ingested. The gap between available data and utilized data is the core technical debt.

Third, the user's own analytical work (documented in a Gemini conversation analyzing the 2026 Tamil Nadu Assembly Election) demonstrates the kind of multi-factor reasoning that sophisticated users want to perform: normalizing turnout for voter roll cleanup, computing per-constituency vote weights, modeling anti-incumbency probability as a function of turnout delta, accounting for gender voting patterns, and evaluating alliance arithmetic effects. These are exactly the kinds of factors the prediction system should expose as adjustable sliders with data-driven defaults.

Additionally, the existing data science notebook (datascience/notebooks/06_predictive_model.ipynb) has already engineered nineteen features and sketched out Random Forest and XGBoost classifiers, demonstrating that the research groundwork exists but remains disconnected from the application. Integrating this work and expanding it to cover all Indian states would unlock significant predictive power.

## 3. Purpose

The primary objective is to build a multi-factor prediction system that meets the following measurable success criteria.

First, the initial release will expose twelve to fifteen adjustable prediction factors as interactive sliders in the frontend, organized into logical categories (turnout and mobilization, incumbency and re-contest dynamics, electoral dynamics, geographic and structural, party-level). These twelve to fifteen factors are those with near-universal data availability (ninety percent or higher population rate for post-2000 elections): turnout percentage, turnout change, previous margin, ENOP, number of candidates, constituency type, candidate gender, incumbent status, turncoat status, recontest status, same constituency, party classification, previous party seats, and previous party average vote share. Sparse-data factors (education, profession, sub-region, candidate age for GE) are deferred to a later iteration once the core system is validated. Each slider will have a default value derived from historical data analysis. For constituency-level factors (e.g., previous margin, ENOP), the default is the actual value observed for that constituency in the most recent election. For candidate-level factors applied as state-wide sliders (e.g., "turncoat impact severity"), the default is calibrated so that the slider at its default position reproduces the historically observed average effect of that factor across the state. For state-level factors (e.g., turnout change), the default is the state historical average. Users can override any value based on their own survey data or ground intelligence.

Second, each factor will have a documented mathematical formula or model coefficient that quantifies its impact on constituency-level vote share predictions. These formulas will be validated on held-out election data using temporal cross-validation across multiple cycles (e.g., train on pre-2016 to predict 2016, train on pre-2021 to predict 2021) to avoid reliance on a single holdout year. The ML layer targets at least seventy-five percent winner prediction accuracy and RMSE under six percentage points for vote share across major states (defined as states with two hundred or more constituencies and three or more post-delimitation cycles: Tamil Nadu, Maharashtra, Uttar Pradesh, West Bengal, Karnataka, Madhya Pradesh, Rajasthan, Bihar, Andhra Pradesh, Gujarat). The formula layer targets reproducing historical baselines at default slider settings — its accuracy at defaults is inherently the re-election rate (approximately fifty to sixty-five percent in India) and is not expected to match the ML target. When sliders are set to match known post-election ground truth for a held-out election year (e.g., setting the 2021 turnout, incumbency, and alliance sliders to their actual 2021 values to predict 2021 outcomes), the formula layer should achieve seventy percent or better winner accuracy — this provides a measurable backtesting target rather than relying on the qualitative notion of a "knowledgeable user." If the seventy-five percent ML accuracy target is not achievable for a given state, the minimum acceptable threshold is sixty-five percent — below which the ML predictions for that state are hidden and only formula predictions are shown, with a warning that the state has insufficient data for reliable ML prediction.

Third, the system will automatically compute and display confidence intervals using analytic standard error estimates from the ensemble model's quantile predictions (not bootstrap resampling, which exceeds the three-second latency budget). Aggregate seat-count uncertainty will be computed using analytic variance propagation: for each party, the expected seat count is the sum of constituency-level win probabilities, and the variance is computed assuming a block-correlated model where constituencies within the same sub-region share a common statewide swing component. This produces seat ranges (e.g., "Party A: 48-55 seats, eighty percent confidence") that correctly account for correlated swings rather than naively summing independent constituency intervals. Error margins will be constituency-specific, reflecting the variance of historical outcomes under similar conditions, and will widen when slider values deviate from defaults (indicating extrapolation beyond historical precedent) or when data for the selected state is sparse.

Fourth, the initial release targets Assembly Elections (AE) for all Indian states present in the TCPD datasets, with constituency-specific calibration where three or more post-delimitation election cycles are available, and state-level fallback for sparse-data states. General Election (GE) support is deferred to a subsequent phase because the GE dataset lacks the age and district_name columns, the backend currently returns a 501 status for GE prediction requests, and GE constituencies have different dynamics (larger electorates, national mood effects) requiring separate model calibration. The GA dataset (TCPD_GA_All_States) will be investigated during Phase 1 to determine whether it provides supplementary data useful for predictions; if it does not, this will be documented and the dataset excluded from scope. The system must not be biased toward Tamil Nadu despite the development context.

Fifth, backward compatibility with existing bookmarks and saved predictions must be preserved by defaulting all new slider parameters to their calibrated default values — old bookmarks with the three-parameter schema will deserialize with new fields at defaults, producing predictions equivalent to the current formula within rounding tolerance.

Sixth, the system will include an alliance configuration mechanism that allows users to specify which parties are allied and model the resulting vote transfer effects. Alliance formation is the single most powerful predictor of Indian election outcomes, and omitting it would systematically degrade prediction quality below what a simpler alliance-aware model could achieve. The existing codebase already has hardcoded alliance definitions for Tamil Nadu in db.py; this pattern will be formalized and extended to a user-editable interface.

## 4. Analysis

Three distinct approaches to building this system were evaluated, each with fundamentally different architectures for how factor adjustments translate into predictions.

### Approach A: Extended Formula-Based Swing Model (Client-Side)

This approach extends the existing client-side prediction engine by adding factor-specific swing adjustment functions. Each slider maps to a mathematical formula that modifies the base vote share for each party in each constituency. The formulas are derived from regression analysis of historical data but are implemented as deterministic functions in TypeScript, running entirely in the browser.

The core mechanism works as follows. The current uniform swing (anti-incumbency transfers X% from incumbent to challenger) is replaced with a multi-factor adjusted swing where each factor contributes an additive or multiplicative modifier to the base vote share. For example, the turnout delta factor computes a swing probability using a generalized version of the user's P_AI = 50 + (ΔT × 5) formula, calibrated per state using historical regression coefficients. The incumbency fatigue factor increases the anti-incumbency modifier based on the number of consecutive terms the incumbent party has held the seat. The gender ratio factor adjusts predictions based on the proportion of female candidates relative to the state historical average.

Strengths of this approach include instant feedback (no network round-trips for prediction updates), full transparency (every formula is inspectable and deterministic), low infrastructure cost (no ML serving infrastructure needed), and compatibility with the existing architecture (extending predictionEngine.ts is a natural evolution). The approach also preserves the user's ability to understand exactly how each slider affects the prediction, which aligns with the goal of making prediction mathematics legible.

Weaknesses include the difficulty of capturing non-linear interactions between factors (e.g., the interaction between turnout surge and incumbency fatigue may not be additive), the risk of formula proliferation as factors are added, and the challenge of maintaining formula accuracy across diverse Indian states where political dynamics vary substantially. The formula coefficients must be pre-computed from data science analysis and hardcoded or loaded as static configuration, making updates cumbersome.

### Approach B: Server-Side ML Inference Model

This approach moves prediction computation entirely to the backend, where trained machine learning models (Random Forest, XGBoost, or Gradient Boosting ensembles) accept slider values as feature inputs and return constituency-level predictions with confidence intervals. The frontend becomes a thin client that sends slider configurations to the API and renders results.

The core mechanism works as follows. During a data science phase, models are trained on historical TCPD data with all identified factors as features. The trained models are serialized (pickle or ONNX format) and loaded by the FastAPI backend. A new prediction endpoint accepts a JSON payload containing the state, election type, and all slider values, runs inference across all constituencies in the state, and returns predictions with bootstrapped or quantile-regression-based confidence intervals.

Strengths include superior accuracy for capturing non-linear interactions and complex patterns, the ability to retrain models as new data becomes available without frontend changes, natural confidence interval computation via ensemble disagreement or quantile regression, and alignment with the existing notebook work which already demonstrates viable model architectures.

Weaknesses include latency (inference across two hundred or more constituencies must complete within three seconds, which may require pre-computation or model optimization), infrastructure complexity (model serving, versioning, and monitoring), opacity (users cannot easily understand why the model made a specific prediction without SHAP or similar explainability tools), and the risk of overfitting given data sparsity (only three to five post-delimitation election cycles for most states, with twenty-five or more features).

### Approach C: Hybrid Formula + ML Model (Recommended)

This approach combines the strengths of both previous approaches. The formula-based engine runs client-side for instant feedback and transparency, while an optional ML inference endpoint provides a second opinion with confidence intervals. The frontend displays both predictions and allows users to toggle between them or view a blended output.

The core mechanism works in two layers. The first layer (formula-based, client-side) extends the existing predictionEngine.ts with factor-specific adjustment functions, each parameterized by regression coefficients loaded from a static configuration file. This provides instant, transparent predictions as users adjust sliders. The second layer (ML-based, server-side) accepts the same slider values via a new API endpoint and returns model-based predictions with confidence intervals. The frontend can display formula predictions immediately while the ML prediction loads asynchronously, then show both side-by-side or blended.

The formula coefficients and ML model weights are both derived from the same data science research phase, ensuring they are grounded in the same evidence. Where the two predictions diverge significantly (defined as a difference of five or more seats in aggregate, or ten or more percentage points of vote share for any single constituency), the UI highlights the disagreement with a visual indicator and an explanation that non-linear interactions may be at play. When divergence is below this threshold, the UI displays both predictions without flagging. The "blended" prediction mode is explicitly deferred from the initial release — during Phase 5 validation, if a simple weighted average (weighted by each mode's held-out accuracy per state) outperforms both individual modes on validation data, it will be offered as a third option. If blending does not outperform both modes, it will be removed from scope rather than shipped as an inferior option.

The formula layer uses a multiplicative proportional swing model where each factor contributes a modifier to base vote shares. To prevent multiplicative explosion (where many individually moderate factors compound to extreme values — for example, $1.05^{15} = 2.08$), the formula applies a dampening function: the product of all factor modifiers is clamped to the range $[0.5, 2.0]$ before application, and after all factors are applied, vote shares are renormalized to sum to one. The factor application order is defined as: state-level factors first (turnout change, previous party seats, party average vote share), then constituency-level factors (previous margin, ENOP, candidate count, constituency type), then candidate-level factors (incumbency, turncoat, recontest, same constituency, gender). Within each level, factors are applied simultaneously (their modifiers are multiplied together within the level), not sequentially, which eliminates ordering sensitivity within a level. Cross-level ordering effects are minimized by the clamping and renormalization.

Strengths include instant feedback for interactive exploration (formula layer), superior accuracy for complex scenarios (ML layer), graceful degradation (if the ML endpoint is slow or down, formula predictions still work), natural error margin computation (ML confidence intervals plus formula-based variance estimates), and a clear upgrade path (the formula layer can be gradually replaced by client-side ML inference using ONNX.js or TensorFlow.js if desired). The architecture also supports a fully functional delivery with only the formula layer — Phases 1 and 3 produce a complete, shippable twelve-to-fifteen-slider system without requiring ML infrastructure, and the ML layer (Phases 2 and 4 ML integration) can be deferred entirely if the single developer needs to limit scope.

Weaknesses include higher implementation complexity (two prediction paths to build and maintain), potential user confusion about which prediction to trust when they diverge, the need to ensure formula and ML predictions are reasonably aligned for default configurations (a Phase 5 validation step requires agreement within five seats at default slider settings for every state), and the risk that with only twelve to fifteen factors and three election cycles for many states, even the ML layer may struggle to achieve the seventy-five percent accuracy target. This last risk is mitigated by fallback accuracy thresholds and the option to reduce to the top eight to ten features by SHAP importance if the full feature set shows signs of overfitting.

### Comparative Assessment

Approach A is the simplest to implement but sacrifices accuracy for complex multi-factor interactions. Approach B is the most accurate but sacrifices responsiveness and transparency. Approach C captures the best of both at the cost of higher implementation effort, but this cost is manageable because the formula layer is an extension of existing code and the ML layer reuses existing notebook work. The hybrid approach also naturally supports the user's stated desire for both survey-adjustable sliders (formula mode) and data-driven predictions (ML mode). Critically, the formula layer within Approach C constitutes a complete, independently shippable product — Phases 1 and 3 alone deliver a fully functional twelve-to-fifteen-slider prediction system with constituency-specific adjustments. This means Approach A is not a separate choice from Approach C but rather the first deliverable milestone within the Approach C plan. The ML layer (Phases 2, 4 ML integration, and 5) can be deferred to a separate initiative if timeline pressure or development capacity requires it.

## 5. Suggestions

All three approaches are viable. Approach A is recommended if speed of delivery is the overriding concern and accuracy requirements are modest. Approach B is recommended only if the team has ML ops expertise and can invest in model serving infrastructure. Approach C is the recommended approach for this project because it delivers immediate value through the formula layer while building toward higher accuracy through the ML layer, and the existing codebase already contains the foundations for both (predictionEngine.ts for formulas, 06_predictive_model.ipynb for ML).

Approach A and Approach C share a common Phase 1 (data science research and formula derivation), so beginning with the formula layer does not preclude adding the ML layer later. However, implementing them in parallel during the same initiative is more efficient because the data science research informs both.

## 6. Recommended Suggestion

The hybrid formula-plus-ML approach (Approach C) is recommended. The formula layer extends the existing client-side prediction engine with minimal architectural disruption, providing the twenty-plus sliders the user requested with instant feedback. The ML layer adds a server-side prediction endpoint that leverages the existing notebook infrastructure and provides confidence intervals that the formula layer alone cannot produce with the same rigor.

The strongest argument against this recommendation is implementation complexity — maintaining two prediction paths creates maintenance burden and a risk that the two modes routinely diverge, eroding user trust rather than enhancing it. However, this is mitigated by the fact that both paths are derived from the same data science research, a Phase 5 validation step enforces baseline alignment (within five seats at default settings), the formula path is a natural extension of existing code, and the ML path reuses existing notebook work. The formula path also serves as a sanity check on ML predictions during development. If, during validation, the two modes produce systematically different results for routine (non-extreme) slider configurations, this indicates either a formula calibration error or a model issue — both of which must be resolved before shipping the ML mode.

Importantly, this is a personal project with a single developer. The phased structure is designed so that Phases 1 and 3 together produce a complete, shippable formula-based prediction system with twelve to fifteen sliders. The ML layer (Phases 2, 4 ML integration, and 5) can be deferred to a subsequent initiative without loss of value from the formula layer. This framing makes the plan feasible within realistic time constraints while preserving the upgrade path to ML.

The alternative approaches fall short because Approach A cannot produce reliable confidence intervals without ML infrastructure, and Approach B sacrifices the instant-feedback interactivity that makes sliders useful for exploratory what-if analysis.

## 7. Full Implementation Plan

### Phase 1: Data Science Research and Factor Discovery (Foundation)

This phase conducts the empirical research that grounds all subsequent work. It produces the factor catalog, regression coefficients, and trained models that both the formula and ML layers depend on. This is the highest-risk and most time-intensive phase — realistic effort is six to ten weeks of focused data science work, not two weeks, because it involves exploratory analysis with uncertain outcomes across twenty-eight states with varying data quality. The scope is deliberately constrained to twelve to fifteen factors with high data availability to make this feasible.

Step 1.1: Load and profile all three TCPD datasets (AE, GE, GA). Compute completeness matrices by state and year for every column. Identify which states have sufficient data depth (three or more election cycles) for constituency-specific calibration versus those requiring state-level or regional fallback. Investigate the GA dataset (TCPD_GA_All_States) to determine its structure, coverage, and whether it contains supplementary data useful for predictions. Document findings; if the GA dataset is redundant with AE data or lacks prediction-relevant content, exclude it from scope with documented rationale.

Step 1.2: Engineer the twelve to fifteen candidate features targeting factors with ninety percent or higher data population rates for post-2000 elections. The initial factor set is: turnout_percentage, turnout_change (derived), previous_margin_percentage (derived), enop, n_cand, constituency_type, is_female, is_incumbent, is_turncoat, is_recontest, is_same_constituency, party_type_tcpd, previous_party_seats (derived), and previous_party_average_vote_share (derived). For each feature, compute: univariate correlation with outcome (win/loss), SHAP importance from a baseline Random Forest, and effect size (coefficient from logistic regression). Rank features by predictive power and data availability. If any of these features show negligible predictive power (SHAP importance below a threshold determined during analysis), remove them from the factor set rather than carrying noise into the model.

Step 1.3: For each factor, document: whether it is a candidate-level, constituency-level, or state-level variable; its valid range and distribution; its default value (defined as: for constituency-level factors, the actual value from the most recent election; for candidate-level factors used as state-wide impact sliders, the coefficient representing the average historical effect of that factor across the state; for state-level factors, the state historical average); and its expected direction and magnitude of effect. Produce the full factor catalog.

Step 1.4: Curate alliance configuration data for major states. Extend the pattern from db.py (which hardcodes Tamil Nadu alliances for 2001-2021) to at least the ten major states. For each state, document alliance configurations for the last three election cycles. Design the data schema for user-editable alliance specifications: a list of alliance blocs, each containing a set of party identifiers and an estimated vote transfer efficiency factor (defaulting to eighty-five to ninety percent based on political science literature on Indian alliance arithmetic). Alliance effects will be modeled as: when parties A and B ally, B's voters transfer to the alliance candidate at the efficiency rate, and the combined vote share is redistributed to the alliance's candidates proportionally.

Step 1.5: Derive formula coefficients for each factor. Using multivariate regression on historical data, compute the marginal effect of each factor on vote share, controlling for other factors. Produce state-specific coefficients where data permits and national-level coefficients as fallback. Apply LASSO or Ridge regularization to prevent coefficient inflation. Validate on held-out data using temporal cross-validation: train on pre-2016 data to predict 2016, train on pre-2021 data to predict 2021. If validation reveals that the full feature set overfits (validation accuracy drops below training accuracy by more than ten percentage points), reduce to the top eight to ten features by SHAP importance and re-derive coefficients.

Step 1.6: Train ensemble ML models (Random Forest, XGBoost, Gradient Boosting) on historical data with all factors as features. Use temporal cross-validation (train on cycles before year Y, test on year Y) across at least two holdout years (2016 and 2021) to avoid reliance on a single noisy estimate. Compute accuracy, RMSE, and calibration metrics per state. If accuracy falls below sixty-five percent for a given state, flag that state for formula-only predictions (no ML mode). Serialize best-performing model in ONNX format using `skl2onnx` or `onnxmltools` — pickle and joblib are explicitly forbidden for any model artifacts that will be loaded by the API server, because pickle deserialization is an arbitrary code execution vector. After export, verify that the ONNX model produces identical predictions (within floating-point tolerance of 1e-6) to the native library (scikit-learn or XGBoost) on the full validation set. This verification step catches edge cases in ONNX export — certain XGBoost configurations with custom objective functions or missing value handling can produce divergent ONNX output. If ONNX export fails or produces divergent predictions, simplify the model architecture (reduce tree depth, remove custom objectives) until export is clean. Compute SHAP values for the trained model to enable per-prediction feature attribution in the ML endpoint.

Step 1.7: Compute error margin parameters. For each factor and each state, estimate the variance of outcomes when the factor takes different values. Produce analytic standard error formulas from the ensemble model's quantile predictions (using quantile regression forests or XGBoost with quantile loss). Do not rely on bootstrap resampling for runtime confidence intervals — bootstrap (one hundred iterations times two hundred constituencies) would take approximately five seconds, exceeding the three-second latency budget. Pre-compute the correlation structure between constituencies within each state (grouped by sub-region or district) to enable analytic variance propagation for aggregate seat-count uncertainty.

Step 1.8: Conduct a fairness assessment of the trained model. Evaluate whether predictions systematically under- or over-predict outcomes for SC/ST reserved constituencies, female candidates, or specific party types. Document any observed bias patterns (e.g., if the model consistently under-predicts female candidate performance in urban constituencies). If systematic bias exceeds two percentage points of vote share for any protected group, apply post-hoc calibration or feature interaction terms to correct it. This assessment is documented in the notebook but does not block release — it informs ongoing model improvement.

Step 1.9: Produce the data science deliverable — a comprehensive Jupyter notebook with all analysis, visualizations, factor catalog, formula coefficients, model performance metrics, SHAP feature importances, fairness assessment, and error margin parameters. Export coefficients and model artifacts to files consumable by the API and frontend. The coefficient export should include a machine-readable JSON file mapping factor names to their regression coefficients per state, with national fallback values. The JSON schema is: `{ "_national": { "<factor_name>": <coefficient>, ... }, "<state_name>": { "<factor_name>": <coefficient>, ... }, ... }` — where each state key maps factor names to their state-specific regression coefficients, and the `_national` key provides fallback coefficients used when a state has insufficient data for state-specific calibration. Each coefficient value is a float representing the marginal effect of a one-unit change in the normalized factor value on vote share. This schema must be agreed upon before Phase 2 and Phase 3 begin, as both the API and frontend consume it independently.

### Phase 2: Backend API Development

This phase creates the backend infrastructure to serve factor metadata, ML predictions, and error margin computations. All new endpoints use the `/v1/` prefix (e.g., `/v1/factors`, `/v1/predict/ml`) to match the existing API convention — the codebase's `main.py` mounts all route modules under a `v1 = APIRouter(prefix="/v1")` router as the primary path, with legacy unprefixed routes registered separately during a deprecation period. New route files (`factor_routes.py`, `prediction_routes.py`) are registered under both the `v1` router (primary) and the app-level router (deprecation-period fallback), following the same dual-registration pattern used by all existing route modules.

Step 2.1: Create a new factor_routes.py file with endpoints for factor metadata. The GET /v1/factors endpoint returns the full factor catalog with names, descriptions, types, ranges, defaults, and data availability by state. The GET /v1/factors/{state} endpoint returns state-specific factor distributions and defaults. These endpoints follow the existing route file pattern (admin_routes.py, bookmark_routes.py, etc.) and are registered in main.py under both the `v1` APIRouter and the app-level router using the same dual-registration include_router mechanism used by all other route files. The existing GET /v1/predict/data endpoint remains in routes.py — it is not moved, to avoid breaking existing clients.

Step 2.2: Define Pydantic request and response models for prediction endpoints. The prediction request model must include Field constraints with ge (greater-than-or-equal) and le (less-than-or-equal) bounds for every slider parameter — for example, turnout: float = Field(ge=0.0, le=100.0), enop: float = Field(ge=1.0, le=20.0), previous_margin_pct: float = Field(ge=0.0, le=100.0). Every factor in the catalog must have explicit range validation. The request model also accepts an optional alliance_config field: a list of alliance blocs, each containing party identifiers and a vote transfer efficiency factor (clamped to 0.5-1.0). The response model follows existing conventions using Optional fields expressed as type | None = None.

Step 2.3: Create a prediction_routes.py file with a POST /v1/predict/ml endpoint. This endpoint accepts the validated prediction request payload, loads the ONNX model, runs inference across all constituencies for the requested state, and returns constituency-level predictions with analytic confidence intervals and per-prediction SHAP feature attributions (top five contributing factors per constituency). The endpoint computes feature data via a single batch SQL query that retrieves all historical data for the state across the last three election cycles, then performs feature assembly in Python — avoiding N+1 query patterns. The assembled feature data is cached per state with the same twenty-four-hour TTL used by the existing prediction endpoint. Apply a dedicated rate limit of twenty requests per sixty seconds per IP for this endpoint (stricter than the global one hundred per sixty seconds), since ML inference is computationally heavier than data-serving endpoints.

Step 2.4: Implement the error margin computation as part of the ML prediction response. Error margins combine three uncertainty sources: model uncertainty from quantile predictions (the model's own spread between the tenth and ninetieth percentile predictions), data quality penalty (wider intervals when factor data is missing or imputed for the selected state, proportional to the fraction of missing features), and slider divergence penalty (wider intervals when the Euclidean distance of slider values from their defaults exceeds a threshold, indicating extrapolation into historically unprecedented territory). Aggregate seat-count uncertainty uses analytic variance propagation with block-correlated constituency win probabilities, as specified in the success criteria.

Step 2.5: Load and register the serialized ONNX model at application startup using onnxruntime. To mitigate cold-start latency on Railway's deployment model (where model loading could add five to ten seconds to startup), implement lazy loading: the model is loaded on the first prediction request rather than at startup, with a clear loading state returned to the client if the model is still initializing. Implement model versioning via a model_metadata table in PostgreSQL with columns: version (string), training_date (timestamp), accuracy_metrics (JSONB containing per-state accuracy and RMSE), active (boolean), and model_path (string). Only one model version is active at a time. Model updates are deployed by inserting a new row and setting it active, allowing rollback by re-activating the previous version. Add a GET /v1/predict/model-health endpoint to verify the model is loaded and report the active model version and its accuracy metrics.

Step 2.6: Implement a circuit-breaker pattern for the ML endpoint. If the ML model's predictions for a known historical election (the most recent held-out year) deviate from actual results by more than ten percent of the state's total constituencies (e.g., twenty-three seats for Tamil Nadu's two hundred and thirty-four constituencies, forty seats for UP's four hundred and three) or ten percentage points RMSE, the endpoint returns a degraded response indicating that formula predictions should be preferred, and an admin alert is triggered. The percentage-based threshold ensures the circuit-breaker is appropriately sensitive for both small states (Goa: four seats) and large states (UP: forty seats), unlike a fixed absolute threshold which would be too generous for small states and too strict for large ones. This prevents deployment of badly-retrained models.

Step 2.7: Implement caching for ML predictions. Because twelve to fifteen continuous sliders make exact-match caching impractical (combinatorial explosion), caching is bucketed: slider values are quantized to the nearest five-percentage-point increment before cache key computation, so that nearby slider configurations share cache entries. Default-configuration predictions for each state are pre-computed and cached at startup (or on first request with lazy loading). Custom slider configurations are cached for one hour with an LRU eviction policy.

Step 2.8: Add database migrations if needed for any new tables (model_metadata for model versioning, and optionally factor_coefficients storing per-state regression coefficients if they are served from the database rather than static files).

Step 2.9: Harden bookmark deserialization. When bookmarks containing prediction parameters are loaded, validate all parameter types and ranges against the Pydantic model before using them. Maliciously crafted JSONB payloads containing unexpected field types, out-of-range values, or injection attempts must be rejected with informative errors rather than silently accepted.

### Phase 3: Frontend Formula Engine Extension

This phase extends the client-side prediction engine with factor-specific adjustment formulas. This phase, combined with Phase 1, produces a complete and independently shippable product — the formula-based multi-factor prediction system — without requiring the ML backend.

Step 3.1: Define the extended AppPredictionParams type with all twelve to fifteen slider fields, organized into categories. Each new field has a default value matching the calibrated defaults from Phase 1 (constituency-specific for constituency-level factors, state averages for state-level factors). Ensure backward compatibility — missing fields default to their calibrated values so that old three-parameter bookmarks load correctly.

Step 3.2: Create a factor configuration module that exports the factor catalog (names, categories, ranges, defaults, tooltips, formula coefficients per state with national fallback) as a TypeScript constant loaded from the Phase 1 JSON export. This configuration must include for each factor: its granularity level (candidate, constituency, or state), how the slider maps to prediction modification, and its coefficient per state.

Step 3.3: Define the candidate-level versus constituency-level factor mapping. This is a central design decision that resolves how sliders with different granularities interact. The system uses two kinds of sliders. State-level impact sliders control the severity of a factor's effect across all constituencies — for example, a "turncoat penalty" slider at its default position applies the historically average vote share penalty to any constituency where the incumbent is a turncoat. Moving the slider increases or decreases the penalty applied. The slider does not make all candidates turncoats; it modulates the penalty where turncoat status already exists in the data. Constituency-level override sliders allow users to adjust a factor's actual value for specific constituencies — for example, overriding the expected turnout in a specific constituency. State-level factors (turnout change, previous party seats) are applied uniformly with a single slider. The UI makes this distinction clear: impact sliders are labeled "Effect of X" and constituency overrides are in a separate collapsible section.

Step 3.4: Refactor predictionEngine.ts to support multi-factor adjustments. Replace the single anti-incumbency transfer with a multiplicative proportional swing model. For each constituency and each party, compute the vote share adjustment as the product of factor modifiers. Factor modifiers are computed as $(1 + \alpha_f \times x_{c,f})$ where $\alpha_f$ is the regression coefficient for factor $f$ and $x_{c,f}$ is the normalized factor value for constituency $c$ (zero when the factor is at its default, positive or negative for deviations). To prevent multiplicative explosion, the total product of modifiers is clamped to the range $[0.5, 2.0]$ before application. After all factors are applied, vote shares are renormalized to ensure they sum to one, and total predicted votes do not exceed valid votes. The renormalization step enforces vote conservation as an invariant, not a hope.

Step 3.5: Implement the alliance configuration logic in the formula engine. When a user specifies alliance blocs, the engine redistributes votes among allied parties according to the vote transfer efficiency factor. Specifically, in constituencies where allied parties previously competed against each other, the weaker allied party's historical vote share is transferred to the stronger allied party at the specified efficiency rate (default eighty-five percent), and the transferred votes are subtracted from the weaker party's total. This extends the existing "New Party / Third Front" mechanism which already models inter-party vote transfer with affinity weights.

Step 3.6: Implement the error margin estimation in the formula engine. Use the variance parameters from Phase 1 to compute approximate confidence intervals based on slider settings. Wider intervals when sliders deviate from defaults. Display these alongside the predictions as constituency-specific and aggregate ranges.

Step 3.7: Extend the existing frontend test infrastructure — Vitest is already configured in vite.config.js (with jsdom environment and globals enabled), and existing test files at `frontend/src/engine/__tests__/predictionEngine.test.ts` and `frontend/src/__tests__/api.test.ts` provide established patterns and fixtures for `generateBaseline`, `applyNewParty`, and `aggregateResults`. New factor formula tests should extend the existing `predictionEngine.test.ts` file or follow its patterns, not create parallel infrastructure. Add unit tests for each factor formula using known historical examples. Verify that default slider values reproduce historical baseline predictions within tolerance. Verify vote conservation (shares sum to one, total votes do not exceed valid votes) using property-based tests with randomized slider inputs.

### Phase 4: Frontend UI — Slider Panel and Alliance Configuration

This phase builds the interactive slider interface, the alliance configuration UI, and the survey data import mechanism.

Step 4.1: Extend PredictionPanel.tsx with new collapsible sections for each factor category. Each section contains the relevant sliders, organized logically: Turnout and Mobilization, Incumbency Dynamics, Electoral Competition, Geographic and Structural, Party Strength. Use the existing Radix UI Collapsible pattern. State-level impact sliders (e.g., "Turncoat Penalty Severity") are labeled with "Effect of" prefix to distinguish them from constituency-level value overrides.

Step 4.2: Build a FactorSlider component that renders a labeled slider with: current value, default value indicator (visual marker on the track), tooltip with factor description explaining what the slider controls and how it affects predictions, and a reset-to-default button. Follow the existing pattern of using Radix UI primitives.

Step 4.3: Implement the error margin display in the prediction results view. Show seat count ranges (e.g., "Party A: 48-55 seats, eighty percent confidence") computed via analytic variance propagation as described in the success criteria. Show per-constituency margin of error indicators in the constituency results table. Include a visual warning when multiple sliders are far from their defaults, indicating that predictions are extrapolating beyond historical precedent.

Step 4.4: Build the alliance configuration UI as a separate "Alliance Configuration" collapsible section below the existing "New Party / Third Front" section, rather than extending the New Party mechanism — alliance configuration (grouping existing parties) and new party injection (adding a hypothetical party) are conceptually distinct operations and merit separate UI sections. Users group existing parties into alliance blocs using a checkbox-based interface: a list of parties with checkboxes, where checking multiple parties assigns them to the current alliance bloc. This interaction pattern is chosen over drag-and-drop because it is mobile-friendly, touch-accessible, and simpler to implement accessibly. For each alliance bloc, display the estimated combined vote share and allow adjustment of the vote transfer efficiency factor (default eighty-five percent). Pre-populate alliance configurations for recent elections in major states using the data curated in Phase 1. All interactive elements in the alliance UI must include appropriate ARIA attributes: `role="group"` for alliance blocs, `aria-label` for each checkbox describing the party and current alliance membership, and `aria-live="polite"` for the combined vote share display that updates dynamically.

Step 4.5: Implement survey data import. Add a "Load Survey Data" option within the slider panel that accepts either a CSV file upload (with columns mapping to factor names and constituency identifiers) or a JSON payload. The import mechanism validates inputs against the factor catalog's ranges (using the same validation constraints as the Pydantic backend model) and populates constituency-specific slider overrides. For power users, this provides a batch alternative to manually adjusting twenty-plus sliders per constituency.

Step 4.6: Add a prediction mode toggle: "Formula" and "ML". When ML mode is selected, fire an API call to the ML prediction endpoint and display results alongside formula results. Handle loading states gracefully — display formula results immediately while ML results load asynchronously. When the two modes diverge by more than five seats, display a visual divergence indicator with a brief explanation. The "blended" mode is not included in the initial release — it will be added only if Phase 5 validation demonstrates that blending outperforms both individual modes.

Step 4.7: Add a prediction disclaimer. Display a persistent note below the prediction results: "These predictions are exploratory what-if scenarios, not forecasts. They reflect the mathematical implications of your slider settings combined with historical patterns. Actual election outcomes depend on factors not captured by this model." This is especially important for the ML mode, which may appear more authoritative due to its confidence intervals.

Step 4.8: Implement mobile-responsive layout for the expanded slider panel. Use collapsible category sections, ensure sliders are touch-friendly, and test on mobile viewports. To address potential React re-rendering jank with twelve-plus slider components on lower-end mobile devices, use React.memo for the FactorSlider component and consider useTransition for non-urgent slider updates that trigger expensive prediction recomputation.

### Phase 5: Integration, Testing, and Validation

Step 5.1: Integration test the full pipeline: slider adjustment in frontend triggers formula prediction update and (optionally) ML API call, both returning predictions with error margins. Verify that alliance configuration adjustments propagate correctly through both formula and ML paths.

Step 5.2: Validate predictions against held-out election data using multiple holdout years (both 2016 and 2021) to avoid relying on a single noisy estimate. Compare formula and ML predictions against actual outcomes. Document accuracy by state. For each state, verify: (a) ML winner prediction accuracy meets the seventy-five percent threshold, or if not, that it meets the sixty-five percent minimum, or if not, that ML predictions are disabled for that state; (b) formula predictions at default slider settings reproduce the historical baseline within rounding tolerance; (c) RMSE for ML vote share predictions is under six percentage points.

Step 5.3: Validate baseline alignment between formula and ML predictions. When all sliders are at their default values, formula and ML predictions must agree within five seats for every state. If they do not, this indicates either a formula coefficient calibration error or a model training issue — both must be debugged and resolved before shipping the ML mode. This step prevents the scenario where the two modes routinely diverge on non-extreme configurations, which would erode user trust.

Step 5.4: Performance test the ML endpoint to ensure sub-three-second response time for the largest states (Uttar Pradesh with four hundred and three constituencies). Specify performance testing methodology: test at p95 latency under simulated load of ten concurrent users, measured on a Railway-comparable environment (not a developer MacBook). Optimize with pre-computation, model simplification, or query optimization if the target is not met.

Step 5.5: End-to-end test backward compatibility — existing bookmarks with three-parameter configurations load and produce predictions using default values for new sliders. Verify that old bookmark predictions match the previous behavior within one seat tolerance (new slider defaults should not alter existing predictions significantly).

Step 5.6: Evaluate whether blended predictions (weighted average of formula and ML, weighted by per-state held-out accuracy) outperform both individual modes on the validation set. If blending outperforms, add it as a third prediction mode in the UI. If not, document the finding and keep only formula and ML as separate modes.

Step 5.7: Write documentation for the factor catalog — what each slider measures, how it affects predictions, and guidance on how to set values based on survey data or ground intelligence. Include a model card for the ML model documenting: training data scope, feature list, accuracy metrics per state, known limitations, and fairness assessment results from Phase 1.

Step 5.8: Define a model retraining schedule. After each new major election (state assembly or general), retrain the ML model on the expanded dataset within thirty days. Retraining follows the same temporal cross-validation protocol from Phase 1. The newly trained model must pass the circuit-breaker validation (Step 2.6) before being activated. This addresses the model drift risk — political realignments (which occur periodically in Indian politics) can shift the relationship between factors and outcomes, and stale models will degrade over time.

## 8. Implementation Plan Summary

Phase 1 (Data Science Research): Foundation phase producing factor catalog (twelve to fifteen factors), regression coefficients, trained ML models (ONNX format), error margin parameters, alliance data curation, fairness assessment, and SHAP feature importances. Highest effort (six to ten weeks), highest risk, no external dependencies.

Phase 2 (Backend API): Factor metadata endpoints, ML prediction endpoint with ONNX runtime, model versioning, circuit-breaker pattern, Pydantic validation, bucketed caching, bookmark hardening, and rate limiting. Depends on Phase 1 model artifacts.

Phase 3 (Frontend Formula Engine): Client-side multi-factor prediction with multiplicative proportional swing, alliance vote transfer, vote conservation invariant, factor granularity mapping, and frontend test infrastructure. Depends on Phase 1 formula coefficients.

Phase 4 (Frontend UI): Slider panel with collapsible categories, alliance configuration UI, survey data import, prediction mode toggle, error margin display, disclaimer, and mobile performance optimization. Depends on Phase 3 engine and partially on Phase 2 API.

Phase 5 (Integration and Validation): End-to-end testing, multi-year holdout validation, baseline alignment verification, blended mode evaluation, performance benchmarking, model card documentation, and retraining schedule. Depends on all prior phases.

This is a personal project with a single developer, so Phases 2 and 3 cannot proceed in true parallel — the same developer must do both. The realistic critical path is: Phase 1 → Phase 3 → Phase 4 (formula-only UI) → ship formula-only release → Phase 2 → Phase 4 (ML integration) → Phase 5. Phases 1 and 3 together produce a complete, shippable formula-based prediction system with twelve to fifteen sliders and alliance configuration. This is a meaningful product milestone that delivers value without requiring ML infrastructure. The ML layer (Phases 2, 4 ML parts, and 5) can follow as a separate initiative.

## 9. Full Test Plan

### Unit Tests

Every factor formula in predictionEngine.ts requires unit tests verifying that: the formula produces the expected vote share adjustment for known input values; the formula handles boundary conditions (minimum and maximum slider values) without producing invalid results (negative vote shares, shares exceeding one hundred percent); the formula returns zero adjustment when the slider is at its default value; and the formula's effect direction matches expectations (e.g., higher incumbency fatigue increases anti-incumbency swing).

The ML model inference endpoint requires unit tests verifying that: the endpoint returns valid JSON with the expected schema; the endpoint rejects out-of-range slider values with informative 422 errors (Pydantic validation); the endpoint clamps or rejects NaN and Infinity values; the endpoint returns confidence intervals that widen when slider values deviate from defaults; and the endpoint produces consistent results for repeated identical inputs.

The factor metadata endpoint requires tests verifying that: all twelve to fifteen factors are returned with complete metadata; default values fall within stated ranges; and state-specific defaults differ from national defaults where expected.

### Negative Tests

The prediction engine must be tested with adversarial and edge-case inputs. Setting all anti-incumbency sliders to their maximum values simultaneously must produce valid (non-negative, bounded) vote shares — the multiplicative clamping to $[0.5, 2.0]$ and renormalization must prevent explosion. Setting conflicting slider combinations (e.g., ninety-five percent turnout with zero percent anti-incumbency, which is historically unprecedented) must produce predictions with appropriately widened error margins, not crashes. Submitting a prediction request for a state the ML model was not trained on must return a clear error indicating formula-only predictions are available. Submitting slider values with incorrect types (strings instead of numbers) or values outside valid ranges must be rejected by Pydantic validation before reaching inference code.

### Coefficient Correctness Tests

A critical integration test must verify that the regression coefficients exported from Phase 1 (the data science notebook) are faithfully imported into the frontend configuration and produce predictions that match the notebook's output for the same inputs. This test takes a set of known constituency-factor-value tuples from the notebook's validation set, runs them through both the notebook's prediction code and the frontend's formula engine, and verifies that the predicted vote shares match within 0.5 percentage points. This catches coefficient transposition, rounding, or misnamed fields during the export-import process, which would produce silently wrong predictions.

### Vote Conservation Property Tests

Vote conservation is a critical invariant: for any combination of slider values and any constituency, predicted vote shares must sum to one (within floating-point tolerance of 1e-6) and total predicted votes must not exceed valid votes. This must be verified not just for hand-picked cases but via property-based testing (using a library like fast-check) with randomized slider inputs across at least one thousand random configurations. The test must cover the full slider range, including all-minimum, all-maximum, and random combinations. Any configuration that violates conservation is a bug.

### Alliance Arithmetic Tests

The alliance configuration logic requires tests verifying that: forming an alliance between two parties increases the stronger party's vote share by approximately the weaker party's share times the transfer efficiency; breaking an alliance decreases the previously-stronger party's share correspondingly; the alliance logic preserves vote conservation; and the efficiency factor clamps correctly at boundary values (zero percent and one hundred percent).

### Integration Tests

The formula prediction pipeline requires integration tests verifying that: adjusting a single slider produces a prediction different from the baseline; adjusting all sliders to their defaults produces predictions matching the historical baseline within tolerance; the prediction conserves total votes (no votes created or destroyed); and predictions remain valid across all states in the dataset.

The ML prediction pipeline requires integration tests verifying that: the API endpoint accepts the full slider payload and returns constituency-level predictions; predictions are state-specific (different states produce different results for the same slider values); confidence intervals are returned for every constituency; SHAP attributions are returned for each constituency; and the circuit-breaker fires when model predictions are egregiously wrong for historical elections.

### End-to-End Tests

Backward compatibility tests verify that: bookmarks saved with the old three-parameter schema load correctly; predictions from old bookmarks match the previous behavior within one seat tolerance (new slider defaults should not alter existing predictions significantly); and maliciously crafted bookmark JSONB payloads with invalid types or out-of-range values are rejected gracefully.

User workflow tests verify that: a user can select a state, adjust sliders, and see updated predictions; switching between formula and ML modes works correctly; error margins are displayed and respond to slider changes; alliance configuration produces visible prediction changes; and the survey data import mechanism correctly populates slider overrides.

Accessibility tests verify that: all factor sliders are keyboard-operable (focusable via Tab, adjustable via Arrow keys); the alliance configuration UI is navigable without a mouse (checkbox selection via Space, alliance bloc navigation via Tab); all sliders have appropriate ARIA attributes (`aria-label` describing the factor, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and `aria-valuetext` for the current human-readable value); the prediction mode toggle is announced by screen readers; and dynamic content updates (error margins, seat counts, divergence warnings) use `aria-live` regions. Since the codebase uses Radix UI primitives which provide accessibility foundations, these tests primarily verify that custom composition does not break the built-in accessibility rather than building it from scratch.

### Frontend Test Infrastructure

The workspace currently has no visible frontend tests. Phase 3 must set up Vitest as the frontend test runner (compatible with Vite, already the build tool). Create a test configuration file, establish the test directory structure (frontend/src/__tests__/ or co-located .test.ts files), and verify that the test runner executes correctly in CI before writing factor-specific tests. This is a prerequisite for all frontend unit and property tests described above.

### Performance Tests

The ML prediction endpoint must respond within three seconds at p95 latency under simulated load of ten concurrent users, measured on a Railway-comparable deployment environment. The formula engine must update predictions within one hundred milliseconds of slider adjustment on a mid-range mobile device (tested via browser performance profiling). The factor metadata endpoint must respond within five hundred milliseconds. Performance testing methodology: use a load testing tool (e.g., k6 or locust) to simulate concurrent users hitting the ML endpoint with varying slider configurations. Report p50, p95, and p99 latencies.

### Regression Tests

Existing prediction functionality (anti-incumbency, turnout, new party injection) must continue to work after the engine refactor. The existing slider UI must remain functional. Existing API endpoints must not be affected.

## 10. How to Execute and Document the Implementation

The implementation should proceed in five pull requests, one per phase. Phase 1 produces a Jupyter notebook and exported artifacts committed to the datascience/ directory. Phase 2 produces new API route files and model loading code committed to api/. Phase 3 produces the refactored prediction engine committed to frontend/src/engine/. Phase 4 produces the extended UI components committed to frontend/src/components/. Phase 5 produces test files and validation reports.

Each pull request should include a summary of what was changed, why, and what to verify during review. The data science PR (Phase 1) should include the notebook with all cells executed and output visible, plus the exported coefficient files and serialized models. Reviewers should verify that the analysis methodology is sound, the factor selection is justified, and the held-out validation shows acceptable accuracy.

Progress should be tracked via the existing todo list mechanism within the development environment. Each phase completion should be noted with key metrics (e.g., "Phase 1 complete: 22 factors identified, 85% winner accuracy on held-out 2021 data, coefficients exported").

Rollback for each phase is straightforward: revert the PR. The phases are designed so that partial completion is useful — Phase 1 produces valuable research even without the subsequent engineering phases, and Phase 3 (formula engine) is useful even without Phase 2 (ML endpoint).

## 11. How to Execute and Document the Tests

Tests should be written alongside implementation in each phase. Phase 1 includes validation within the notebook (cross-validation metrics, holdout test results). Phase 2 includes API tests in api/tests/. Phase 3 includes engine unit tests. Phase 4 includes component tests. Phase 5 is dedicated to integration and end-to-end tests.

Test results should be captured as part of the CI pipeline output and summarized in PR descriptions. A passing test suite requires: all unit tests pass, all integration tests pass, performance benchmarks meet thresholds, and backward compatibility tests confirm no regression.

Test failures discovered during execution should be triaged as either implementation bugs (fix immediately) or test design issues (update the test with justification). No test should be deleted without explanation.

Coverage should be measured for the prediction engine (target: ninety percent line coverage for predictionEngine.ts) and the API prediction endpoints (target: eighty percent). The data science notebook is exempt from coverage metrics but must include validation cells.

## 12. Full Document Summary

This document proposes a hybrid formula-plus-ML multi-factor prediction system for the Indian election analysis platform. The system transforms the current three-parameter prediction engine into a twelve-to-fifteen-slider instrument grounded in data science research on TCPD datasets covering all Indian states. The recommended approach combines client-side formula-based predictions for instant interactivity with server-side ML inference for higher accuracy and confidence intervals. The formula layer alone constitutes a complete, shippable product — Phases 1 and 3 deliver a functional multi-factor system without requiring ML infrastructure, making the plan feasible for a single developer.

The implementation spans five phases: data science research (factor discovery with scope constrained to twelve to fifteen high-availability factors, formula derivation, model training in ONNX format, alliance data curation, and fairness assessment), backend API development (factor metadata and ML prediction endpoints with Pydantic validation, ONNX runtime, model governance, circuit-breaker pattern, bucketed caching, and rate limiting), frontend formula engine extension (multiplicative proportional swing with dampening, alliance vote transfer, candidate-versus-constituency factor granularity resolution, and vote conservation enforcement), frontend UI development (slider panel with alliance configuration, survey data import, prediction disclaimers, and mobile performance optimization), and integration testing (multi-year holdout validation, baseline alignment verification, blended mode evaluation, and model retraining schedule).

Key risks include data sparsity for small states (mitigated by national-level fallback models and reduced-feature sets for states below the sixty-five percent accuracy threshold), overfitting with twelve to fifteen features across three election cycles (mitigated by temporal cross-validation across multiple holdout years, LASSO/Ridge regularization, and willingness to reduce to eight to ten features if overfitting is detected), ML inference latency (mitigated by analytic confidence intervals instead of bootstrap, bucketed caching, and lazy model loading), model drift as new elections change political dynamics (mitigated by a defined retraining schedule and circuit-breaker validation), user misinterpretation of predictions as forecasts (mitigated by persistent disclaimers and appropriately widened error margins for extrapolated configurations), formula/ML baseline disagreement (mitigated by Phase 5 alignment validation requiring agreement within five seats at default settings), and multiplicative explosion in the formula layer (mitigated by clamping modifiers to $[0.5, 2.0]$ and mandatory renormalization).

Security considerations include mandatory ONNX serialization (pickle forbidden), Pydantic Field constraints for all slider inputs, dedicated rate limiting for the ML endpoint, bookmark deserialization validation, and parameterized SQL queries (already in place). The system includes SHAP feature attributions for ML predictions and a fairness assessment documenting any systematic bias for SC/ST constituencies or female candidates.

The expected outcome is a prediction system that achieves seventy-five percent or better winner prediction accuracy via the ML layer across major states (with a sixty-five percent minimum threshold below which ML is disabled), while providing transparent, adjustable, and constituency-specific predictions with honest error margins through the formula layer. Alliance configuration — the strongest predictor of Indian election outcomes — is addressed via a dedicated user-input interface with checkbox-based party grouping, separate from the existing New Party mechanism, rather than being punted to an open question.

Open decisions remaining for Phase 1 resolution include: the exact ranking of the twelve to fifteen factors (to be determined by SHAP importance analysis), whether the GA dataset provides useful supplementary data, and the specific vote transfer efficiency rates for alliance modeling across different states.

---

## Appendix: Refinement Notes

### Iteration 1 — 2026-04-30

**Critic Score:** 31/55

#### Completeness (2/5 → resolved)

- **Alliance modeling:** Added concrete alliance data curation step (Phase 1, Step 1.4), alliance vote transfer logic in the formula engine (Phase 3, Step 3.5), and alliance configuration UI (Phase 4, Step 4.4). The system extends the existing New Party/Third Front mechanism with user-editable alliance blocs and vote transfer efficiency factors.
- **GE support:** Explicitly scoped GE to a deferred phase with documented rationale (missing age/district_name columns, 501 backend status, different constituency dynamics requiring separate calibration). Section 3 now states this clearly.
- **GA dataset:** Added investigation step in Phase 1, Step 1.1 — the GA dataset will be profiled and either incorporated or explicitly excluded with documented rationale.
- **Aggregate error margin math:** Specified analytic variance propagation with block-correlated constituency model in Section 3 success criteria and Phase 1, Step 1.7. Monte Carlo simulation rejected due to latency; bootstrap rejected for same reason.
- **Survey data import:** Added CSV/JSON import mechanism in Phase 4, Step 4.5.
- **ML endpoint rollback/failure recovery:** Added circuit-breaker pattern in Phase 2, Step 2.6.

#### Feasibility (2/5 → resolved)

- **Phase 1 effort estimate:** Added realistic six-to-ten-week estimate with rationale. Constrained scope from twenty-five to twelve-to-fifteen factors.
- **Single-developer acknowledgment:** Section 6, Section 8, and Phase ordering now explicitly acknowledge this is a personal project. The critical path is serialized: Phase 1 → 3 → 4 (formula ship) → 2 → 4 ML → 5. Formula-only is a complete shippable milestone.
- **Scope reduction:** From twenty-five factors to twelve-to-fifteen, selecting only those with ninety percent or higher data availability post-2000. Sparse-data factors (education, profession, sub-region, age for GE) deferred.
- **ML deployment infrastructure:** Added lazy model loading (Phase 2, Step 2.5) to address cold-start latency, ONNX runtime instead of pickle, and realistic infrastructure requirements.
- **Validation criteria:** Reduced from eighty percent to seventy-five percent ML winner accuracy target. Added sixty-five percent minimum threshold below which ML is disabled per state. Formula layer accuracy expectations separated and set realistically.

#### Risk Assessment (2/5 → resolved)

- **Vague mitigations:** Every risk now has a concrete, operationalized mitigation. Data sparsity: national-level fallback plus reduced-feature models. Overfitting: temporal cross-validation across two holdout years plus LASSO/Ridge plus willingness to reduce to eight-to-ten features.
- **Model drift:** Added retraining schedule (Phase 5, Step 5.8) — retrain within thirty days of each new major election, validated via circuit-breaker before activation.
- **User misinterpretation:** Added prediction disclaimer (Phase 4, Step 4.7) and guidance on labeling predictions as exploratory scenarios, not forecasts.
- **Formula/ML baseline disagreement:** Added Phase 5, Step 5.3 baseline alignment validation requiring agreement within five seats at default settings. Disagreement on routine configurations must be resolved before shipping ML mode.

#### Security (3/5 → resolved)

- **Pickle deserialization:** Explicitly mandated ONNX format and forbidden pickle/joblib in Phase 1, Step 1.6 and throughout Phase 2.
- **Input validation:** Added Pydantic models with Field(ge=..., le=...) constraints for every slider parameter in Phase 2, Step 2.2.
- **Rate limiting:** Added dedicated twenty-requests-per-sixty-seconds rate limit for ML endpoint in Phase 2, Step 2.3.
- **Bookmark hardening:** Added bookmark deserialization validation in Phase 2, Step 2.9.

#### Performance (3/5 → resolved)

- **Bootstrap CI:** Explicitly mandated analytic standard errors and quantile predictions. Bootstrap rejected with rationale (five-second latency exceeding three-second budget). Phase 1, Step 1.7 and Section 3.
- **Caching strategy:** Added bucketed caching with slider quantization to nearest five percentage points in Phase 2, Step 2.7. Default predictions pre-computed and cached.
- **Feature assembly queries:** Added batch query strategy in Phase 2, Step 2.3 — single query fetches all historical data, feature assembly in Python, cached per state with twenty-four-hour TTL.
- **Frontend re-rendering:** Added React.memo and useTransition recommendations in Phase 4, Step 4.8 for mobile performance.

#### Approach Validity (3/5 → resolved)

- **Blended mode:** Deferred from initial release. Phase 5, Step 5.6 evaluates blending on validation data; only added if it outperforms both individual modes.
- **Overfitting risk:** Scope reduced to twelve-to-fifteen factors. Explicit fallback to eight-to-ten features if overfitting detected. Two-year holdout validation instead of single year.
- **Multiplicative explosion:** Added clamping to $[0.5, 2.0]$ range and mandatory renormalization in Section 4 Approach C and Phase 3, Step 3.4.
- **Factor ordering:** Defined canonical three-level ordering (state → constituency → candidate) with simultaneous application within each level in Section 4 Approach C and Phase 3, Step 3.4.

#### Industry Standards (3/5 → resolved)

- **Model governance:** Added model_metadata table with version, training date, accuracy metrics, active status in Phase 2, Step 2.5. Model versioning with rollback capability.
- **SHAP explainability:** ML endpoint returns per-prediction top-five SHAP feature attributions in Phase 2, Step 2.3.
- **Multiplicative formula:** Justified with $[0.5, 2.0]$ dampening bounds and described as proportional swing model following psephological tradition. Bounds-checking prevents uncalibrated explosion.
- **Fairness assessment:** Added Phase 1, Step 1.8 evaluating prediction bias for SC/ST constituencies and female candidates with post-hoc calibration if bias exceeds two percentage points.

#### Codebase Alignment (3/5 → partially resolved, corrected in Iteration 2)

- **API versioning:** Changed all endpoints from /v1/factors, /v1/predict/ml to unversioned /factors, /predict/ml based on initial assumption that unversioned was the convention. This was incorrect — see Iteration 2 correction below.
- **Route file organization:** Clarified that existing GET /predict/data stays in routes.py, new endpoints go in factor_routes.py and prediction_routes.py following existing multi-file pattern.

#### Test Coverage (3/5 → resolved)

- **Negative tests:** Added comprehensive negative test section covering extreme slider values, conflicting combinations, unknown states, and invalid types.
- **Coefficient correctness tests:** Added dedicated test verifying exported coefficients match notebook output for known inputs.
- **Vote conservation property tests:** Added property-based testing with randomized slider inputs across one thousand configurations using fast-check.
- **Frontend test infra:** Added explicit Vitest setup step in Phase 3, Step 3.7 as a prerequisite for all frontend tests.
- **Alliance arithmetic tests:** Added dedicated test section for alliance vote transfer logic.
- **Performance test methodology:** Specified p95 latency target, ten concurrent users, Railway-comparable environment, and k6/locust tooling.

#### Logical Soundness (3/5 → resolved)

- **Success criteria tension:** Separated formula and ML accuracy expectations. Formula at defaults reproduces historical baseline (inherently fifty-to-sixty-five percent). ML targets seventy-five percent. Each mode has its own success criterion.
- **"Normalized default" defined:** Clarified three distinct default types: constituency-specific (actual value from most recent election), state-level average, and coefficient-calibrated impact severity for candidate-level factors used as state-wide sliders.
- **Candidate-vs-constituency factor granularity:** Resolved in Phase 3, Step 3.3 — state-level "impact severity" sliders modulate the penalty where a factor exists in data (e.g., turncoat penalty applies only where the incumbent is a turncoat), not applied uniformly. Separate constituency override mechanism for direct value adjustment.

#### Pros and Cons Balance (4/5 → minor improvement)

- Added explicit acknowledgment that formula/ML disagreement on routine configurations is a trust risk, not just an "interesting signal." Phase 5 alignment validation addresses this.
- Emphasized that Approach A is the first deliverable milestone within Approach C, not a separate alternative.

### Iteration 2 — 2026-04-30

**Critic Score:** 44/55

#### Codebase Alignment (3/5 → resolved)

- **API versioning corrected:** The Iteration 1 change to unversioned paths was wrong. Codebase verification of `main.py` lines 549-569 reveals that `v1 = APIRouter(prefix="/v1")` is the primary route convention, with unprefixed routes registered as "Legacy unprefixed routes (deprecation period)." All endpoints corrected to `/v1/` prefix: `/v1/factors`, `/v1/factors/{state}`, `/v1/predict/ml`, `/v1/predict/model-health`. New route files registered under both the `v1` router and app-level router following the dual-registration pattern.
- **Existing frontend test infrastructure:** Phase 3, Step 3.7 now references the existing Vitest configuration (already in vite.config.js with jsdom and globals) and existing test files (`predictionEngine.test.ts`, `api.test.ts`) rather than specifying setup from scratch.

#### Risk Assessment (4/5 → minor improvement)

- **Circuit-breaker threshold:** Changed from fixed absolute threshold (fifteen seats) to percentage-based (ten percent of total constituencies), which scales correctly across small states (Goa: four seats) and large states (UP: forty seats).
- **ONNX export verification:** Added explicit verification step in Phase 1, Step 1.6 confirming that the trained model exports to ONNX and produces identical predictions to the native library. Addresses edge cases with XGBoost custom objective functions or missing value handling.

#### Completeness (4/5 → minor improvement)

- **Alliance UI design resolved:** Changed from ambiguous "drag-and-drop or checkbox-based" to definitive checkbox-based interaction pattern for mobile-first compatibility, with ARIA attributes specified. Alliance configuration is now a separate collapsible section from New Party, reflecting the conceptual distinction between grouping existing parties and injecting hypothetical new ones.
- **Coefficient JSON schema defined:** Added explicit schema `{ "_national": { "<factor>": <coefficient> }, "<state>": { "<factor>": <coefficient> } }` in Phase 1, Step 1.9, enabling Phase 2 and Phase 3 to proceed independently without integration surprises.

#### Test Coverage (4/5 → minor improvement)

- **Accessibility testing added:** New accessibility test section in the E2E tests covering keyboard navigation for sliders, ARIA attributes (`aria-label`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-valuetext`), screen reader compatibility for prediction mode toggle, and `aria-live` regions for dynamic content updates.

#### Logical Soundness (4/5 → minor improvement)

- **"Knowledgeable user" accuracy target:** Replaced unmeasurable qualitative target with a concrete backtesting scenario — set sliders to match known post-election ground truth for a held-out year and verify seventy percent or better winner accuracy.
