# Refinement Notes: Prediction Platform V2

**Date:** 2026-04-30
**Document:** `_architect/analysis/2026-04-30-prediction-v2.md`

---

## Iteration 1

**Critic Score:** 29/55
**Dimensions Addressed:** All 11 (Security 2/5, Risk Assessment 2/5, Performance 3/5, Approach Validity 3/5, Pros/Cons 3/5, Industry Standards 3/5, Completeness 3/5, Feasibility 3/5, Test Coverage 3/5, Logical Soundness 3/5, Codebase Alignment 4/5)
**Total Resolutions:** 38 items (10 critical, 22 important, 6 minor)

### Critical Resolutions (Security + Risk Assessment)

| # | Dimension | Issue | Resolution |
|---|-----------|-------|------------|
| 1 | Security | File upload security not in plan steps | Added Step 1.10 with MIME validation, magic bytes, size limits, UUID naming, Pillow compression, signed URLs, access scoping |
| 2 | Security | Campaign-level authorization not formalized | Added Step 1.5b defining `require_campaign_access` dependency with row-level authorization |
| 3 | Security | GPS data privacy unaddressed | Updated Step 1.1: NUMERIC(8,5) precision, opt-in collection, 30-day retention with scheduled cleanup |
| 4 | Security | JSONB schema validation unspecified | Updated Step 1.6: strict Pydantic validation with dynamic field constraints from questionnaire JSON |
| 5 | Security | Rate limiting for survey endpoints missing | Updated Step 1.5: 10/minute and 100/day per user via Redis counters |
| 6 | Security | Photo storage security unaddressed | Covered in Step 1.10 (signed URLs, authenticated access, campaign scoping) |
| 7 | Risk | Survey data fraud not identified | Added as key risk with multi-layer mitigation (consistency, deviation, temporal, GPS checks) |
| 8 | Risk | Scope creep not addressed | Added explicit V2 Scope Boundaries section (12 items out of scope) |
| 9 | Risk | Survey bias validation missing | Added backtesting requirement in Step 1.4 and Section 12 |
| 10 | Risk | Operational risk not discussed | Acknowledged as out of scope; calibration infrastructure provided in Step 1.11 |

### Important Resolutions

| # | Dimension | Issue | Resolution |
|---|-----------|-------|------------|
| 11 | Performance | Cache invalidation unclear | Specified TTL-only (30s) in Phase 2 summary |
| 12 | Performance | Numerical stability with 20 factors | Log-space computation in Step 3.1, clamped to [0.1, 10.0] |
| 13 | Performance | Concurrent PDF semaphore missing | Semaphore (limit 2) in Step 4.3 with 429 response |
| 14 | Performance | Booth disaggregation scope unclear | Per-constituency on drill-down in Step 3.2 |
| 15 | Approach | Factor orthogonality / double-counting | Composite groups in Step 1.4 (governance, campaign strength) |
| 16 | Approach | "Calibrated" misleading | Replaced with "expert-derived heuristic mappings" |
| 17 | Approach | Booth predictions are survey reflections | Clarified as "Estimated distribution (survey-anchored)", one-pass |
| 18 | Pros/Cons | Approach A dismissed too quickly | Quantified: 80% value at 60% effort, added comparison table |
| 19 | Pros/Cons | No effort comparison | Added effort estimates for all three approaches |
| 20 | Industry | No survey methodology | Added Step 1.11 (randomization, calibration exercise) |
| 21 | Industry | Missing PWA manifest | Added to Step 5.1 with full manifest specification |
| 22 | Industry | ML ops gaps | Basic drift detection in Step 6.2; full ML ops deferred to V3 |
| 23 | Completeness | Missing data export | GET /v1/campaigns/{id}/export in Step 1.5 |
| 24 | Completeness | Multi-language not addressed | Step 2.7 with translations object and language fallback |
| 25 | Completeness | Campaign lifecycle missing | Step 2.6 with four statuses and soft-delete |
| 26 | Completeness | Data backup missing | Step 8.10 with daily backups and recovery procedure |
| 27 | Feasibility | Skill breadth not assessed | Skill assessment table in Section 8 |
| 28 | Feasibility | Infrastructure costs not budgeted | Cost budget table in Section 8 |
| 29 | Test Coverage | No security test cases | Step 8.5 and Section 9 security tests |
| 30 | Test Coverage | Performance methodology unspecified | k6/Locust with realistic data seeding |
| 31 | Test Coverage | Offline test automation unspecified | Playwright with setOffline(true) |
| 32 | Test Coverage | Bayesian edge cases missing | Step 8.6 with zero-variance guards and renormalization |
| 33 | Logical | Formula vs ML integration inconsistent | Consistent Bayesian update in both modes (Steps 1.9, 6.3) |
| 34 | Logical | 10-question vs 20-factor tension | Configurable question subsets per campaign |
| 35 | Logical | Two sources of truth for questionnaire | Master template (static) + question subset (DB selection only) |
| 36 | Logical | Booth-level upward feedback circularity | One-pass top-down computation, no circular feedback |

### Minor Resolutions

| # | Dimension | Issue | Resolution |
|---|-----------|-------|------------|
| 37 | Codebase | User table migration strategy | Campaign-scoped assignment model, no ALTER TABLE |
| 38 | Codebase | Frontend routing structure | Acknowledged, deferred to implementation |
