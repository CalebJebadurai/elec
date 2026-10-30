# Verifying the prediction engine: status report

**Status (2026-10-30): complete.** Predictions were frozen and hashed before any new data was fetched. TCPD was unreachable, so the results come from ECI's counting-day pages as saved by the Internet Archive (`AMENDMENT-1.md`). Full scores are in `results/04_scores.md`; data conversion notes are in `results/05_conversion.md`.

## Verdict
On the 20 assembly elections held from December 2023 to May 2026:
- **H1 rejected.** The app's engine called **51.4%** of seats correctly (95% CI 47.7–54.2%). The model card claims at least 65%.
- **H2: no better than doing nothing.** "Same party wins again" scored 51.2%. McNemar z = 0.13: no difference, exactly as the historical backtest predicted.
- **H3: worse than a coin flip on the headline.** The engine named the largest party correctly in **6 of 20** elections. The naive rule "the ruling party loses" got 11 of 20.
- **H4: ranges far too narrow.** The engine's stated seat ranges held the actual count for only **39%** of parties.
- **The biggest blind spot is new parties.** 212 seats went to parties that did not exist under that name at the base election. Every model scores these as misses; the engine cannot foresee new entrants unless a user adds one by hand. The largest shares are:
  - Tamil Nadu: 109 seats, with a new party the largest.
  - Maharashtra: 33 seats, from party splits.
  - Mizoram: 27 seats, with a new party the largest.
  - Bihar: 25 seats.
- **The two tests agree.** The new elections reproduce the backtest on 2000–2023 data (45.2% vs 44.9%). The engine behaves the same in and out of sample.

## 1. What data we have
- The local TCPD dump is dated **2026-04-30**, but its newest results are older.
  - Assemblies: newest are Karnataka (May 2023) and Meghalaya, Nagaland and Tripura (Mar 2023).
  - Lok Sabha: newest general election is **2019**.
- The dump does not contain the Nov–Dec 2023 assembly elections (Rajasthan, Madhya Pradesh, Chhattisgarh, Telangana, Mizoram), even though it has elections from earlier that year.
- On a 5-year term from each state's latest election in our data, **20 assembly elections plus the 2024 Lok Sabha** fell due by October 2026.
  - Assemblies: Andhra Pradesh, Arunachal Pradesh, Assam, Bihar, Chhattisgarh, Delhi, Haryana, Jammu & Kashmir, Jharkhand, Kerala, Madhya Pradesh, Maharashtra, Mizoram, Odisha, Puducherry, Rajasthan, Sikkim, Tamil Nadu, Telangana, West Bengal.
  - This is worked out from the data alone (`01_inventory.ts`); no news was consulted.

## 2. What the app actually predicts
- **Only the formula engine works.** The ML route (`/v1/predict/ml`) needs an `.onnx` model that is not in the repo, so it cannot run.
- **How the engine works:** each seat's last result is carried forward, then the seat's winner loses 10% of their vote share. 70% of that goes to the runner-up and 30% is split among the rest.
- **The factor sliders do nothing by default.** All twelve default to 0.
- **The engine is seat-local.** It has no state-level swing, so it cannot predict a wave toward or against a party.

## 3. EDA (local data, elections from 2000 to 2023)
- The largest party changed in **56.5%** of state elections.
- The same party re-won a seat only **44.9%** of the time. Seat retention has risen slowly: 37% in the 1980s, 44% in the 2010s, 55% in 2020–23.
- **29%** of seats were won by a margin under 5% of votes.

## 4. Backtest on past elections (out of sample, local data only)
Each election was predicted from the previous one in that state, using the app's real engine code. This covers 108 elections from 2000 to 2023 with unchanged boundaries.

| Model | Seat accuracy (95% CI) | Largest party right |
|---|---|---|
| M0: same party wins again | 44.9% (41.3–48.6) | 44.4% |
| **M1: app engine, default 10%** | **45.2% (42.0–48.3)** | **50.0%** |
| M2: largest party loses all its seats | 35.5% (31.8–39.4) | 47.2% |

- **No better than persistence.** M1 and M0 are not statistically different (McNemar z = 0.50).
- **Well below the model card.** `MODEL_CARD.md` sets a 65% minimum winner accuracy.
- **A coin flip on the headline call.** The engine named the largest party correctly half the time.
- **Tuning barely helps.** The best anti-incumbency setting on this history was 5% (46.3%). Every setting above 10% did worse.

Full tables: `results/02_eda_backtest.md`.

## 5. Frozen predictions
`predictions/frozen_predictions.json` holds per-seat and seat-total predictions from four models (M0–M3) for all 20 states. A readable summary is in `predictions/frozen_totals.md`. `PREREGISTRATION.md` holds:
- the hypotheses and scoring rules
- a disclosure that the analyst may already know some results from its training data
- SHA-256 hashes of every script, result and prediction file

The PREREGISTRATION.md file itself hashes to `b6d991fdee5b2f23f009bf99756a5313dd724e2239c22c7d174ae4e21ea321db` (08:13 UTC). All of these files are read-only.

## 6. Scoring details and deviations
- **Source:** latest Internet Archive snapshot of ECI's state-wise results pages, 147 pages. Raw pages are kept in `new_data_raw/eci/pages/`. These are counting-day declarations, not the final Form-20 reports.
- **Seat-level scoring covered 13 states (1,641 seats).** Seven states were scored on seat totals only:
  - Assam and Jammu & Kashmir: boundaries were redrawn, and seat names no longer match.
  - Andhra Pradesh, Odisha, Tamil Nadu and West Bengal: seat counts differ by one, because of the app's name-merging bug or a seat missing on ECI's pages. The amendment's rule makes these totals-only; it was applied as written.
  - Arunachal Pradesh: 10 seats were won unopposed and have no contest on ECI's pages.
- **Delhi:** 10 of 70 seats are excluded. The last saved snapshot of one page was taken mid-count.
- **Party names:** 12 ECI names were added to the mapping under amendment rule 3. They are the same registered party, differing only in spelling, and each code was checked against that state's base data. They are listed in `results/05_conversion.md`. Parties registered under new names (for example the Shiv Sena and NCP factions, Lok Janshakti Party (Ram Vilas), Zoram People's Movement, Tamilaga Vettri Kazhagam) keep their own labels.
- **No exploratory re-scoring was done.** For example, seat-level scoring of the four states that missed by one seat would be exploratory, not part of the pre-registered test.

## 7. Redo with TCPD data later (optional)
1. Download the all-states **Assembly (AE)** CSV from Lok Dhaba in your browser. Lok Dhaba → Browse Data → State Assembly Elections → all states → download.
2. Put the file in `datascience/backtest/new_data_raw/`. That folder is gitignored.
3. Run:

   ```
   cd datascience/backtest && bun 04_score.ts new_data_raw/<file>.csv
   ```

   Results go to `results/04_scores.md`.

States that TCPD has not yet coded will show as "not in new data".

## 8. Smaller issues found
- **One seat lost in some states.** The prediction input groups seats by constituency name, so two seats with the same name merge. Andhra Pradesh comes out at 174 seats instead of 175, and Tamil Nadu at 233 instead of 234.
- **By-elections leak into the input.** The input query does not filter out by-elections held in the same year as the general election.

## Integrity note
This test measures whether the model predicts **recorded** results. It cannot say whether those results reflect voters' intent, and it makes no claim about how any election was conducted.
