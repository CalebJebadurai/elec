# Multi-Factor Election Prediction Slider System — Implementation Phases

**Extracted from:** `_architect/analysis/2026-04-30-prediction-sliders.md`
**Date:** 2026-04-30

---

## Phase 1: Data Science Research and Factor Discovery (Foundation)

**Effort:** 6-10 weeks | **Dependencies:** None | **Deliverable:** Factor catalog, coefficients JSON, ONNX model, SHAP values, fairness report

- Step 1.1: Load and profile all three TCPD datasets (AE, GE, GA). Compute completeness matrices. Investigate GA dataset utility.
- Step 1.2: Engineer 12-15 candidate features with ≥90% data availability post-2000. Compute SHAP importance and effect sizes.
- Step 1.3: Document factor catalog with granularity levels, ranges, defaults, and expected effects.
- Step 1.4: Curate alliance configuration data for 10 major states across last 3 election cycles.
- Step 1.5: Derive formula coefficients via multivariate regression with LASSO/Ridge regularization. State-specific + national fallback.
- Step 1.6: Train ensemble ML models. Temporal cross-validation on 2016 and 2021 holdouts. Export as ONNX (pickle forbidden). Verify ONNX output matches native within 1e-6.
- Step 1.7: Compute error margin parameters via analytic standard errors and quantile predictions. Pre-compute constituency correlation structure.
- Step 1.8: Fairness assessment for SC/ST reserved seats and female candidates. 2pp bias threshold.
- Step 1.9: Produce comprehensive Jupyter notebook. Export coefficients as JSON (schema: `{ "_national": {...}, "<state>": {...} }`).

## Phase 2: Backend API Development

**Effort:** Moderate | **Dependencies:** Phase 1 model artifacts | **Deliverable:** Factor metadata + ML prediction endpoints

- Step 2.1: Create factor_routes.py with GET /v1/factors and GET /v1/factors/{state}. Dual-registration under v1 and app routers.
- Step 2.2: Define Pydantic request/response models with Field(ge=, le=) constraints for every slider.
- Step 2.3: Create prediction_routes.py with POST /v1/predict/ml. ONNX inference, SHAP top-5 attributions, batch SQL query, 24h cache, 20 req/60s rate limit.
- Step 2.4: Analytic error margin computation: model uncertainty + data quality penalty + slider divergence penalty.
- Step 2.5: Lazy ONNX model loading. model_metadata table for versioning. GET /v1/predict/model-health endpoint.
- Step 2.6: Circuit-breaker: 10% of state constituencies deviation threshold. Percentage-based scaling.
- Step 2.7: Bucketed caching with slider quantization to nearest 5pp. Default predictions pre-computed.
- Step 2.8: Database migrations for model_metadata table.
- Step 2.9: Bookmark deserialization hardening.

## Phase 3: Frontend Formula Engine Extension

**Effort:** Moderate | **Dependencies:** Phase 1 coefficients | **Deliverable:** Multi-factor formula predictions (shippable milestone with Phase 1)

- Step 3.1: Extend AppPredictionParams with 12-15 slider fields. Backward-compatible defaults.
- Step 3.2: Create factor configuration module loading Phase 1 JSON export.
- Step 3.3: Define candidate-level vs constituency-level factor mapping. Impact sliders vs value overrides.
- Step 3.4: Refactor predictionEngine.ts: multiplicative proportional swing, clamping [0.5, 2.0], renormalization.
- Step 3.5: Alliance configuration logic with vote transfer efficiency.
- Step 3.6: Error margin estimation from variance parameters.
- Step 3.7: Unit tests extending existing predictionEngine.test.ts. Property-based vote conservation tests.

## Phase 4: Frontend UI — Slider Panel and Alliance Configuration

**Effort:** Moderate | **Dependencies:** Phase 3, partially Phase 2 | **Deliverable:** Interactive slider UI

- Step 4.1: Extend PredictionPanel.tsx with collapsible factor category sections.
- Step 4.2: Build FactorSlider component with default indicator, tooltip, reset button.
- Step 4.3: Error margin display: seat count ranges, per-constituency indicators, extrapolation warnings.
- Step 4.4: Alliance configuration UI: checkbox-based, ARIA attributes, separate from New Party section.
- Step 4.5: Survey data import via CSV/JSON upload.
- Step 4.6: Prediction mode toggle: Formula / ML. Divergence indicator at 5+ seat difference.
- Step 4.7: Prediction disclaimer.
- Step 4.8: Mobile-responsive layout with React.memo and useTransition.

## Phase 5: Integration, Testing, and Validation

**Effort:** Moderate | **Dependencies:** All prior phases | **Deliverable:** Validated, production-ready system

- Step 5.1: Full pipeline integration tests.
- Step 5.2: Multi-year holdout validation (2016 + 2021). Per-state accuracy documentation.
- Step 5.3: Baseline alignment: formula/ML agree within 5 seats at defaults.
- Step 5.4: Performance benchmarks: p95 < 3s, 10 concurrent users, k6/locust.
- Step 5.5: Backward compatibility: old bookmarks produce same predictions within 1 seat.
- Step 5.6: Evaluate blended mode. Add only if it outperforms both individual modes.
- Step 5.7: Factor catalog documentation and ML model card.
- Step 5.8: Model retraining schedule: within 30 days of each major election.

## Critical Path (Single Developer)

Phase 1 → Phase 3 → Phase 4 (formula UI) → **Ship formula-only release** → Phase 2 → Phase 4 (ML integration) → Phase 5
