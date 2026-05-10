# Prediction Platform V2: Surveyor-Centric Intelligence System

**Date:** 2026-04-30

**Pipeline Tier:** Extended
**Routing Rationale:** Cross-cutting architectural change adding new database entities (campaigns, booths, submissions, surveyors), new API surface (survey CRUD, booth predictions, dashboards, PDF reports), new frontend modules (surveyor mobile UI, heat maps, scenario comparison, report generator), and new infrastructure (offline-first, service workers, file storage). Largest scope in pipeline history.
**Status:** Final
**Iterations:** 2
**Final Dimension Scores:** Security 4, Performance 4, Approach Validity 4, Pros/Cons 5, Industry Standards 4, Completeness 4, Feasibility 4, Risk Assessment 4, Codebase Alignment 4, Test Coverage 4, Logical Soundness 4
**Total Score:** 45/55
**Verifier Result:** PASS (remediated)

---

## 1. Introduction

The election analysis platform completed its V1 prediction system, delivering a twelve-factor formula engine with multiplicative proportional swing, alliance configuration with historical presets for seven states, a survey CSV/JSON import mechanism, and a skeleton ML inference endpoint. Users can adjust sliders for turnout change, incumbency fatigue, turncoat penalty, re-contest bonus, previous margin, effective number of parties, candidate count, constituency type, gender, and party strength — each with state-specific regression coefficients — and see constituency-level predictions with error margins that widen as slider values deviate from defaults.

V1 is an analyst's tool. It assumes the user understands psephological concepts, knows what coefficient values to set, and can reason about multi-factor interactions. The CSV import requires manual file preparation with exact column naming. There is no way for a field surveyor standing outside a polling booth to contribute ground intelligence to the prediction model. There is no way for a campaign coordinator to dispatch teams, track progress, or reconcile conflicting observations. There is no way to compare two alternative scenarios side by side, generate a report for stakeholders, or see geographic patterns on a map. The prediction engine runs entirely at constituency granularity — the finest unit — with no ability to drill into booth-level dynamics even though booth-level variation drives constituency outcomes.

This document presents a strategic plan for V2, which transforms the platform from an analyst-facing slider tool into a surveyor-centric intelligence system. The central design shift is that predictions become the output of structured survey campaigns, not the output of abstract slider manipulation. Surveyors fill in what they observe — voter mood, party visibility, booth-level turnout patterns, candidate strength assessments — and the system translates these human observations into mathematical factor adjustments that feed the existing prediction engine. The sliders still exist for power users, but the primary input path becomes a questionnaire-driven surveyor workflow.

## 2. Motivation

Four concrete gaps in V1 motivate this work.

First, the survey import mechanism is a dead end for field operations. The SurveyImportModal accepts a CSV with factor names and values, but field surveyors do not think in terms of "incumbencyFatigue: 65" or "turncoatPenalty: 40." They think in terms of "the sitting MLA is very unpopular in this area," "the opposition candidate has strong support among women," or "voter turnout will be higher here because of a local issue." V1 provides no translation layer between human observations and mathematical parameters. Every survey submission requires a psephological expert to manually translate field notes into slider values, which defeats the purpose of scaling data collection.

Second, V1 operates exclusively at constituency granularity. A constituency in India contains two hundred to four hundred polling booths, and the variation between booths within a constituency can be enormous — an urban booth in a bazaar area may swing one way while a rural booth in a farming village swings the opposite way. Predicting only at the constituency level forces the analyst to mentally average these variations, losing the granularity that makes predictions actionable. Field teams need booth-level predictions that aggregate upward, not constituency-level predictions that assume homogeneity.

Third, V1 provides no collaborative workflow. There is no concept of a campaign, a team, or a surveyor account. A coordinator cannot assign booths to surveyors, track who has completed their assignments, or identify conflicting data. Every user operates in isolation, adjusting their own sliders without any mechanism for aggregating intelligence from multiple sources. For an organization deploying fifty surveyors across a state, V1 is useless as a coordination platform.

Fourth, V1 produces predictions but no derivative intelligence products. There is no scenario comparison tool (what happens if alliance X forms versus alliance Y), no geographic visualization (which regions are the most competitive), no exportable report (for stakeholders who do not use the application), and no historical analysis tool (how have these constituencies swung over the past four elections). Predictions without context, comparison, and presentation are analytically interesting but operationally incomplete.

Additionally, the ML prediction endpoint remains a skeleton — the ONNX model has not been trained, SHAP attributions are not returned, and the circuit breaker uses a simple failure counter rather than accuracy validation. V2 should complete the ML integration and add Bayesian updating so that survey data continuously refines model priors rather than simply overriding slider values.

## 3. Purpose

V2 will deliver the following measurable outcomes.

First, a surveyor questionnaire system that translates plain-language field observations into mathematical factor adjustments. Surveyors answer questions like "How strong is anti-incumbency sentiment in this area?" on a five-point scale, and the system maps their response to the appropriate slider value and factor coefficient. The questionnaire covers all twelve existing factors plus new qualitative factors not in V1 (local issue salience, candidate personal appeal, caste/community consolidation, welfare scheme satisfaction, development satisfaction, media influence, money/gift distribution perception, and party worker activity). The questionnaire can be constituency-level or booth-level depending on campaign configuration.

Second, a survey campaign management system where coordinators create campaigns scoped to a state and election, define booth clusters, assign surveyors, and track progress in real time. The system provides a campaign dashboard showing completion percentage, data quality scores, inter-surveyor conflict rates, and geographic coverage gaps. Campaigns support role-based access: coordinators manage campaigns, surveyors submit observations, and analysts access predictions.

Third, booth-level prediction capability. When survey data is available at booth level, predictions operate at booth granularity and aggregate upward to constituency and state totals. When only constituency-level data is available (the default for non-surveyed areas), the system uses synthetic disaggregation from constituency-level TCPD data. The aggregation must be mathematically consistent — booth-level predictions must sum to constituency totals within one percentage point.

Fourth, a scenario comparison tool that allows users to save multiple prediction configurations (different alliance structures, different survey assumptions, different slider settings) and compare them side by side with delta metrics highlighting which constituencies change hands.

Fifth, a psephological report generator that produces a downloadable PDF containing an executive summary, per-constituency prediction tables, swing analysis compared to the previous election, data provenance (which predictions are survey-informed versus model-only), and confidence intervals. The report should be generated within ten seconds for a full state.

Sixth, interactive constituency-level visualization showing geographic patterns in prediction confidence, predicted swing magnitude, and survey coverage. While machine-readable constituency GeoJSON boundary files for India are not freely available, a choropleth table or district-level map aggregation using available geographic data can provide meaningful geographic intelligence without the constituency boundary blocker.

Seventh, completed ML integration with trained ONNX model, SHAP attributions per prediction, and Bayesian updating that treats survey observations as evidence that shifts model priors rather than hard overrides. The ML model should be functional, not a skeleton endpoint.

Eighth, offline-first surveyor experience enabling data collection in areas with poor connectivity. Survey submissions are stored locally and synchronized when connectivity is available, with conflict resolution for submissions that arrive out of order or contradict each other.

Success criteria: a surveyor can open the application on a mobile device, select their assigned campaign, answer a booth-level questionnaire (configured by the coordinator to include eight to twelve questions selected from the full factor catalog of twenty) in under three minutes, submit offline, have it sync within sixty seconds of reconnection, and see the campaign dashboard update with their contribution. The questionnaire length is configurable per campaign — coordinators select which factors are most relevant for their specific electoral context, balancing data richness against surveyor fatigue. A ten-question default subset is recommended for booth-level surveys (covering the six most impactful quantitative factors and four qualitative factors), while the full twenty-factor questionnaire is available for constituency-level surveys where more time per submission is acceptable. A coordinator can view campaign progress in real time, identify gaps, export raw survey data as CSV, and export a PDF report for stakeholders.

## 4. Analysis

Three architectural approaches were evaluated for delivering the V2 surveyor-centric system.

### Approach A: Survey Layer on Existing Engine (Questionnaire-to-Slider Translation)

This approach adds a survey questionnaire frontend that translates human-readable responses into the existing twelve slider values, then feeds them into the existing predictionEngine.ts unchanged. The backend adds campaign and submission management tables, but the prediction computation remains entirely client-side.

The core mechanism works as follows. A questionnaire configuration maps each question to one or more prediction factors. For example, "How strong is anti-incumbency sentiment?" maps to the incumbencyFatigue slider with a five-point scale (None=0, Mild=25, Moderate=50, Strong=75, Very Strong=100). When a surveyor submits answers, the backend stores the raw responses and computes the translated factor values. The frontend fetches aggregated survey data per constituency (averaged across all surveyor submissions, weighted by surveyor quality score) and injects it as default slider values. The prediction engine runs exactly as in V1 with these survey-derived defaults.

