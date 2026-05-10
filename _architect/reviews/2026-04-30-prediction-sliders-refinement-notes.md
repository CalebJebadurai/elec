# Refinement Notes: Multi-Factor Election Prediction Slider System

**Date:** 2026-04-30
**Planner:** GitHub Copilot (Planner Subagent)
**Iteration:** 1
**Prior Score:** 31/55

---

## Refinement Summary

The most significant changes, categorized by the criticism dimension that prompted them:

### Scope and Feasibility (from Completeness 2/5, Feasibility 2/5)
- Reduced initial factor scope from 25 to 12-15 factors with ≥90% data availability
- Acknowledged single-developer reality and restructured phasing so formula-only is a shippable milestone
- Added realistic 6-10 week Phase 1 effort estimate
- Added fallback accuracy targets (65% minimum, below which ML is disabled per state)

### Critical Missing Features (from Completeness 2/5)
- Added concrete alliance modeling: data curation (Phase 1), formula logic (Phase 3), and UI (Phase 4)
- Added survey data import mechanism (CSV/JSON upload)
- Specified analytic variance propagation for aggregate seat uncertainty
- Explicitly scoped GE to deferred phase with rationale; added GA dataset investigation step

### Security Hardening (from Security 3/5)
- Mandated ONNX format, explicitly forbidden pickle/joblib
- Added Pydantic Field constraints for all slider inputs
- Added ML-specific rate limiting (20 req/60s vs global 100)
- Added bookmark deserialization validation

### Performance Specification (from Performance 3/5)
- Rejected bootstrap CI in favor of analytic quantile predictions
- Added bucketed caching with slider quantization
- Specified batch query strategy for feature assembly
- Added React.memo and useTransition for mobile rendering

### Model Governance and Standards (from Industry Standards 3/5, Risk Assessment 2/5)
- Added model_metadata table for versioning with rollback
- Added SHAP feature attributions in ML endpoint response
- Added fairness assessment (Phase 1, Step 1.8)
- Added circuit-breaker pattern for bad model detection
- Added model retraining schedule
- Added prediction disclaimers

### Formula Mechanics (from Approach Validity 3/5, Logical Soundness 3/5)
- Defined multiplicative clamping to [0.5, 2.0] to prevent explosion
- Defined canonical three-level factor ordering (state → constituency → candidate)
- Resolved candidate-vs-constituency factor granularity with "impact severity" vs "value override" distinction
- Separated formula and ML accuracy expectations
- Defined three types of "default value" explicitly
- Deferred blended mode to validation-dependent inclusion

### Test Coverage (from Test Coverage 3/5)
- Added negative tests, coefficient correctness tests, vote conservation property tests
- Added alliance arithmetic tests
- Added frontend test infrastructure setup (Vitest)
- Specified performance test methodology (p95, concurrent users, tooling)

### Codebase Alignment (from Codebase Alignment 3/5)
- Changed to unversioned API paths matching existing conventions
- Clarified route file organization (existing endpoint stays in routes.py)

---

## Resolved Critical Weaknesses

| # | Weakness | Resolution |
|---|----------|------------|
| 1 | Alliance modeling punted entirely | Concrete 3-step approach: data curation, formula logic, UI |
| 2 | Phase 1 underestimated, 25 factors too many | 6-10 week estimate, reduced to 12-15 factors |
| 3 | Single developer, phases can't parallelize | Serial critical path acknowledged, formula-only milestone |
| 4 | Mitigations vague, missing risks | Every risk operationalized; model drift, user misinterpretation, baseline disagreement added |
| 5 | Pickle deserialization risk | ONNX mandated, pickle forbidden |
| 6 | Input validation unspecified | Pydantic Field constraints for every parameter |
| 7 | Bootstrap CI latency bomb | Analytic quantile predictions mandated |
| 8 | Blended mode undefined | Deferred to validation-dependent inclusion |
| 9 | 25 features overfitting risk | 12-15 features, fallback to 8-10 if overfit detected |
| 10 | Success criteria tension | Formula and ML accuracy targets separated |
| 11 | "Normalized default" undefined | Three explicit default types defined |
| 12 | Candidate-vs-constituency granularity unresolved | Impact severity vs value override distinction |
| 13 | No model governance | model_metadata table, versioning, rollback |
| 14 | No SHAP explainability | Top-5 SHAP attributions in ML endpoint |
| 15 | API versioning inconsistency | Unversioned paths matching existing convention |
| 16 | No negative tests | Comprehensive negative test section added |
| 17 | No vote conservation property tests | Property-based testing with fast-check |
| 18 | No frontend test infrastructure | Vitest setup as Phase 3 prerequisite |

