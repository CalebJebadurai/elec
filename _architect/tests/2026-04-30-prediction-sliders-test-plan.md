# Multi-Factor Election Prediction Slider System — Test Plan

**Extracted from:** `_architect/analysis/2026-04-30-prediction-sliders.md`
**Date:** 2026-04-30

---

## Unit Tests

### Factor Formula Tests (predictionEngine.ts)
- Each formula produces expected vote share adjustment for known inputs
- Boundary conditions (min/max slider values) produce valid results
- Zero adjustment when slider is at default value
- Effect direction matches expectations (higher incumbency fatigue → higher anti-incumbency swing)

### ML Endpoint Tests (api/tests/)
- Valid JSON response with expected schema
- Rejects out-of-range slider values with 422 (Pydantic validation)
- Rejects NaN and Infinity values
- Confidence intervals widen when sliders deviate from defaults
- Consistent results for repeated identical inputs

### Factor Metadata Tests
- All 12-15 factors returned with complete metadata
- Default values within stated ranges
- State-specific defaults differ from national defaults where expected

## Negative Tests
- All anti-incumbency sliders at maximum: valid bounded vote shares (clamping + renormalization)
- Conflicting slider combinations: widened error margins, no crashes
- Unknown state for ML: clear error indicating formula-only availability
- Invalid types (strings instead of numbers): rejected by Pydantic validation

## Coefficient Correctness Tests
- Known constituency-factor-value tuples from notebook validation set
- Run through both notebook prediction code and frontend formula engine
- Predicted vote shares match within 0.5 percentage points

## Vote Conservation Property Tests
- Property-based testing (fast-check or equivalent)
- 1000+ random slider configurations
- Vote shares sum to 1.0 (within 1e-6 tolerance)
- Total predicted votes ≤ valid votes
- Covers all-minimum, all-maximum, and random combinations

## Alliance Arithmetic Tests
- Alliance formation increases stronger party's vote share proportionally
- Alliance breaking decreases previously-stronger party's share
- Alliance logic preserves vote conservation
- Efficiency factor clamps at boundary values (0% and 100%)

## Integration Tests

### Formula Pipeline
- Single slider adjustment produces different prediction from baseline
- All sliders at defaults match historical baseline within tolerance
- Vote conservation across all states in dataset

### ML Pipeline
- Full slider payload accepted, constituency-level predictions returned
- State-specific predictions (different states → different results)
- Confidence intervals returned for every constituency
- SHAP attributions returned per constituency
- Circuit-breaker fires for egregiously wrong historical predictions

## End-to-End Tests

### Backward Compatibility
- Old 3-parameter bookmarks load correctly
- Old bookmark predictions match previous behavior within 1 seat
- Malicious bookmark JSONB payloads rejected gracefully

### User Workflows
- Select state → adjust sliders → see updated predictions
- Switch between Formula and ML modes
- Error margins displayed and responsive to slider changes
- Alliance configuration produces visible prediction changes
- Survey data import populates slider overrides correctly

### Accessibility
- All sliders keyboard-operable (Tab focus, Arrow keys adjust)
- Alliance UI navigable without mouse (Space for checkboxes, Tab for blocs)
- ARIA attributes: aria-label, aria-valuemin, aria-valuemax, aria-valuenow, aria-valuetext
- Prediction mode toggle announced by screen readers
- Dynamic updates use aria-live regions

## Performance Tests
- ML endpoint: p95 < 3s, 10 concurrent users, k6/locust
- Formula engine: < 100ms per slider adjustment on mid-range mobile
- Factor metadata endpoint: < 500ms
- Report p50, p95, p99 latencies

## Regression Tests
- Existing prediction functionality (anti-incumbency, turnout, new party) unchanged
- Existing slider UI functional
- Existing API endpoints unaffected