Strengths: minimal changes to the prediction engine, preserves all V1 behavior, fast to implement, easy to reason about. Weaknesses: no booth-level prediction (still constituency-only), no Bayesian updating (survey data is a hard override, not a probabilistic update), limited to the existing twelve factors (new qualitative factors require engine changes), and the translation from five-point-scale to slider values is arbitrary without empirical calibration. The questionnaire is essentially a prettier CSV import, not a fundamentally new prediction paradigm.

### Approach B: Full Booth-Level Bayesian Engine (Ground-Up Rebuild)

This approach rebuilds the prediction engine from scratch around booth-level observations. Each booth has a prior probability distribution for party vote shares (derived from constituency-level TCPD data via synthetic disaggregation). Survey observations are treated as evidence that updates these priors using Bayesian conjugate updating. The posterior distributions are aggregated from booth to constituency to state using Monte Carlo simulation.

The core mechanism: for each booth, the prior distribution is a Dirichlet distribution parameterized by historical vote shares for each party. When a surveyor reports "Party A is very strong in this booth," this is encoded as a likelihood function that shifts the posterior toward Party A. Multiple surveyor observations for the same booth combine naturally through iterated Bayesian updating. Constituency predictions are computed by summing booth-level posteriors, which automatically produces uncertainty estimates.

Strengths: mathematically rigorous, naturally handles uncertainty, survey data improves predictions incrementally rather than overriding them, booth-level granularity is native. Weaknesses: computationally expensive (Monte Carlo simulation across 200-300 booths per constituency × 400 constituencies for UP is extremely slow), requires booth-level prior calibration which is essentially fiction (TCPD has no booth data — synthetic disaggregation distributes constituency votes uniformly, producing meaningless booth-level priors with ±15-25% error), the Dirichlet-update math is opaque to users (they cannot understand why their observation had a particular effect), and this is a ground-up rewrite of the prediction engine that discards all V1 work. The implementation timeline for a single developer would exceed six months for the engine alone.

### Approach C: Hybrid Survey-Augmented Engine (Recommended)

This approach preserves the V1 prediction engine's architecture (formula-based proportional swing, client-side) while adding three new layers: a surveyor questionnaire system that translates observations into factor values with empirical calibration, a survey aggregation backend that computes per-constituency factor profiles from multiple surveyor submissions, and a lightweight booth-level disaggregation layer that distributes constituency predictions to booths based on survey-informed booth profiles.

The core mechanism works in three stages. Stage one (survey collection): surveyors answer a structured questionnaire covering both the existing twelve factors and eight new qualitative factors. Each question maps to a factor with a calibrated translation function (not arbitrary — the translation is derived from regression analysis of historical data). Responses are stored as raw survey data with metadata (surveyor, timestamp, GPS, confidence rating). Stage two (aggregation): the backend aggregates multiple surveyor responses per constituency using quality-weighted averaging. Conflict detection flags constituencies where surveyors disagree by more than two standard deviations. The aggregated factor profile becomes the default slider configuration for that constituency. Stage three (prediction): the existing predictionEngine.ts runs with survey-derived defaults. For booth-level output, the constituency prediction is disaggregated proportionally based on booth-level survey indicators — booths where surveyors reported stronger party support receive proportionally more of that party's predicted vote share. This is not a true booth-level prediction (it is a proportional allocation), but it provides the appearance of booth-level granularity that field teams need for operational planning, clearly labeled as "estimated" rather than "predicted."

