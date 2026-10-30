# Swing model: a learned seat forecast for the simulator

**What it is.** The model behind the prediction page's default "Learned model" mode (`frontend/src/engine/swingModel.ts`, coefficients in `frontend/src/engine/data/swing_model.json`). It replaces a hand-set formula that did no better than "same party wins again" (`../backtest/REPORT.md`).

## Results (only elections the model was not fitted on)
| | 2000–2023 rolling backtest (108 elections, 14,750 seats) | 2023–26, pre-registered (13 states seat-level, 1,641 seats; 20 on totals) |
|---|---|---|
| **Learned swing model** | **49.4%** of seats (95% CI 46.1–53.0) | **58.4%** (51.5–63.2) |
| Same party wins again (M0) | 44.3% | 51.2% |
| Old engine, 10% anti-incumbency (M1) | 43.7% | 50.6% |
| Gain over M0 | +5.1 pts (CI +2.5 to +8.1) | +7.2 pts (CI +1.9 to +12.5): **H1 supported** |
| Largest party right | 60 / 108 (M1: 52) | 8 / 20 (M1: 6) |
| 80% seat ranges held | 79.7% | 66.1%: **H3 not supported** (band was 70–90%) |
| Brier score per seat (lower is better) | 0.670 (M0: 1.113) | 0.562 (M0: 0.975) |

- **What the sliders are worth:** if a user knew each party's real state-wide swing (from good polls, say) and set it with the party sliders, the backtest accuracy would rise to 56.1%, and the largest party would be right in 84 of 108 elections (`results/02_backtest_oracle.md`). Even then, 44% of seats would be missed. Seat-level noise from candidates, local alliances and rebels is large: SD 12 pts after removing the state swing.
- **Where it failed in 2023–26:**
  - New parties and factions won **213 seats**: TVK in Tamil Nadu, ZPM in Mizoram, the Shiv Sena and NCP factions. No model built on past results can foresee them. Use the new-party tool.
  - **Sikkim:** the largest-party proxy wrongly treated the ruling SKM as weak.
  - **Delhi** and **Jharkhand:** the model named the wrong largest party.

## How it works
1. **State swing** per party, by ridge regression on 963 party-election rows. Inputs:
   - base vote share
   - whether it was the largest party
   - the trend from the previous election
   - the Lok Sabha result in between, minus its assembly share (correlation 0.58 with the swing; about half of the gap carries over)
2. **Seat level**, fitted on 34,296 seats:
   - the last result plus the state swing, applied 97% uniformly with a small proportional term
   - a pull of 37% of a party's local deviation back toward its state average
   - +0.9 pts for the party holding the seat (+2.2 if its MLA has multiple terms)
3. **Uncertainty:** each simulation draws a shared state-level error per party, scaled to party size, plus a seat-level error, both sized from residuals. The state error is inflated by K = 1.5, the smallest value giving ≥80% range coverage on 2000–2009 (`results/02_backtest_calibration.md`).

## What the data can and cannot say about voters
- **Turnout change** has no measurable effect on the largest party's swing: −0.03 pts per point, SE 0.06.
- **Electorate growth** (a proxy for new voters) has none either: −0.04 pts per %, SE 0.06.
- The sliders exist but say so in the app.
- **Gender and age:** TCPD results have no votes by gender or age, so no model can learn how women, first-time or older voters vote from this data. The voter-group sliders apply the user's own assumption, for example from a survey: a group of S% of voters swinging L points moves a party by S×L/100 points. Learning these effects would need survey microdata (such as CSDS-Lokniti NES) or ECI's gender-wise turnout by constituency, which is not in our data yet.

## Files
| File | Purpose |
|---|---|
| `data.ts` | Election and pair builder from local TCPD dumps (assembly + Lok Sabha) |
| `01_eda.ts` → `results/01_eda.md` | What drives swings |
| `train.ts` | Ridge fits and error sizes |
| `02_backtest.ts` → `results/02_backtest*.md` | Rolling-origin backtest (`--oracle` for perfect-swing sliders) |
| `03_freeze.ts` | Final fit, app coefficients, frozen 2023–26 forecasts |
| `PREREGISTRATION-2.md` / `.sha256` | Hypotheses and hashes, written before scoring |
| `04_score.ts` → `results/04_scores_2023_26.md` | Scoring |
| `POST-FREEZE-NOTES.md` | A formatting-only change after scoring, verified to leave forecasts identical |

Run from this folder with Bun: `bun 01_eda.ts`, `bun 02_backtest.ts`, `bun 03_freeze.ts`, `bun 04_score.ts`.

## Honest limits
- **Anti-incumbency is pooled over 1977–2023,** although it has weakened: −12.5 pts in the 1980s, −4.4 pts since 2010. Fixing this needs a new pre-registered test.
- **"Ruling party" means the largest party at the last election.** TCPD has no record of who governed, so coalition governments are mislabelled.
- **The Lok Sabha signal is only as fresh as the local data.** The 2024 results are not in the local dump, so states with base elections in 2019–2021 forecast without it. Refreshing the TCPD data would add it.
- **This tests recorded results,** not whether they reflect voters' intent.
