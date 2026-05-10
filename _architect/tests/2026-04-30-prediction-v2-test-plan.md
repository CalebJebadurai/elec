# Prediction Platform V2 — Test Plan

**Extracted from:** `_architect/analysis/2026-04-30-prediction-v2.md`
**Date:** 2026-04-30

---

## Unit Tests

### Questionnaire-to-Factor Translation
- Each 5-point response produces expected factor value within valid range
- All response types handled (5-point scale, numeric, multiple choice, yes/no)
- Missing/invalid responses handled gracefully (skip or default)
- Composite factors (governance satisfaction, campaign strength) average correctly

### Survey Aggregation
- Quality-weighted averaging produces expected results
- Single-submission constituencies (no averaging needed)
- Multi-submission constituencies (weighted average)
- Conflict detection: flags when responses diverge >2σ

### Booth-Level Disaggregation
- Sum of booth-level votes = constituency total (within 1pp)
- Uniform distribution when no booth survey data
- Proportional allocation when survey data present
- Edge cases: single booth, zero votes, all/no booths surveyed

### 20-Factor Prediction Engine (12 original + 8 new)
- Boundary conditions (min/max slider values)
- Zero adjustment at default value
- Correct effect direction per factor
- Log-space clamping [log(0.1), log(10.0)] prevents overflow
- Vote conservation: property-based tests (1000+ random configs)

### Scenario Comparison
- Identical configs → identical results
- Different alliance configs → different seat counts
- Delta metrics correctly identify swung constituencies

### PDF Report Generator
- All required sections present
- Party-wise seat table matches prediction results
- Generation time <10s for full state
- Disclaimer and timestamp included

## Security Tests
- **RBAC**: Surveyor for Campaign A cannot read Campaign B data (expect 403)
- **File upload**: .jpg with executable magic bytes rejected (expect 422); 10MB file rejected (expect 413)
- **JSONB validation**: Unrecognized question ID rejected (422); out-of-range value rejected (422)
- **Rate limiting**: 12 submissions in 1 minute → 11th and 12th return 429
- **GPS privacy**: GPS columns nullified for submissions >30 days old after cleanup job

## Bayesian Integration Edge Cases
- Prior variance = 0 (model maximally confident) → survey has minimal effect
- Survey variance = 0 → division-by-zero guard → posterior snaps to survey value
- Survey contradicts model by large margin → posterior moves toward survey, not beyond
- Multi-party constraint: all posteriors sum to 100% after updating (renormalization)

## Integration Tests

### Survey Submission Pipeline
- Submit questionnaire via API → validated, quality-scored, stored
- Aggregated factor profile reflects submission
- Prediction engine produces different results with vs without survey data

### Offline Sync Pipeline
- Submission stored in IndexedDB → sent on connectivity restore
- Backend processes synced submission correctly
- Dashboard reflects synced data
- Sync conflicts surfaced to surveyor

### ML + Survey Bayesian
- ML endpoint returns predictions with SHAP attributions
- Survey data shifts ML prediction toward survey values
- Shift magnitude proportional to survey precision
- ML prediction remains within valid bounds after updating

## End-to-End Tests

### Surveyor Workflow
- Create campaign → assign surveyor → submit questionnaire → appears in dashboard → prediction updates → generate PDF report

### Scenario Comparison
- Create 2 scenarios with different alliances → save both → compare → deltas correct → swung constituencies identified

### Offline Workflow (Playwright with `page.context().setOffline(true)`)
- Disconnect → submit questionnaire → stored in IndexedDB → reconnect → sync → dashboard updates

### Backward Compatibility
- V1 bookmarks load (12 original factors default to zero, 8 new factors default to zero)
- V1 API endpoints return unchanged responses
- 12 original factor sliders function identically

## Performance Tests (k6/Locust)
- Survey submission: p95 <500ms, 50 concurrent surveyors, 1 sub/min
- Campaign dashboard: <2s for 1000 booths / 50 surveyors
- Booth disaggregation: <500ms per constituency (300 booths)
- PDF report: <10s for full state
- 20-factor prediction engine: <150ms per slider adjustment on mobile
- Test environment: PostgreSQL seeded with 1000 booths, 10000 submissions

## Negative Tests
- Invalid questionnaire responses (out of range, wrong types, missing required) → 422
- Submit to unassigned campaign → 403
- Create campaign for non-TCPD state → 404
- All 20 factors at extreme values → valid bounded predictions (log-space clamping)

## Accessibility
- All sliders keyboard-operable (Tab, Arrow keys)
- Questionnaire navigable via keyboard
- Campaign dashboard screen reader compatible
- ARIA attributes on all interactive elements
- Dynamic updates use aria-live regions
