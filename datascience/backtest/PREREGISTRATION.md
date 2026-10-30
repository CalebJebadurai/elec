# Pre-registration: does the app's prediction engine predict new elections?

Written on 2026-10-30, **before** any data newer than the local TCPD dump of 2026-04-30 was downloaded or looked at. No news or result sources were consulted.

## Disclosure
The analyst (an AI model, knowledge cutoff June 2026) may already know some of these election results from its training data. To stop that knowledge from shaping the test:
- The predictor under test is the app's own code as shipped (`frontend/src/engine/predictionEngine.ts`, git `ab6679c`), with its shipped defaults. Nothing about it was changed or tuned.
- The only tuned model (M3) has its single setting chosen by an algorithm (best pooled seat accuracy) on historical election pairs from local data, in `02_eda_backtest.ts`.
- Predictions, scoring code and these rules are hashed below before download. Any later change would change a hash.

## Elections under test
The 20 assembly elections that fall due by October 2026 on a 5-year term after each state's latest general election in local data (`01_inventory.ts`). Each state is predicted from its latest local general election only, exactly as the app's `/v1/predict/data` endpoint builds its input. The Lok Sabha is out of scope: the app makes no Lok Sabha predictions (the endpoint returns 501).

## Models
- **M1 (primary)**: app engine, shipped default, 10% anti-incumbency, all factor sliders 0.
- **M0**: persistence, i.e. the engine at 0%: the party that won each seat wins it again.
- **M2**: naive anti-incumbency: the state's largest party loses every seat it holds to that seat's runner-up.
- **M3**: app engine at the anti-incumbency % that scored best on historical pairs (see `results/m3_setting.json`).

## Scoring rules (implemented in `04_score.ts`)
1. Target election: the first general election (Poll_No 0) in the new file after the base year that covers at least 40% of the seats.
2. If the target's DelimID differs from the base election's, boundaries changed: seat-level accuracy is not scored for that state; seat totals still are.
3. Seats are matched by exact constituency name. Party labels are compared after the app's `normalizeParty`. A seat won under a label that did not contest the base election counts as a miss for every model; the count of such seats is reported, not corrected.
4. Metrics: seat-level winner accuracy (pooled, 95% cluster bootstrap CI over states); whether the predicted largest party is the actual largest party; mean absolute seat error per party; for M1, coverage of its stated seat ranges.
5. Hypotheses:
   - **H1**: M1 seat accuracy is at least the model card's 65% threshold. Rejected if the CI upper bound is below 65%.
   - **H2**: M1 differs from M0 (two-sided McNemar on matched seats, alpha 0.05).
   - **H3**: M1 names the largest party better than chance (one-sided binomial against 50%).
   - **H4**: report the coverage of M1's seat ranges; no threshold is claimed by the app.
6. States absent from the new file are reported as "not in new data" and excluded. No other exclusions.

## Expectation from the historical backtest (local data, target years 2000–2023)
M1 had 45.2% seat accuracy versus 44.9% for persistence (McNemar z = 0.50), and named the largest party correctly in 50% of elections. If the engine behaves on new elections as it did historically, H1 will be rejected and H2 will show no significant difference.

## Integrity limits
The test measures whether the model predicts **recorded** results. It cannot tell whether those results reflect voters' intent, and makes no claim either way about the conduct of any election.

## Hashes (SHA-256)
    f344ea640953bb04087dddac35e5892a3751829e869031236f5f58bfa76ebc69  csv.ts
    c96d47e0b98f2b6b678bfb740fe4cf410e8d89a6761b1c443897d72aeecd526a  model.ts
    8df75b2e53821c4dc9cb9fcbce29303f05f013443c095dd709dd74967de52b78  01_inventory.ts
    e73e347b528fa3ae5890e39b80a13df2147f963d043d6862a35d0b62e258920c  02_eda_backtest.ts
    2842f9da2596c816ab0082bf8aabdb8826100b932334f2bef823bcbd3a8fb402  03_freeze.ts
    b41d47d6706c09017841d28135a96093972bc83327af8c816809b964b6909585  04_score.ts
    a4c564b7c3d3c2ab9e8123c0a2fb9534f368fecea0ae01abe29d609609aca02d  results/02_eda_backtest.md
    c9010ba2cd13aa2c562e9edd4d6837a591ad947a28567f31c926666b6fb02bf7  results/m3_setting.json
    1b4dae597af85468c78acd278a8d87ab1dd1026ba04b3ca626522be2bc576bac  predictions/frozen_predictions.json
    b50273f5d41da0b1d74b1fcd25dd4d9c89524b801bce5fc99b9a2a716dcf1e7b  predictions/frozen_totals.md
    3ef0777324902dd307c95ef630a0f29ffb5f661b3aca46a91a4565e108495c8e  ../../frontend/src/engine/predictionEngine.ts
    0eb142235e3aa494ef0533d05c2f0bc81536f3e8ec5eefd5579dbea17e069c10  ../../frontend/src/constants.ts