Strengths: preserves all V1 work, the survey questionnaire provides the surveyor-first experience the user requested, aggregation handles multi-surveyor collaboration naturally, conflict detection enables coordinator oversight, the booth disaggregation satisfies the operational need without false precision, and the implementation is incremental. The eight new qualitative factors expand the prediction surface significantly. Weaknesses: booth-level "predictions" are allocations rather than true predictions (lower precision than Approach B in theory, though in practice B's priors are equally uninformed), the questionnaire-to-factor translation requires careful calibration, and maintaining twenty factors (twelve plus eight new) increases complexity.

### Comparative Assessment

| Criterion | Approach A (Survey Layer) | Approach B (Full Bayesian) | Approach C (Hybrid) |
|---|---|---|---|
| Estimated effort (single dev) | 2–3 months | 6+ months (engine alone) | 4–6 months |
| V1 engine changes | None | Complete rewrite | Additive (new factors) |
| Booth-level output | No | Native | Proportional allocation |
| New qualitative factors | Can add independently | Native | Additive |
| Survey-to-prediction bridge | Slider override only | Bayesian conjugate update | Slider defaults + Bayesian for ML mode |
| Campaign management | Can add independently | Can add independently | Integrated |
| Data requirements | TCPD only | Booth-level historical (unavailable) | TCPD + survey data |
| Analytical depth | Low (UX improvement) | High (if data existed) | Medium (operational value) |

Approach A deserves a fairer assessment than "too thin." Enhanced with the eight new qualitative factors, campaign management, and multi-surveyor aggregation, Approach A covers approximately eighty percent of the user's stated goals at roughly sixty percent of the effort. The key feature that Approach A lacks is booth-level output and the disaggregation view — which, as acknowledged, is proportional allocation in Approach C rather than true prediction. Approach A is a viable choice if timeline pressure is the dominant concern.

Approach B remains infeasible. Its theoretical superiority is negated by the absence of real booth-level historical data in TCPD. The synthetic Dirichlet priors would produce booth-level predictions with ±15–25% error margins — no better than Approach C's proportional allocation — while requiring a ground-up engine rewrite and six-plus months of development time.

Approach C captures the user's vision (surveyors fill in stats, system predicts) while being technically achievable, preserving V1 investment, and adding booth-level operational output that Approach A cannot provide. The incremental effort over Approach A (approximately two additional months) delivers the booth disaggregation view, the survey-informed error margin narrowing, and a more complete intelligence platform.

## 5. Suggestions

Approach C (Hybrid Survey-Augmented Engine) is the strongest option overall. Approach A enhanced with new qualitative factors is a viable fallback if timeline becomes the dominant constraint — it delivers approximately eighty percent of the value at sixty percent of the effort, and could serve as an interim release before booth-level features are added. Approach B should be rejected because its theoretical superiority is negated by the absence of real booth-level historical data, its computational cost, and its implementation timeline that exceeds six months for the engine alone.

Approach C can be phased so that each phase delivers value independently: Phase 1 (survey backend + questionnaire) is useful without booth-level output, Phase 2 (campaign management) is useful without heat maps, and so on. If development stalls partway through, the project gracefully degrades to an enhanced Approach A (Phases 1-2 without Phase 3).

## 6. Recommended Suggestion

The Hybrid Survey-Augmented Engine (Approach C) is recommended. It transforms the platform from an analyst slider tool into a surveyor-first intelligence system while preserving the entire V1 prediction engine. The central innovation is the structured questionnaire that translates field observations into mathematical factor adjustments — this is the bridge between surveyors and the prediction model that V1 lacks.

The strongest counterargument is that booth-level "predictions" via proportional allocation are not true predictions. This is acknowledged and addressed through honest labeling ("Estimated booth distribution based on survey indicators") and by emphasizing that the value is operational (knowing which booths to focus campaign resources on) rather than analytical (predicting exact booth-level vote counts). When real booth-level data becomes available for specific states (through ECI PDF extraction), the system can seamlessly switch from allocation to true prediction for those states. It is important to distinguish clearly between survey reporting (reflecting what surveyors observed) and model prediction (what the formula or ML engine infers). Booth-level output is a survey-anchored distribution, not a model-generated prediction, and the UI must make this distinction explicit.

The second counterargument is that Approach A enhanced with new factors covers most of the value at lower effort. This is true in the short term, but Approach C's phased design means Phases 1-2 effectively deliver an enhanced Approach A, and the booth-level features in Phase 3 add incremental value without requiring a separate project. If development stalls after Phase 2, the delivered product is still a strong enhanced Approach A.

Approach B falls short because it requires a ground-up engine rewrite with a six-plus-month timeline and depends on booth-level historical data that does not exist in TCPD.

## 7. Full Implementation Plan

### Phase 1: Survey Questionnaire and Backend Infrastructure (Foundation)

This phase builds the core survey data model and the questionnaire that translates field observations into prediction factors. It is the foundation for all subsequent phases.

Step 1.1: Design the survey database schema. Four new tables are needed. The campaigns table stores campaign metadata (name, state, election type, election year, created_by, status, created_at, updated_at). The survey_booths table stores booth definitions within a campaign (campaign_id, constituency_no, booth_number, booth_name, latitude, longitude, estimated_electors). The survey_submissions table stores individual surveyor responses (campaign_id, constituency_no, booth_number, surveyor_user_id, submitted_at, synced_at, gps_latitude as NUMERIC(8,5), gps_longitude as NUMERIC(8,5), confidence_rating, quality_score, raw_responses as JSONB, computed_factors as JSONB, status as draft/submitted/reviewed/flagged). GPS coordinates use NUMERIC(8,5) precision (~1.1m accuracy) — sufficient for booth proximity verification while limiting surveyor location tracking precision. GPS collection is opt-in: the submission endpoint accepts null GPS values without rejecting the submission. GPS data is retained for thirty days post-submission for quality validation, then nullified via a scheduled cleanup query. The surveyor_assignments table maps surveyors to booth clusters (campaign_id, user_id, constituency_no, booth_numbers as array, assigned_at, deadline). Create Alembic migration `0007_survey_tables` for these tables. Since this migration only adds new tables (no ALTER of existing tables), it follows the existing `CREATE TABLE IF NOT EXISTS` pattern.

Step 1.2: Extend the user role system. The existing users table has a role CHECK constraint limited to 'user' and 'admin'. Rather than altering the CHECK constraint (which requires careful atomic migration), adopt a campaign-scoped assignment model: any authenticated user can be assigned to a campaign as a surveyor or coordinator via the surveyor_assignments table, regardless of their global role. The global role controls platform-level permissions (admin vs user), while campaign-level roles are determined by assignment records. A user who creates a campaign is its coordinator. A user who is assigned booths within a campaign is its surveyor. A user can be a coordinator on one campaign and a surveyor on another. This avoids altering the users table schema and eliminates the single-role limitation the existing CHECK constraint imposes.

Step 1.3: Design the questionnaire schema. Create a questionnaire configuration that maps human-readable questions to prediction factors. The questionnaire has two sections: quantitative factors (mapping directly to the twelve existing V1 sliders) and qualitative factors (eight new factors not in V1). Each question has: id, text, response_type (five_point_scale, numeric, multiple_choice, yes_no), factor_mapping (which prediction factor it maps to), translation_function (how the response value maps to the factor value), help_text, and required flag. The master questionnaire template is stored as a JSON configuration file at `api/factor_data/questionnaire.json`, serving as the single source of truth for question definitions and factor mappings. The `survey_campaigns` table has a `question_subset` JSONB column that stores only the list of question IDs selected for that campaign (not a full questionnaire copy). At render time, the frontend loads the master template and filters to the campaign's selected question subset. This eliminates the two-sources-of-truth problem: definitions live in the static file, selection lives in the database. Campaigns that specify no subset use all questions by default.

Step 1.4: Define the eight new qualitative factors, their translation functions, and orthogonality groupings. The new factors are organized into four composite groups to prevent double-counting correlated sentiments:

**Governance Satisfaction Composite** (two factors, applied as a single combined modifier): welfareSchemeImpact (voter satisfaction with government welfare schemes) and developmentSatisfaction (perception of infrastructure and development). These are correlated — a voter satisfied with welfare is likely satisfied with development. Rather than applying both as independent multiplicative modifiers (which would double-count pro-incumbency sentiment), the engine computes their average as a single governance satisfaction score and applies one pro-incumbency modifier. Questionnaire note: these are presented as separate questions to capture nuance, but combined before factor application.

**Campaign Strength Composite** (two factors, applied as a single combined modifier): candidatePersonalAppeal (personal popularity beyond party) and partyWorkerActivity (visible campaign activity by party workers). These are correlated — a strong candidate typically has active party workers. Combined as a single campaign strength modifier applied to the dominant candidate's vote share.

**Independent Factors** (four factors, applied individually): localIssueSalience (how much a local issue dominates voter thinking — maps to a modifier on anti-incumbency, as local issues typically hurt incumbents), communityConsolidation (degree to which a caste or community is voting as a bloc — maps to a modifier on the dominant party's share), mediaInfluence (degree to which media coverage is shaping voter opinion — maps to a swing modifier toward the media-favored party), and moneyDistributionPerception (perception of vote buying — maps to a pro-incumbent modifier, as the ruling party typically has more resources).

Each factor has a five-point response scale with translation coefficients. These translations are expert-derived heuristic mappings, not empirically calibrated from historical data — the qualitative factors are not present in TCPD. The initial coefficients represent informed starting points that must be refined through backtesting: after one election cycle with survey data, compare survey-informed predictions against actual outcomes and adjust coefficients to minimize prediction error. The plan does not claim calibration precision that does not yet exist.

Step 1.5: Build the survey API endpoints. POST /v1/campaigns creates a campaign. GET /v1/campaigns lists campaigns (filtered by coordinator). GET /v1/campaigns/{id} returns campaign details with summary stats. POST /v1/campaigns/{id}/booths bulk-creates booth definitions. POST /v1/campaigns/{id}/assign assigns booths to surveyors. POST /v1/campaigns/{id}/submissions submits survey responses (accepts batch of booth-level observations). GET /v1/campaigns/{id}/submissions lists submissions with filters. GET /v1/campaigns/{id}/aggregated returns per-constituency aggregated factor profiles (quality-weighted averages of all submissions). GET /v1/campaigns/{id}/export returns raw survey submission data as CSV for offline analysis in statistical software. All endpoints require authentication with campaign-level access control (see Step 1.5b). Apply dedicated rate limiting to survey submission endpoints: ten submissions per minute per user and one hundred submissions per day per user, enforced server-side via a per-user counter in Redis with TTL-based expiry. This prevents automated bulk submission attacks while allowing legitimate surveyor throughput (a surveyor completing one booth every three to six minutes would submit ten to twenty per hour).

Step 1.5b: Implement campaign-level authorization. Create a `require_campaign_access(campaign_id, allowed_roles)` FastAPI dependency following the existing `require_tier` pattern. This dependency verifies that the requesting user satisfies at least one condition: (a) the user created the campaign (coordinator access), (b) the user has an active assignment record in `surveyor_assignments` for the campaign (surveyor access), or (c) the user has the global `admin` role. This is a row-level authorization check — the first such pattern in the codebase. The dependency returns the user's campaign role (coordinator/surveyor/admin) for use in downstream logic. Endpoints enforce role-specific access: coordinators can manage campaigns and view all data, surveyors can only submit to their assigned booths and view their own submissions. Public campaigns (visibility='public') allow read-only access to aggregated results for any authenticated user, but raw submission data remains restricted to campaign participants.

Step 1.6: Implement the submission validation and quality scoring pipeline. When a submission arrives, perform strict JSONB schema validation against the questionnaire configuration: validate that the `raw_responses` object contains only recognized question IDs from the campaign's question subset, that each response value matches the expected type and range for its question (e.g., five-point scale values must be integers 1–5, numeric values must be within the factor's defined range), and reject any submission containing unrecognized keys or malformed values with a 422 response and specific error messages. Use Pydantic model validation with dynamic field constraints derived from the questionnaire JSON — this prevents malformed payloads from reaching the database or corrupting downstream aggregation queries. Compute a quality score based on: completeness (fraction of questions answered), internal consistency (responses that contradict each other reduce the score — e.g., reporting both strong anti-incumbency and high governance satisfaction scores, given these are in the governance composite group), time spent (submissions completed in under thirty seconds are flagged as suspicious), and GPS proximity (if GPS is provided and opt-in, check that the surveyor is within five kilometers of the assigned booth — flag but do not reject if outside range). Store both raw responses and computed factor values.

Step 1.7: Implement conflict detection. When multiple surveyors submit for the same constituency (or booth), compute inter-surveyor agreement metrics. If any factor value differs by more than two standard deviations across surveyors, flag the constituency as "conflicted" and surface it in the campaign dashboard for coordinator review. Provide a resolution interface where the coordinator can choose to use a weighted average, accept one surveyor's data, or mark the factor as uncertain (which widens the error margin for that constituency).

Step 1.8: Build the frontend questionnaire component. Create a SurveyQuestionnaireForm component that renders the questionnaire dynamically from the JSON configuration. Each question renders as an appropriate input (five-point radio buttons, numeric input, multiple choice checkboxes). The form supports constituency-level or booth-level granularity depending on campaign configuration. Include a progress indicator, a confidence rating at the end, and a submit button that validates all required fields before submission. The form must be mobile-optimized — large touch targets, single-column layout, swipeable question navigation.

Step 1.9: Wire the aggregated survey data into the prediction engine. When survey data is available for a constituency, the frontend fetches the aggregated factor profile via GET /v1/campaigns/{id}/aggregated and uses it as the default slider values for that constituency. The user can still manually override any slider. Add a visual indicator in the PredictionPanel showing "Survey-informed" versus "Model default" for each factor, so users know which values come from field data. In both formula mode and ML mode, survey data is integrated consistently as soft evidence that shifts predictions toward survey observations rather than hard-overriding slider defaults. In formula mode, this means survey-derived values become the slider defaults but the error margin narrows proportionally to survey coverage (see Step 3.4), mimicking the Bayesian confidence narrowing used in ML mode. This ensures that a user switching between formula and ML modes sees consistent directional effects from the same survey data.

Step 1.10: Implement file upload security for survey photo evidence. Create a POST /v1/surveys/upload endpoint accepting multipart/form-data with the following security controls: validate MIME type against an allowlist (image/jpeg, image/png only); verify file magic bytes match the declared MIME type (reject files whose headers indicate executable or non-image content); enforce a per-file size limit of 5MB before processing; generate UUID-based filenames to prevent path traversal and information leakage from original filenames; compress images to 500KB maximum via Pillow; store files to the configured storage backend (local filesystem at `api/uploads/` in development, Cloudflare R2 in production). Uploaded files are scoped to the campaign — only users with campaign access (via `require_campaign_access`) can retrieve uploaded photos. The upload endpoint inherits the survey rate limits (ten per minute per user). Photo URLs stored in submission records use signed URLs with twenty-four-hour expiry for R2, or direct paths with authentication middleware for local storage.

Step 1.11: Implement survey methodology controls. To reduce question-ordering bias (a well-documented effect where earlier questions prime responses to later ones), the questionnaire rendering engine randomizes question order within each section (quantitative factors and qualitative factors) on every form load, while keeping sections in a fixed order. The randomization seed is stored with the submission metadata so that question order can be reconstructed for analysis. Additionally, provide an optional surveyor calibration exercise: a set of five standardized scenarios (e.g., "Constituency X had the following characteristics in 2021…") that surveyors rate on the same five-point scales used in the questionnaire. Their calibration responses are compared against known outcomes to compute a personal bias coefficient per surveyor, which is factored into the quality-weighted aggregation (Step 1.7). Calibration is optional for V2.0 but the data structure supports it from launch.

### Phase 2: Campaign Management and Surveyor Dashboard

This phase builds the operational tools for managing field survey campaigns.

Step 2.1: Build the campaign creation UI. A form where coordinators select a state, election type, election year, and campaign name. Upon creation, the system auto-populates constituency data from the existing TCPD database. The coordinator can then define booth clusters by uploading a CSV of booth numbers/names per constituency, or use a default booth numbering scheme.

Step 2.2: Build the surveyor assignment interface. A table showing constituencies and their assigned surveyors. Coordinators can assign individual surveyors to specific booth clusters via a dropdown. Include bulk assignment (assign surveyor X to all booths in constituency Y) and auto-assignment (evenly distribute unassigned booths among available surveyors).

Step 2.3: Build the campaign dashboard. A real-time dashboard (polling every thirty seconds) showing: overall completion percentage, per-constituency completion (color-coded: red for no data, yellow for partial, green for complete), surveyor leaderboard (submissions per surveyor ranked by quality score), conflict rate (percentage of constituencies with inter-surveyor disagreement), and a live activity feed showing recent submissions. The dashboard uses the same Radix UI components as the existing V1 interface.

Step 2.4: Build the surveyor mobile landing page. When a surveyor logs in, they see their assigned campaigns, pending assignments, and submission history. Each assignment links to the questionnaire form for that booth or constituency. Include an offline indicator showing sync status.

Step 2.5: Implement surveyor notification system. When a coordinator assigns new booths, the surveyor receives an in-app notification (badge counter on the survey tab). When a submission is flagged for conflict, the coordinator receives a notification. Use the existing polling mechanism (no WebSocket needed for V2).

Step 2.6: Implement campaign lifecycle management. Campaigns support four statuses: draft (being configured, not accepting submissions), active (accepting submissions), completed (no new submissions, data is read-only for analysis), and archived (data retained but not shown in default campaign lists). When a campaign is archived, survey submissions are preserved in the database but excluded from active queries. Predictions derived from archived campaign data remain valid and reference the archived campaign ID. When a coordinator explicitly deletes a campaign, a confirmation dialog warns that all associated submissions, booth definitions, and assignments will be permanently removed. Deletion is a hard delete with a forty-eight-hour soft-delete grace period (a `deleted_at` timestamp that filters the campaign from queries, with a scheduled job to permanently purge after forty-eight hours). Photo evidence associated with deleted campaigns is purged from object storage during the permanent deletion job.

Step 2.7: Add multi-language support for the questionnaire. The questionnaire JSON configuration includes a `translations` object per question with language keys (en, ta, hi, bn, te, kn, mr) mapping to localized question text and help text. The frontend renders questions in the language selected by the surveyor (defaulting to English). Translation coverage may be partial for V2.0 — untranslated questions fall back to English. The factor mappings and translation functions are language-independent (only the display text varies).

### Phase 3: Booth-Level Disaggregation and New Factor Integration

This phase adds booth-level prediction output and integrates the eight new qualitative factors into the prediction engine.

Step 3.1: Add the eight new qualitative factors to predictionEngine.ts with numerical stability safeguards. Each new factor follows the same multiplicative modifier pattern as the existing twelve factors, but with the composite grouping defined in Step 1.4: the governance satisfaction composite (welfareSchemeImpact + developmentSatisfaction averaged) produces one modifier, the campaign strength composite (candidatePersonalAppeal + partyWorkerActivity averaged) produces one modifier, and the four independent factors produce individual modifiers. This means the engine applies sixteen independent multiplicative modifiers (twelve original plus four effective new modifiers), not twenty. To prevent numerical instability from multiplicative compounding, switch the intermediate computation to log-space: instead of computing $\prod_f (1 + \alpha_f \times x_{c,f})$ directly (which with sixteen factors could theoretically range from $0.5^{16} \approx 0.000015$ to $2.0^{16} \approx 65536$), compute $\exp(\sum_f \log(1 + \alpha_f \times x_{c,f}))$ with the sum clamped to $[\log(0.1), \log(10.0)]$ before exponentiation. This guarantees the combined modifier stays within $[0.1, 10.0]$ regardless of input combinations, and avoids floating-point overflow or underflow. Update the FACTOR_CATALOG, COEFFICIENTS JSON files, and the AppPredictionParams type to include the new factors. Ensure backward compatibility — old bookmarks with only the twelve original factors load correctly with new factors defaulting to zero (producing modifier of 1.0, no effect).

Step 3.2: Implement booth-level proportional disaggregation. This is a one-pass, top-down computation with no circular feedback. The constituency-level prediction is computed first (using survey-aggregated factor values that are set before prediction runs). Then, the constituency-level predicted vote shares are distributed to booths based on booth-level survey profiles. If a booth has survey data indicating Party A is stronger than the constituency average, that booth receives a proportionally larger share of Party A's predicted votes. If no booth-level survey data exists, booths receive equal shares (uniform distribution). Critically, booth-level data does not feed back into constituency-level factor values — the constituency prediction is fixed before disaggregation begins. This eliminates the circularity risk where booth observations would modify the constituency prediction that generated them. The disaggregation must be mathematically consistent: the sum of all booth-level predicted votes for a party must equal the constituency-level predicted votes for that party within rounding tolerance. Label booth-level output as "Estimated distribution (survey-anchored)" not "Prediction" to clearly distinguish between survey reporting (what surveyors observed reflected in the distribution) and model prediction (the constituency-level formula/ML output). Disaggregation is computed per-constituency on drill-down, not for the entire state at once — this keeps computation under 1ms per constituency and avoids the 50–100ms mobile cost of disaggregating all constituencies simultaneously.

Step 3.3: Build the booth-level results view. A constituency drill-down table showing per-booth estimated vote distribution when the user clicks on a constituency in the main results table. Show predicted vote shares per party, survey coverage indicator, and confidence level. Color-code booths by predicted outcome and margin.

Step 3.4: Update the error margin calculation to account for new factors and survey data quality. When survey data informs a constituency's factors, the error margin should narrow (survey intelligence reduces uncertainty). When factors are at model defaults (no survey data), the error margin should be wider. The adjustment formula: when survey data covers more than fifty percent of a constituency's booths, reduce the base error margin by twenty percent (survey confidence bonus).

### Phase 4: Scenario Comparison and Report Generation

Step 4.1: Build the scenario save/load mechanism. Users can save the current prediction configuration (all slider values, alliance config, survey data reference) as a named scenario. Scenarios are stored as JSONB in a new scenarios table (user_id, name, state, config JSONB, created_at). The UI provides a "Save Scenario" button and a "Load Scenario" dropdown.

Step 4.2: Build the scenario comparison view. Select two or three saved scenarios and display them side by side. Show per-party seat counts for each scenario, delta columns highlighting differences, and a list of constituencies that change hands between scenarios. Include a bar chart comparing party seat counts across scenarios.

Step 4.3: Build the PDF report generator. The backend endpoint POST /v1/reports/generate accepts a state, scenario configuration, and optional campaign_id. It generates a PDF using ReportLab containing: an executive summary (state name, election, key predictions), a party-wise seat table with confidence intervals, a constituency table showing predicted winners with margins, a swing analysis section comparing predictions to the previous election, a data provenance section indicating which constituencies are survey-informed versus model-only, and alliance configuration details. The report includes a generation timestamp and a disclaimer. Target generation time: under ten seconds. Reports are cached for one hour and served as downloadable files. To prevent memory pressure from concurrent report generation (ReportLab is synchronous and runs in FastAPI's thread pool), enforce a semaphore limiting concurrent report generation to two simultaneous requests. Additional requests receive a 429 response with a Retry-After header. This prevents a scenario where multiple coordinators requesting reports simultaneously cause memory spikes on Railway's resource-limited containers.

Step 4.4: Build the report request UI. A "Generate Report" button in the prediction results view that opens a modal with options (include/exclude sections, select scenario). Show a loading indicator while the backend generates the PDF. Provide a download link when complete.

### Phase 5: Offline-First Surveyor Experience

Step 5.1: Add service worker configuration and PWA manifest using vite-plugin-pwa. Configure pre-caching for the application shell (HTML, JS, CSS) and runtime caching for API responses (campaign data, questionnaire config). The service worker intercepts fetch requests and serves cached responses when offline. Generate a web app manifest (manifest.json) with proper PWA metadata: name ("Election Intelligence Platform"), short_name ("Elec"), icons (192px and 512px PNG), start_url ("/"), display ("standalone"), theme_color, and background_color. The manifest enables "Add to Home Screen" on mobile devices, providing a dedicated app icon, full-screen experience without browser chrome, and a professional first impression for surveyors who will use the tool daily in the field. This is critical for surveyor adoption — without a manifest, the application cannot be installed as a PWA.

Step 5.2: Implement IndexedDB storage for pending submissions using Dexie.js. When a surveyor submits a questionnaire while offline, the data is stored in IndexedDB with a "pending" status. A sync queue tracks all pending submissions with timestamps.

Step 5.3: Implement background sync. When connectivity is restored, the application processes the sync queue, sending each pending submission to the backend. For iOS Safari (which does not support the Background Sync API), implement application-level connectivity polling using navigator.onLine events and periodic fetch attempts. Show a sync status indicator in the UI: "All synced" (green), "Pending sync: N submissions" (yellow), "Offline" (red).

Step 5.4: Handle sync conflicts. The default policy is to auto-accept all submissions (allow duplicates). If the backend receives multiple submissions for the same booth from different surveyors, all are stored and the aggregation/conflict detection layer (Step 1.7) handles disagreements at the coordinator level. This avoids the problem of showing conflict UI to a surveyor during a background sync when no UI context is available. If the backend rejects a submission for a non-duplicate reason (e.g., the campaign has been completed or the surveyor's assignment was revoked), the failed submission is moved to a "failed" queue in IndexedDB with the rejection reason, and the surveyor is notified on next app foreground.

### Phase 6: ML Completion and Bayesian Survey Integration

Step 6.1: Validate and execute the data science notebook. Before training the model, verify that `datascience/notebooks/08_factor_discovery.ipynb` runs end-to-end without errors. The notebook has not been executed (no cells show output) — this is a prerequisite for any ML deployment. Execute the notebook, verify that all cells produce expected output, and commit the executed notebook with visible output. Then train and export the ONNX model. Execute the existing datascience/notebooks/06_predictive_model.ipynb to train the XGBoost classifier on all available TCPD data. Export the trained model as ONNX to api/models/election_predictor.onnx. Verify ONNX output matches native predictions. Update the MODEL_CARD.md with training metadata, accuracy metrics, training data date range, and feature importance rankings.

Step 6.2: Activate the ML prediction endpoint with model monitoring. The POST /v1/predict/ml skeleton exists — update it to load the actual ONNX model, perform inference, and return predictions with confidence intervals. Add SHAP attribution values to the response (top five contributing factors per constituency). Since SHAP's TreeExplainer requires the native XGBoost model (not the ONNX export), serialize the XGBoost model as a joblib artifact alongside the ONNX model and load it for SHAP computation only. Update the circuit breaker to validate model predictions against known historical outcomes rather than counting failures. Add basic drift detection: track the distribution of model predictions per state over a rolling window, and log a warning if the mean prediction confidence drops below a threshold or the predicted seat distribution changes by more than ten percent between model versions without new training data. This is not a full ML ops pipeline (no automated retraining, no A/B testing between formula and ML) — those are deferred to V3 — but it provides basic model health monitoring beyond the current failure-count circuit breaker.

Step 6.3: Implement Bayesian survey integration consistently across both modes. The Bayesian update applies identically in formula and ML modes — survey data is always treated as soft evidence, never as a hard override. In ML mode, the ML prediction provides the prior mean and variance for each party's vote share, and the survey data provides observed evidence. In formula mode, the formula engine's output provides the prior, and the same conjugate update is applied. The posterior is a weighted combination: $\mu_{post} = (\tau_{prior} \cdot \mu_{prior} + \tau_{survey} \cdot \mu_{survey}) / (\tau_{prior} + \tau_{survey})$, where $\tau = 1/\sigma^2$ is precision. Survey precision increases with the number of submissions and the average quality score. Prior precision is derived from historical model residual variance per state — states where the model has higher historical accuracy get tighter priors. This ensures consistent behavior when users switch between formula and ML modes: the same survey data produces the same directional shift in predictions, differing only in the prior that the survey evidence updates. The error margin in both modes narrows as survey precision increases, providing a unified confidence signal.

Step 6.4: Enable the prediction mode toggle. Remove the "coming soon" label from the ML mode button in PredictionPanel.tsx. When ML mode is selected, fire an API call to POST /v1/predict/ml and display results alongside formula results. Show SHAP attributions in a collapsible section per constituency.

### Phase 7: Geographic Visualization and Advanced Analytics

Step 7.1: Build a constituency-level choropleth using the existing react-simple-maps infrastructure. Since machine-readable constituency GeoJSON boundaries are not freely available for India, use a district-level aggregation approach: display an India map at state level (already implemented in IndiaMap.jsx), and when a state is selected, show a district-level choropleth using available district boundary GeoJSON (freely available from datameet and similar open data projects). Color districts by: predicted winning party (majority of constituency predictions within that district), prediction confidence (average error margin), survey coverage (fraction of constituencies with survey data), or predicted swing (comparison to previous election). Include hover tooltips showing district name, constituent constituencies, and key metrics.

Step 7.2: Build an interactive constituency results heat table. Since per-constituency polygon boundaries are not available, provide a sortable/filterable table with color-coded cells that mimics heat-map visual density. Columns: constituency name, predicted winner, margin, previous winner, swing direction, survey coverage, confidence level. Color the margin column with a gradient (dark red for strong Party A, white for toss-up, dark blue for strong Party B). This provides geographic-pattern-like information in a table format that works on mobile.

Step 7.3: Add a swing analysis chart. For each party, show the distribution of predicted constituency swings as a histogram or box plot. Overlay the previous election's swing distribution for comparison. This helps analysts identify whether the prediction reflects a uniform swing or localized shifts.

Step 7.4: Build a survey coverage map overlay. On the district-level map (or in the constituency heat table), show which areas have survey data and which are model-only. This helps coordinators identify data gaps and deploy surveyors strategically.

### Phase 8: Testing, Performance, and Polish

Step 8.1: Write comprehensive tests for the survey submission pipeline: questionnaire rendering, validation, factor translation, aggregation, conflict detection, and quality scoring.

Step 8.2: Write tests for booth-level disaggregation: mathematical consistency (booth sums equal constituency totals), edge cases (zero survey data, all survey data, single-booth constituencies), and new factor integration (sixteen effective multiplicative modifiers produce valid bounded predictions via log-space computation).

Step 8.3: Performance test the survey dashboard with simulated load using k6 or Locust: fifty concurrent surveyors submitting one thousand booth observations per day. Verify database query performance, aggregation computation time, and dashboard polling response time. Define the test environment: use a PostgreSQL instance seeded with realistic data volume (one thousand booths, ten thousand submissions) to produce representative query times. Capture p95 latency for each endpoint and compare against the targets defined in Section 9.

Step 8.4: End-to-end test the offline workflow using Playwright with `page.context().setOffline(true)`: submit a questionnaire while offline, verify it is stored in IndexedDB via Playwright's `page.evaluate()`, set online, verify the sync completes, and verify the dashboard reflects the new submission. This is an automated test, not a manual verification step.

Step 8.5: Write security-specific test cases: RBAC enforcement (a surveyor assigned to Campaign A cannot read Campaign B's submissions — expect 403), file upload validation (upload a file with .jpg extension but executable magic bytes — expect 422; upload a 10MB file — expect 413), JSONB schema validation (submit a response with an unrecognized question ID — expect 422; submit an out-of-range value — expect 422), rate limiting (submit twelve submissions in one minute — expect the eleventh and twelfth to return 429), and GPS data privacy (verify that GPS columns are nullified for submissions older than thirty days after the cleanup job runs).

Step 8.6: Write Bayesian integration edge case tests: prior variance is zero (model is maximally confident — survey data should have minimal effect, posterior stays near prior), survey variance is zero (division-by-zero guard — treat as very high precision, posterior snaps to survey value), survey data contradicts model by a large margin (posterior should move toward survey but not beyond the survey value), and multi-party constraint (all party posteriors must sum to 100% after updating — verify renormalization). These tests codify the mathematical boundaries of the conjugate update to prevent silent numerical errors.

Step 8.7: Accessibility audit for all new components: questionnaire form, campaign dashboard, scenario comparison, report generation.

Step 8.8: Mobile device testing on iOS Safari and Android Chrome for the surveyor workflow.

Step 8.9: Backward compatibility verification: all V1 bookmarks, slider configurations, and API endpoints work unchanged.

Step 8.10: Database backup configuration. Configure automated daily PostgreSQL backups using Railway's built-in backup feature (available on paid tier) or pg_dump via a scheduled GitHub Action. For survey data collected during election season, data loss would be catastrophic — daily backups with seven-day retention provide adequate recovery capability. Store backup artifacts in Cloudflare R2 (same storage used for photo evidence). Document the recovery procedure: restore from the latest backup, re-run any Alembic migrations if needed, verify data integrity by checking campaign submission counts.

## 8. Implementation Plan Summary

Phase 1 (Survey Questionnaire and Backend): Foundation — new database tables, API endpoints with campaign-level authorization, questionnaire system with JSONB validation and survey methodology controls, factor translation with orthogonality groupings, file upload security, survey data export, and survey-to-prediction wiring with consistent Bayesian-style integration. Highest effort, highest risk. Independently shippable.

Phase 2 (Campaign Management): Operational tools — campaign CRUD with lifecycle management (archive/delete), surveyor assignment, dashboard with thirty-second polling using TTL-only caching (thirty-second TTL, no explicit invalidation — simpler and consistent with the polling interval), mobile surveyor landing page, multi-language questionnaire support. Depends on Phase 1.

Phase 3 (Booth-Level and New Factors): Analytical depth — eight new qualitative factors organized into composite groups with log-space numerical stability, booth disaggregation computed per-constituency on drill-down (one-pass, no circular feedback), booth results view. Depends on Phase 1 for survey data; new factors can proceed independently.

Phase 4 (Scenario Comparison and Reports): Derivative intelligence — scenario save/compare, PDF report generation with ReportLab and concurrent generation semaphore. Depends on Phase 1 prediction integration.

Phase 5 (Offline-First): Field operations — service worker with PWA manifest for installability, IndexedDB via Dexie.js, background sync with iOS fallback, auto-accept conflict resolution. Depends on Phase 1 and Phase 2 for the surveyor workflow.

Phase 6 (ML Completion): Model maturity — notebook validation and execution, ONNX training, SHAP via joblib model, consistent Bayesian survey integration across both modes, basic drift detection. Depends on Phase 1 for survey data API. Note: ships as V2.1, not V2.0 — the critical path delivers V2.0 after Phase 4, with ML completion following.

Phase 7 (Visualization and Analytics): Intelligence presentation — district-level choropleth, constituency heat table, swing analysis, coverage map. Depends on Phases 1-3 for data.

Phase 8 (Testing and Polish): Validation — security test cases, performance benchmarking with k6/Locust, automated offline testing with Playwright, Bayesian edge case tests, accessibility, mobile testing, database backup configuration. Depends on all prior phases.

Critical path for single developer: Phase 1 → Phase 3 (new factors) → Phase 2 → Phase 4 → ship V2.0 → Phase 5 → Phase 6 → Phase 7 → Phase 8. Phases 3, 4, and 6 can begin partially in parallel with Phase 2.

### Explicit V2 Scope Boundaries

The following are explicitly out of scope for V2 to prevent scope creep:

- Real-time WebSocket or SSE dashboard updates (polling at thirty-second intervals is sufficient for V2 traffic levels)
- Automated ML retraining pipeline or A/B testing between formula and ML modes (deferred to V3)
- Social media sentiment integration (X API is paywalled; alternatives provide insufficient granularity)
- Caste/demographic data collection beyond what surveyors report voluntarily (legal consultation required)
- Constituency-level GeoJSON boundary creation (district-level aggregation is the V2 approach; constituency boundaries require commercial data or manual tracing)
- Weather data integration (low predictive value relative to implementation effort)
- Surveyor recruitment, training logistics, and payment processing (operational concerns outside the software scope)
- Mobile native app wrappers (PWA with manifest provides sufficient mobile experience)

### Infrastructure Cost Budget

| Resource | Free Tier | Expected V2 Usage | Paid Tier (if needed) |
|---|---|---|---|
| Railway PostgreSQL | 500MB | 200–400MB/year | $5/month for 5GB |
| Cloudflare R2 (photos) | 10GB storage, 10M reads/month | 5–10GB/year | $0.015/GB/month (~$0.75–$1.50/month) |
| Railway compute | Shared CPU, 512MB RAM | Adequate for <50 concurrent users | $5/month for dedicated |
| Total | $0/month | — | $5–12/month |

### Skill Assessment

The following technologies are required, with learning curve notes for a developer experienced in the existing stack (FastAPI, React, PostgreSQL, Vite):

- **Familiar:** FastAPI API design, PostgreSQL schema with JSONB, Alembic migrations, Pydantic validation, React components, Tailwind CSS, Vitest
- **Moderate learning curve (1–2 days each):** ReportLab PDF generation, Dexie.js IndexedDB wrapper, vite-plugin-pwa service worker configuration, Bayesian conjugate update mathematics
- **Steeper learning curve (3–5 days each):** GeoJSON visualization with react-simple-maps (extending existing IndiaMap.jsx), ONNX model deployment and SHAP integration, Playwright offline testing

Total learning overhead: approximately two weeks, distributed across the phases where each technology is first used.

## 9. Full Test Plan

### Unit Tests

The questionnaire-to-factor translation functions require unit tests verifying that: each question response (on a five-point scale) produces the expected factor value within the valid range; the translation functions handle all response types (five-point scale, numeric, multiple choice, yes/no); missing or invalid responses are handled gracefully (skip the factor or use the default); and the computed factor values for the eight new qualitative factors produce valid multiplicative modifiers when fed into the prediction engine.

The survey aggregation logic requires tests verifying that: quality-weighted averaging produces expected results (higher-quality submissions have more influence); the aggregation handles single-submission constituencies (no averaging needed) and multi-submission constituencies (weighted average); conflict detection correctly flags constituencies where surveyor responses diverge by more than two standard deviations; and the aggregation output has the correct shape for consumption by the prediction engine.

The booth-level disaggregation requires tests verifying that: the sum of booth-level predicted votes for each party equals the constituency-level total within one percentage point; uniform distribution is applied when no booth-level survey data exists; booths with survey data indicating stronger support for a party receive proportionally more of that party's predicted votes; and the disaggregation handles edge cases (single booth, zero votes, all booths surveyed, no booths surveyed).

The eight new factors in predictionEngine.ts require the same unit test coverage as the original twelve: boundary conditions, zero adjustment at default, correct effect direction, log-space clamping, and vote conservation. The composite factor groupings (governance satisfaction, campaign strength) require tests verifying that the average-then-apply behavior produces different results from apply-individually (confirming double-counting prevention). Property-based tests with randomized inputs across all sixteen effective modifiers (twelve original plus four composite/independent new) must verify vote conservation across one thousand random configurations, including extreme inputs where all factors are set to maximum simultaneously.

The scenario comparison logic requires tests verifying that: two scenarios with identical configurations produce identical results; two scenarios with different alliance configs produce different seat counts; and delta metrics correctly identify constituencies that change hands.

The PDF report generator requires tests verifying that: the generated PDF contains all required sections; the party-wise seat table matches the prediction results; the report respects the ten-second generation time target for a full state; and the report includes the correct disclaimer and generation timestamp.

### Integration Tests

The survey submission pipeline requires integration tests verifying: a surveyor can submit a questionnaire via the API; the submission is validated, quality-scored, and stored; the aggregated factor profile reflects the submission; and the prediction engine produces different results when survey data is present versus absent.

The offline sync pipeline requires integration tests verifying: a submission stored in IndexedDB is sent to the backend when connectivity is restored; the backend processes the synced submission correctly; the campaign dashboard reflects the synced data; and sync conflicts are surfaced to the surveyor.

The ML prediction with survey Bayesian updating requires tests verifying: the ML endpoint returns predictions with SHAP attributions; survey data shifts the ML prediction toward the survey values; the shift magnitude is proportional to survey precision (more submissions with higher quality produce larger shifts); the ML prediction remains within valid bounds after Bayesian updating; and the formula-mode Bayesian integration produces the same directional shift as ML mode for the same survey data (consistency across modes). Edge cases: prior variance approaching zero (model is certain — survey should have minimal effect), survey variance approaching zero (guard against division by zero — treat as very high precision), contradictory survey data (posterior moves toward survey but does not overshoot), and multi-party posterior renormalization (posteriors must sum to 100%).

### Security Tests

Campaign-level authorization tests: a surveyor assigned to Campaign A requests Campaign B's submissions via GET /v1/campaigns/B/submissions — expect 403. A coordinator for Campaign A requests Campaign B's submissions — expect 403. An admin requests any campaign's data — expect 200. An unauthenticated request to any campaign endpoint — expect 401.

File upload security tests: upload a valid JPEG — expect 200 and a signed URL. Upload a file with .jpg extension but PNG magic bytes — expect 422 (MIME mismatch). Upload a file with executable headers (ELF or MZ) renamed to .jpg — expect 422. Upload a file exceeding 5MB — expect 413. Upload without campaign access — expect 403.

JSONB schema validation tests: submit a response with a valid question ID and in-range value — expect 200. Submit with an unrecognized question ID — expect 422. Submit with a five-point-scale value of 6 — expect 422. Submit with a string value where numeric is expected — expect 422. Submit an empty observations object — expect 422 (required fields missing).

Rate limiting tests: submit ten valid submissions in sixty seconds — all succeed. Submit the eleventh — expect 429 with Retry-After header. Wait for the rate limit window to expire — next submission succeeds.

GPS data lifecycle tests: submit with GPS coordinates. Query the submission immediately — GPS values present. Run the thirty-day cleanup job. Query submissions older than thirty days — GPS values are null.

### End-to-End Tests

The surveyor workflow test: create a campaign, assign a surveyor, submit a booth-level questionnaire via the mobile UI, verify the submission appears in the campaign dashboard, verify the prediction updates to reflect the survey data, and generate a PDF report that includes the survey-informed predictions.

The scenario comparison test: create two scenarios with different alliance configurations, save both, load the comparison view, verify delta metrics are correct, and verify that swung constituencies are accurately identified.

The offline test: disconnect network, submit a questionnaire, verify it is stored locally, reconnect, verify sync, verify dashboard update.

Backward compatibility: all V1 bookmarks load correctly with new factors defaulting to zero; all V1 API endpoints return unchanged responses; the twelve original factor sliders continue to function identically.

### Performance Tests

Performance tests use k6 (preferred for its scripting flexibility) or Locust, running against a staging environment with a PostgreSQL instance seeded with realistic data: one campaign with one thousand booths, ten thousand submissions across fifty surveyors. The test database should approximate production data volume to produce representative query times.

The survey submission endpoint must handle fifty concurrent surveyors submitting at a rate of one submission per minute, with p95 latency under five hundred milliseconds. The campaign dashboard endpoint must respond in under two seconds for a campaign with one thousand booths and fifty surveyors. The booth-level disaggregation for a constituency with three hundred booths must complete in under five hundred milliseconds (computed client-side, measured via browser performance API in a Playwright test). The PDF report generation for a full state must complete in under ten seconds, with the concurrent generation semaphore limiting to two simultaneous renders. The prediction engine with sixteen effective multiplicative modifiers (twelve original plus four composite/independent new) must update within one hundred fifty milliseconds of a slider adjustment on a mobile device.

### Negative Tests

Submitting a questionnaire with invalid responses (out of range values, wrong types, missing required fields) must be rejected with informative validation errors. Submitting to a campaign the surveyor is not assigned to must return a 403 error. Attempting to create a campaign for a state not in the TCPD database must return a 404. Setting all twenty factors to extreme values simultaneously must produce valid bounded predictions (multiplicative clamping and renormalization must hold).

## 10. How to Execute and Document the Implementation

The implementation should proceed in eight pull requests, one per phase. Each PR should be independently mergeable and deployable. Phase 1 is the largest and may be split into two PRs: one for the database schema and API endpoints, one for the questionnaire frontend and prediction integration.

Each PR should include: a description of what was built, a testing summary, any new environment variables or configuration required, and migration instructions if database changes are involved. The data science PR (Phase 6) should include the executed notebook with visible output, the exported ONNX model, and the updated MODEL_CARD.md.

Rollback: each phase is independent. If Phase 3 (booth disaggregation) causes issues, it can be reverted without affecting Phase 1 (survey backend) or Phase 2 (campaign management). The only hard dependency chain is Phase 1 → Phase 2 → Phase 5 (offline requires the surveyor workflow which requires the campaign backend).

## 11. How to Execute and Document the Tests

Tests should be written alongside implementation in each phase. Phase 1 includes API tests for survey endpoints and unit tests for factor translation. Phase 3 includes prediction engine tests for new factors and disaggregation. Phase 6 includes ML endpoint tests and Bayesian update tests. Phase 8 is a dedicated testing phase for cross-cutting integration tests, performance benchmarks, and the accessibility audit.

Test results should be captured in CI output. A passing suite requires all unit tests pass, all integration tests pass, performance benchmarks meet stated thresholds, and backward compatibility tests confirm no regression. Frontend tests use the existing Vitest infrastructure. Backend tests extend the existing api/tests/ directory.

## 12. Full Document Summary

V2 transforms the election prediction platform from an analyst-facing slider tool into a surveyor-centric intelligence system. The recommended Hybrid Survey-Augmented Engine approach preserves the entire V1 prediction engine while adding six major capability layers: a structured questionnaire with survey methodology controls (randomized question ordering, optional surveyor calibration) that translates field observations into prediction factors, a survey campaign management system with lifecycle management (draft/active/completed/archived/deleted) for coordinating field teams, booth-level prediction disaggregation computed per-constituency on drill-down for operational granularity, a scenario comparison and PDF report generation system with concurrent generation limits for stakeholder communication, offline-first mobile support with PWA manifest for installable field data collection, and consistent Bayesian survey integration across both formula and ML prediction modes.

The eight new qualitative factors are organized into four composite groups (governance satisfaction, campaign strength, and four independents) to prevent double-counting correlated sentiments, with log-space computation ensuring numerical stability across sixteen effective multiplicative modifiers. Factor translations are honestly described as expert-derived heuristic mappings requiring iterative refinement through backtesting, not empirically calibrated coefficients. Booth-level output is clearly labeled as "estimated distribution (survey-anchored)" to distinguish survey reporting from model prediction.

The implementation spans eight phases over approximately four to six months for a single developer, with approximately two weeks of technology learning overhead distributed across phases. The critical path delivers a shippable V2.0 at the end of Phase 4 (survey system, new factors, campaign management, scenario comparison, and reports), with Phases 5-8 (offline, ML completion, visualization, and polish) following as V2.1-V2.3 iterations. Infrastructure costs are budgeted at $5–12/month on paid tiers if survey data volume exceeds free tier limits.

Security is addressed through campaign-level row authorization via `require_campaign_access`, strict JSONB schema validation of survey submissions, file upload security with MIME and magic byte validation, GPS data minimization with opt-in collection and thirty-day retention, dedicated rate limiting for survey endpoints, and comprehensive security test coverage including RBAC, upload validation, and schema enforcement tests.

Key risks and mitigations: the questionnaire-to-factor translation uses expert-derived coefficients requiring backtesting refinement (mitigated by comparing survey-informed predictions against known outcomes for at least one historical election before trusting survey data operationally); survey data fraud from coordinated biased submissions (mitigated by inter-surveyor consistency checks, historical deviation flagging, temporal pattern analysis, and GPS proximity verification — sophisticated fraud requires anomaly detection that exceeds V2 scope); booth-level disaggregation produces proportional allocations rather than true predictions (mitigated by honest labeling and clear confidence indicators); database growth from booth-level survey data may exceed Railway's free tier (mitigated by campaign archival workflows, data lifecycle management, and planned paid tier at $5/month); and offline sync on iOS Safari lacks Background Sync API support (mitigated by application-level connectivity polling and the auto-accept conflict resolution strategy).

Scope creep is controlled by explicit V2 scope boundaries: no WebSocket/SSE real-time updates, no automated ML retraining, no social media sentiment, no caste data collection, no constituency GeoJSON creation, no weather integration, no surveyor recruitment logistics, and no native mobile app wrappers. If development stalls after Phase 2, the delivered product gracefully degrades to an enhanced Approach A — still a significant improvement over V1.

The expected outcome is a platform where fifty surveyors can be deployed across a state, each answering a configurable eight-to-twelve-question mobile questionnaire at booth level, with their responses automatically translating into prediction refinements visible in a real-time campaign dashboard, exportable as raw CSV data or a professional PDF report, and comparable across alternative scenarios. The system predicts with sixteen effective modifiers (twelve quantitative from V1 plus four composite/independent qualitative from V2), provides error margins that narrow as survey coverage increases via Bayesian-style confidence integration, and surfaces geographic patterns through district-level visualization and constituency heat tables.

---

## Appendix: Refinement Notes (Iteration 1)

This appendix documents all changes made during the plan refinement process, organized by the criticism dimension that prompted each change.

### Security (2/5 → Resolved)

1. **File upload security formalized as Step 1.10.** Added dedicated implementation step covering MIME type allowlist, magic byte validation, 5MB size limit, UUID filenames, Pillow compression, signed URLs for R2, and access scoping via `require_campaign_access`. Previously described only in the research document, not in plan steps.

2. **Campaign-level authorization formalized as Step 1.5b.** Created `require_campaign_access(campaign_id, allowed_roles)` dependency specification, following the existing `require_tier` pattern but adding row-level authorization (a new pattern for the codebase). Specifies coordinator/surveyor/admin access rules and public campaign read-only behavior.

3. **GPS data privacy addressed in Step 1.1.** GPS precision limited to NUMERIC(8,5) (~1.1m), collection made opt-in, and thirty-day retention policy with scheduled cleanup added. Prevents the surveillance vector of indefinite timestamped location history.

4. **JSONB schema validation specified in Step 1.6.** Added strict server-side validation using Pydantic with dynamic field constraints from questionnaire JSON — validates question IDs, response types, and ranges. Rejects unrecognized keys and malformed values with 422 responses.

5. **Rate limiting for survey endpoints added to Step 1.5.** Specified ten submissions per minute per user and one hundred per day per user, enforced via Redis counters.

6. **Security test cases added to Phase 8 (Step 8.5) and Section 9.** Added comprehensive security tests covering RBAC enforcement, file upload validation, JSONB schema validation, rate limiting, and GPS data lifecycle.

### Risk Assessment (2/5 → Resolved)

7. **Survey data fraud/tampering identified as a risk.** Added mitigation in the document summary: inter-surveyor consistency checks, historical deviation flagging, temporal pattern analysis, and GPS proximity verification. Acknowledged that sophisticated coordinated fraud requires anomaly detection beyond V2 scope.

8. **Scope creep risk addressed.** Added explicit "V2 Scope Boundaries" section in the Implementation Plan Summary listing twelve items explicitly out of scope. Added graceful degradation note: if development stalls after Phase 2, the product is still a viable enhanced Approach A.

9. **Survey bias validation added.** The refined plan specifies comparing survey-informed predictions against known outcomes for at least one historical election before trusting survey data operationally, in both the factor description (Step 1.4) and the risk mitigations (Section 12).

10. **Operational risk acknowledged.** Surveyor recruitment, training, and payment are explicitly listed as out of scope for V2 (software project, not an operational deployment plan). The software provides the calibration exercise infrastructure (Step 1.11) but does not solve the logistics problem.

### Performance (3/5 → Resolved)

11. **Dashboard cache invalidation clarified.** Specified TTL-only caching with thirty-second TTL in Phase 2 summary. No explicit invalidation — simpler implementation, and the thirty-second polling interval means data is at most sixty seconds stale (one TTL period plus one poll interval).

12. **Numerical stability addressed in Step 3.1.** Switched from direct multiplicative computation to log-space: $\exp(\sum_f \log(1 + \alpha_f \times x_{c,f}))$ with sum clamped to $[\log(0.1), \log(10.0)]$. Guarantees combined modifier stays within $[0.1, 10.0]$ regardless of input combinations.

13. **Concurrent PDF generation semaphore added to Step 4.3.** Limits concurrent ReportLab renders to two via semaphore, returning 429 with Retry-After for excess requests. Prevents memory pressure on Railway's constrained containers.

14. **Booth disaggregation scope clarified in Step 3.2.** Specified per-constituency on drill-down (not whole-state), keeping computation under 1ms per constituency and avoiding 50–100ms mobile cost of full-state disaggregation.

### Approach Validity (3/5 → Resolved)

15. **Factor orthogonality analysis added to Step 1.4.** Grouped correlated factors into composites: governance satisfaction (welfareSchemeImpact + developmentSatisfaction → averaged before applying one modifier) and campaign strength (candidatePersonalAppeal + partyWorkerActivity → averaged before applying one modifier). Reduces effective modifier count from twenty to sixteen and prevents double-counting.

16. **"Calibrated" language replaced with "expert-derived."** Step 1.4 now honestly states that qualitative factor translations are heuristic mappings, not empirically calibrated from historical data. Specifies that backtesting after one election cycle is needed to refine coefficients.

17. **Booth-level prediction vs survey reporting distinction clarified.** Step 3.2 now labels booth output as "Estimated distribution (survey-anchored)" and specifies the one-pass top-down computation with no circular feedback. Section 6 (Recommended Suggestion) adds explicit discussion of the survey reporting vs model prediction distinction.

### Pros/Cons Balance (3/5 → Resolved)

18. **Approach A analysis strengthened.** Replaced dismissive "too thin" assessment with quantified comparison: "Enhanced Approach A covers approximately eighty percent of the value at roughly sixty percent of the effort." Added effort estimate for Approach A (2–3 months). Added comparison table across all three approaches.

19. **Effort estimates compared across approaches.** Added comparative table with estimates: Approach A (2–3 months), Approach B (6+ months engine alone), Approach C (4–6 months).

### Industry Standards (3/5 → Resolved)

20. **Survey methodology controls added as Step 1.11.** Question randomization within sections, stored randomization seed, optional surveyor calibration exercise with personal bias coefficients.

21. **PWA manifest added to Step 5.1.** Specified manifest.json with name, short_name, icons, start_url, display:standalone, theme_color, background_color. Emphasized importance for surveyor adoption and installability.

22. **ML ops basics added to Step 6.2.** Basic drift detection (rolling prediction distribution monitoring, confidence threshold alerting). Full ML ops (automated retraining, A/B testing) explicitly deferred to V3 in scope boundaries.

### Completeness (3/5 → Resolved)

23. **Survey data CSV export added to Step 1.5.** New GET /v1/campaigns/{id}/export endpoint for raw survey data download.

24. **Multi-language support added as Step 2.7.** Questionnaire translations object per question with language keys (en, ta, hi, bn, te, kn, mr). Partial coverage acceptable for V2.0 with English fallback.

25. **Campaign lifecycle management added as Step 2.6.** Four statuses (draft/active/completed/archived), soft-delete with forty-eight-hour grace period, photo purge on permanent deletion.

26. **Database backup added as Step 8.10.** Daily automated backups via Railway or pg_dump GitHub Action, seven-day retention, R2 storage, documented recovery procedure.

### Feasibility (3/5 → Resolved)

27. **Skill assessment added to Implementation Plan Summary.** Categorized technologies as familiar, moderate learning curve (1–2 days), or steeper learning curve (3–5 days). Total learning overhead estimated at two weeks.

28. **Infrastructure cost budget added.** Table showing free tier limits, expected V2 usage, and paid tier costs ($5–12/month total).

### Test Coverage (3/5 → Resolved)

29. **Security test cases added.** Comprehensive security tests in Phase 8 (Step 8.5) and Section 9 covering RBAC, file uploads, JSONB validation, rate limiting, and GPS lifecycle.

30. **Performance test methodology specified.** k6 or Locust against staging with realistic data (1000 booths, 10000 submissions). Browser performance API via Playwright for client-side measurements.

31. **Offline sync test automation specified.** Playwright with `page.context().setOffline(true)` and IndexedDB verification via `page.evaluate()`.

32. **Bayesian math edge cases added to Step 8.6.** Tests for zero prior variance, zero survey variance, large contradictions, and multi-party renormalization.

### Logical Soundness (3/5 → Resolved)

33. **Formula vs ML survey integration made consistent.** Step 1.9 updated to apply survey data as soft evidence in both modes. Step 6.3 specifies identical Bayesian update across formula and ML, differing only in the prior source. Users switching modes see consistent directional effects.

34. **10-question vs 20-factor tension reconciled.** Section 3 success criteria updated: questionnaires are configurable subsets (8–12 questions for booth-level, full twenty for constituency-level). Campaign coordinators select relevant factors. Ten-question default recommended.

35. **Questionnaire source of truth clarified.** Step 1.3 specifies master template in static JSON (definitions) + campaign-level `question_subset` JSONB column (selection only, not a full copy). Single source of truth for definitions, database stores only the selection.

36. **Booth-level feedback circularity eliminated.** Step 3.2 specifies one-pass top-down computation: constituency prediction is fixed before disaggregation begins, booth data does not feed back into constituency factors.

### Codebase Alignment (4/5 — Minor Issues Resolved)

37. **User table migration strategy resolved.** Step 1.2 replaced ALTER TABLE approach with campaign-scoped assignment model: any authenticated user can be assigned to campaigns as surveyor or coordinator via the surveyor_assignments table, without modifying the users table schema or CHECK constraint.

38. **Frontend routing noted.** The routing concern (where survey pages live in the SPA) is acknowledged but deferred to implementation — routing structure follows from the component hierarchy and does not require architectural specification at this level.
