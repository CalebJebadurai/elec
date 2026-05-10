# Election Prediction Model Card

**Model Name:** election_predictor  
**Version:** 1.0.0  
**Date:** 2026-04-30  
**Format:** ONNX  

---

## Model Description

XGBoost-based binary classifier predicting whether an incumbent party retains a constituency seat in Indian state assembly elections. The model uses 12 engineered features derived from TCPD (Trivedi Centre for Political Data) Assembly Election datasets.

## Intended Use

- **Primary:** Server-side ML predictions via the `/v1/predict/ml` API endpoint
- **Secondary:** Comparison against client-side formula-based predictions
- **Not intended for:** Forecasting actual election outcomes, betting, or any decision-making that affects democratic processes

## Training Data

- **Source:** TCPD Assembly Election (AE) dataset, post-delimitation elections (2008+)
- **Scope:** All Indian states with 3+ post-delimitation election cycles
- **Records:** Constituency-election level observations with linked previous election data
- **Temporal split:** Trained on pre-2021 data, validated on 2021 holdout

## Features (12 inputs)

| # | Feature | Source Column | Level |
|---|---------|--------------|-------|
| 1 | turnoutChange | Derived: current - previous turnout_percentage | State |
| 2 | incumbencyFatigue | incumbent column (binary) | Candidate |
| 3 | turncoatPenalty | turncoat column (binary) | Candidate |
| 4 | recontestBonus | recontest column (binary) | Candidate |
| 5 | sameConstituencyBonus | same_constituency column (binary) | Candidate |
| 6 | previousMarginFactor | Previous election margin_percentage | Constituency |
| 7 | enopFactor | enop column (ENOP) | Constituency |
| 8 | nCandFactor | n_cand column | Constituency |
| 9 | constituencyTypeFactor | constituency_type (GEN vs SC/ST) | Constituency |
| 10 | genderFactor | sex column (binary F/M) | Candidate |
| 11 | partyStrengthFactor | Derived: party's previous seat count | State |
| 12 | partyVoteShareFactor | Derived: party's previous avg vote share | State |

## Performance Metrics

Target: 75% winner prediction accuracy per state (65% minimum threshold).

| Metric | Threshold | Notes |
|--------|-----------|-------|
| Accuracy (winner) | ≥65% | Per-state, below triggers formula-only fallback |
| CV Accuracy | Documented | 5-fold cross-validation |
| RMSE (vote share) | <6pp | Percentage points |

States below 65% accuracy are flagged for formula-only predictions via the circuit breaker.

## Fairness Assessment

The model is evaluated for systematic bias across:
- SC/ST reserved constituencies vs general constituencies
- Female vs male candidates
- National vs state vs unrecognized party candidates

Bias exceeding 2 percentage points of vote share triggers post-hoc calibration.

## Limitations

- Predictions are what-if scenarios, not forecasts
- Model cannot capture campaign-specific events, candidate charisma, or media effects
- Alliance dynamics beyond the last 3 election cycles are not represented
- GE (General Election) data is not included in this version
- Small states with <3 election cycles use national fallback coefficients

## Ethical Considerations

- Model outputs include explicit uncertainty ranges to prevent overconfidence
- A persistent disclaimer is displayed to users: "These predictions are exploratory what-if scenarios, not forecasts"
- The circuit breaker pattern prevents deployment of degraded models
- No individual voter data is used — all features are aggregate constituency/candidate level

## Deployment

- **Runtime:** onnxruntime (CPU-only)
- **Loading:** Lazy initialization on first prediction request
- **Caching:** Bucketed by quantized slider values (nearest 5%), 5-minute TTL
- **Circuit breaker:** Opens after 5 consecutive inference failures
- **Rate limit:** Standard API rate limiting applies

## Retraining

See `datascience/RETRAINING.md` for the retraining protocol.