---

*Refinement notes saved — Iteration 1*

---

## Iteration 2

**Date:** 2026-04-30
**Prior Score:** 44/55

### Refinement Summary

Iteration 2 is a focused correction round addressing one critical weakness (API versioning convention) and five minor issues identified by the critic. No structural changes to the plan — the improvements are localized fixes to specific passages.

### Resolved Critical Weakness

| # | Weakness | Dimension | Resolution |
|---|----------|-----------|------------|
| 1 | API routes use unversioned paths but codebase uses `/v1/` as primary convention | Codebase Alignment (3/5) | All endpoints corrected to `/v1/` prefix (`/v1/factors`, `/v1/predict/ml`, `/v1/predict/model-health`). Phase 2 intro paragraph rewritten to reference the `v1 = APIRouter(prefix="/v1")` pattern from `main.py` lines 549-569, with dual-registration under both `v1` and app-level routers matching the existing pattern for all route modules. |

### Resolved Important Issues

| # | Issue | Dimension | Resolution |
|---|-------|-----------|------------|
| 1 | Alliance UI says "drag-and-drop or checkbox-based" without resolving | Completeness | Committed to checkbox-based as the primary interaction pattern (mobile-first, touch-accessible, simpler). Alliance configuration is now a separate section from New Party, not an extension of it. ARIA attributes specified for alliance UI elements. |
| 2 | Circuit-breaker uses fixed 15-seat threshold, too generous for small states | Risk Assessment | Changed to percentage-based: ten percent of total constituencies. This gives four seats for Goa (40 constituencies) and forty seats for UP (403 constituencies). |
| 3 | No ONNX export verification step | Risk Assessment | Added verification in Phase 1, Step 1.6: after ONNX export, compare predictions against native library on full validation set within 1e-6 tolerance. Includes fallback (simplify model architecture) if ONNX export fails. |
| 4 | Coefficient JSON schema undefined | Completeness | Defined schema in Phase 1, Step 1.9: `{ "_national": { "<factor>": <coefficient> }, "<state>": { "<factor>": <coefficient> } }`. Each coefficient is a float representing marginal effect of one-unit normalized factor change on vote share. |
| 5 | No accessibility testing | Test Coverage | Added accessibility test section covering keyboard navigation (Tab, Arrow keys, Space), ARIA attributes for sliders (`aria-label`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-valuetext`), screen reader compatibility, and `aria-live` regions for dynamic updates. |

### Resolved Minor Issues

| # | Issue | Dimension | Resolution |
|---|-------|-----------|------------|
| 1 | Frontend test setup from scratch despite existing infrastructure | Codebase Alignment | Phase 3, Step 3.7 now references existing Vitest config and test files (`predictionEngine.test.ts`, `api.test.ts`). |
| 2 | "Knowledgeable user" accuracy target unmeasurable | Logical Soundness | Replaced with backtesting scenario: set sliders to match actual ground truth for held-out year, verify ≥70% winner accuracy. |

### Acknowledged But Deferred

| # | Issue | Rationale |
|---|-------|-----------|
| 1 | Phase 1 time-boxing discipline mechanism | Valid concern but operational, not plan-level. Developer can self-impose during execution. |
| 2 | ONNX runtime memory budget | Noted as valid by the critic ("minor operational concern"). Memory constraints will be evaluated during Phase 2 implementation when the actual model size is known from Phase 1 output. |
| 3 | Cross-level ordering effect empirical test | Valid but the clamping bounds [0.5, 2.0] with renormalization provide mathematical bounds on the maximum ordering effect. Can be verified during Phase 5 validation. |
| 4 | CSV upload max file size and plain-text parsing | Minor security hardening; will be specified during Phase 4 implementation as a standard file upload validation pattern. |
| 5 | Formula proportional swing model citation | The formulation is a novel extension of established proportional swing methodology; this is acknowledged in the plan and will be validated empirically during Phase 1. |

---

*Refinement notes updated — Iteration 2*
