# Step 2: model changes tested

**Rule, set before running anything:** a change is adopted only if it improves seat accuracy on development elections (2000–2022) and does not hurt the check elections (2023–26). The 15-year half-life was fixed in advance, and no other values were tried. The check set is not blind, because its results were seen in earlier work.

| Variant | Dev 2000–22: seats | Largest party | Check 2023–26: seats | Largest party | Decision |
|---|---|---|---|---|---|
| Current model | 49.7% | 59 / 104 | 54.5% | 12 / 21 | **Kept** |
| (a) Recency weighting, 15-year half-life | 49.9% | 60 / 104 | 54.1% | 11 / 21 | Rejected: dev gain within noise, check worse |
| (b) Chief minister's party as incumbent | 49.1% | 57 / 104 | 53.0% | 11 / 21 | Rejected: worse on both |
| (a) + (b) | 49.6% | 59 / 104 | 54.4% | 12 / 21 | Rejected: no gain |

Variant (b) used TCPD's Chief Ministers dataset (1962–2022). The governing party was known for 141 of 251 pairs and differed from the largest party in 23. For later elections it falls back to the largest party.

**Reading:**
- The worry that anti-incumbency weakened over time did not turn into better forecasts when recent elections were weighted more. The model's size term already captures most of it.
- Identifying the actual government made results worse. One likely reason is that many of the differing cases are governments formed by defection or coalition after the election, where voters may not treat the governing party as the incumbent they elected. This explanation is not tested here.
- Both switches remain in `train.ts` (`RECENCY_HALF`, `FEATURE_CM`) so these runs can be reproduced. They are off by default.

**Considered and not tried:** a seat-level Lok Sabha signal from assembly segments. ECI's segment file exists only for 2024 in our data, which leaves too few elections to fit and test a coefficient honestly. Adding the 2019 segment report could make this testable.

**(c) New-party warning (descriptive, no model change):** since 2000, parties absent from the previous election took at least 10% of the vote in 30% of 157 state elections and won at least 10% of seats in 22% (`06_new_parties.md`). This includes renamed and split parties, because the model cannot see those either. The app now shows this base rate.

**Data cleanup found along the way:** TCPD's 2022–23 rows spell out some party names, which made CPI(M) look like a new party in Tripura 2023. `normalizeParty` now maps them. After this fix the current model scores 50.6% on 2000–2026 and 54.8% on 2023–26, and the coefficients are refit.
