# Prediction Platform V2 — Implementation Phases

**Extracted from:** `_architect/analysis/2026-04-30-prediction-v2.md`
**Date:** 2026-04-30

---

## Phase 1: Survey Questionnaire and Backend Infrastructure (Foundation)
**Effort:** 4-6 weeks | **Dependencies:** None | **Shippable independently**

- Step 1.1: Survey database schema — campaigns, survey_booths, survey_submissions (GPS NUMERIC(8,5), opt-in, 30-day retention), surveyor_assignments. Migration `0007_survey_tables`.
- Step 1.2: Campaign-scoped role model (no ALTER users table). Any user can be coordinator/surveyor via assignment records.
- Step 1.3: Questionnaire schema — master template at `api/factor_data/questionnaire.json`, campaign-specific `question_subset` in DB. Single source of truth.
- Step 1.4: Eight new qualitative factors in 4 orthogonality groups (governance satisfaction composite, campaign strength composite, 4 independent). Expert-derived coefficients with backtesting commitment.
- Step 1.5: Survey API endpoints — campaigns CRUD, booths, assign, submissions, aggregated, export (CSV). Rate limiting: 10/min + 100/day via Redis.
- Step 1.5b: `require_campaign_access(campaign_id, allowed_roles)` — row-level authorization dependency. First such pattern in codebase.
- Step 1.6: JSONB schema validation via Pydantic with dynamic constraints. Quality scoring (completeness, consistency, time, GPS proximity).
- Step 1.7: Conflict detection — 2σ inter-surveyor disagreement flagging. Coordinator resolution UI.
- Step 1.8: SurveyQuestionnaireForm component — dynamic rendering, mobile-optimized, swipeable navigation.
- Step 1.9: Survey→prediction wiring with consistent Bayesian-style integration (soft evidence, not hard override) in both formula and ML modes.
- Step 1.10: File upload security — MIME allowlist, magic bytes, 5MB limit, UUID naming, Pillow compression, Cloudflare R2/local storage, signed URLs.
- Step 1.11: Survey methodology — question order randomization per section, optional surveyor calibration exercise.

## Phase 2: Campaign Management and Surveyor Dashboard
**Effort:** 2-3 weeks | **Dependencies:** Phase 1

- Step 2.1: Campaign creation UI (state, election, year selector)
- Step 2.2: Surveyor assignment interface (bulk + auto-assign)
- Step 2.3: Campaign dashboard — 30s polling, completion %, conflict rate, surveyor leaderboard, activity feed
- Step 2.4: Surveyor mobile landing page (assigned campaigns, pending, history)
- Step 2.5: In-app notification system (polling-based)
- Step 2.6: Campaign lifecycle (draft/active/completed/archived) with 48-hour soft-delete grace period
- Step 2.7: Multi-language questionnaire support (en, ta, hi, bn, te, kn, mr with English fallback)

## Phase 3: Booth-Level Disaggregation and New Factors
**Effort:** 2-3 weeks | **Dependencies:** Phase 1 for survey data; new factors independent

- Step 3.1: 8 new factors in predictionEngine.ts with composite grouping (16 effective modifiers). Log-space computation clamped to [log(0.1), log(10.0)]. Backward compatible.
- Step 3.2: Booth-level proportional disaggregation — one-pass top-down, no circular feedback. Per-constituency on drill-down (<1ms). Labeled "Estimated distribution (survey-anchored)".
- Step 3.3: Booth results drill-down view
- Step 3.4: Error margin narrowing with survey coverage (20% reduction at >50% booth coverage)

## Phase 4: Scenario Comparison and Report Generation
**Effort:** 2-3 weeks | **Dependencies:** Phase 1

- Step 4.1: Scenario save/load (scenarios table with JSONB config)
- Step 4.2: Side-by-side scenario comparison view with delta metrics
- Step 4.3: PDF report generator (ReportLab, <10s, semaphore max 2 concurrent, 1h cache)
- Step 4.4: Report request UI with section selection modal

**→ Ship V2.0 after Phase 4**

## Phase 5: Offline-First Surveyor Experience
**Effort:** 2-3 weeks | **Dependencies:** Phases 1 + 2

- Step 5.1: vite-plugin-pwa + manifest.json (installable PWA)
- Step 5.2: IndexedDB via Dexie.js for pending submissions
- Step 5.3: Background sync with iOS Safari fallback (navigator.onLine polling)
- Step 5.4: Auto-accept duplicate submissions, coordinator-level conflict resolution

## Phase 6: ML Completion and Bayesian Integration
**Effort:** 2-3 weeks | **Dependencies:** Phase 1

- Step 6.1: Validate and execute notebooks (08_factor_discovery, 06_predictive_model). Train ONNX. Update MODEL_CARD.md.
- Step 6.2: Activate POST /v1/predict/ml with SHAP (via joblib XGBoost model). Basic drift detection.
- Step 6.3: Bayesian survey integration — consistent conjugate update in both formula and ML modes.
- Step 6.4: Enable prediction mode toggle (remove "coming soon")

## Phase 7: Geographic Visualization and Advanced Analytics
**Effort:** 2-3 weeks | **Dependencies:** Phases 1-3

- Step 7.1: District-level choropleth (react-simple-maps + datameet GeoJSON)
- Step 7.2: Constituency heat table with color-coded margins
- Step 7.3: Swing analysis histogram/box plots
- Step 7.4: Survey coverage map overlay

## Phase 8: Testing, Performance, and Polish
**Effort:** 2-3 weeks | **Dependencies:** All

- Steps 8.1-8.2: Survey pipeline + booth disaggregation tests
- Step 8.3: Performance benchmarks (k6/Locust, 50 concurrent surveyors, p95 targets)
- Step 8.4: Automated offline testing (Playwright setOffline)
- Step 8.5: Security test cases (RBAC, uploads, JSONB, rate limits, GPS privacy)
- Step 8.6: Bayesian edge case tests (zero variance, contradictions, renormalization)
- Step 8.7-8.8: Accessibility + mobile device testing
- Step 8.9: Backward compatibility
- Step 8.10: Database backup (daily pg_dump to R2, 7-day retention)

## Critical Path (Single Developer)
Phase 1 → Phase 3 → Phase 2 → Phase 4 → **Ship V2.0** → Phase 5 → Phase 6 → Phase 7 → Phase 8

**Total estimated timeline:** 18-27 weeks (4.5-6.75 months)
**V2.0 delivery (Phases 1-4):** 10-15 weeks
