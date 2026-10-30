# Pre-registration 2: the swing model on the 2023–26 elections

Written 2026-10-30, after `03_freeze.ts` froze the forecasts and **before** `04_score.ts` was run.

## Honest disclosure (read first)
This is a weaker test than the first pre-registration (`../backtest/PREREGISTRATION.md`):
- The analyst has already seen how the old engine (M0–M3) scored on these elections, including headline facts such as which states were won by new parties. That knowledge shaped *what to work on* (state-wide swing, calibrated ranges).
- The analyst (an AI model) may also know some of these results from training data.
- What protects the test: every modelling choice was fixed using **only elections up to 2023** in local TCPD data. Features were chosen from `results/01_eda.md` (pre-2023 data). The model was evaluated only on a rolling-origin backtest (`results/02_backtest.md`), and the one tuned number, the error inflation K = 1.5, was chosen on 2000–2009 alone (`results/02_backtest_calibration.md`). No forecast for 2023–26 was inspected against any result before this file was hashed.

## What is frozen
- `predictions/frozen_swing_2023_26.json`: per-seat win probabilities and seat-total distributions (2,000 simulations, seed 7) for the same 20 states and base elections as the first freeze.
- `../../frontend/src/engine/data/swing_model.json`: the fitted coefficients the app ships.

## Data and seat matching
Unchanged from `../backtest/AMENDMENT-1.md`: ECI counting-day pages via the Internet Archive, declared seats only, the same party-name mapping, and the same 13 seat-level states (all others are scored on totals). Seats are matched by constituency number.

## Hypotheses
- **H1.** On the seat-level states, the swing model's seat accuracy beats persistence (M0): the 95% bootstrap CI (resampling states) of the difference lies above 0.
- **H2 (descriptive).** The swing model names the largest party correctly in more of the 20 elections than the old engine (M1).
- **H3.** The 80% seat ranges contain the actual seat count for 70–90% of parties (parties forecast to win ≥1 seat on average or actually winning ≥1; parties winning seats that were never forecast count as misses).
- Brier score per seat is reported against M0 without a threshold.

## Hashes
In `PREREGISTRATION-2.sha256`.
