# Results: frozen predictions vs new TCPD data

New data file: new_data_raw/eci_converted_AE.csv
States due: 20; in new data: 20; seat-level scored: 13; boundaries changed: 7

| State | Base → target | Status | Seats matched | M0 | M1 (app) | M2 | M3 | Largest: actual / M1 | M1 seat error per party | Winners with a party label absent last time |
|---|---|---|---|---|---|---|---|---|---|---|
| Andhra_Pradesh | 2019 → 2024 | totals-only (boundaries changed) | — | — | — | — | — | TDP / YSRCP | 52.8 | 0 |
| Arunachal_Pradesh | 2019 → 2024 | totals-only (boundaries changed) | — | — | — | — | — | BJP / BJP | 3.1 | 3 |
| Assam | 2021 → 2026 | totals-only (boundaries changed) | — | — | — | — | — | BJP / BJP | 7.8 | 2 |
| Bihar | 2020 → 2025 | scored | 243 | 53.9% | 47.7% | 62.1% | 53.5% | BJP / RJD | 11.9 | 25 |
| Chhattisgarh | 2018 → 2023 | scored | 90 | 35.6% | 44.4% | 55.6% | 40.0% | BJP / INC | 11.3 | 0 |
| Delhi | 2020 → 2025 | scored | 60 | 40.0% | 56.7% | 66.7% | 50.0% | BJP / AAAP | 28.0 | 0 |
| Haryana | 2019 → 2024 | scored | 90 | 45.6% | 52.2% | 27.8% | 46.7% | BJP / BJP | 4.9 | 0 |
| Jammu_&_Kashmir | 2014 → 2024 | totals-only (boundaries changed) | — | — | — | — | — | JKN / JKPDP | 8.6 | 0 |
| Jharkhand | 2019 → 2024 | scored | 81 | 58.0% | 54.3% | 29.6% | 54.3% | JMM / BJP | 2.6 | 2 |
| Kerala | 2021 → 2026 | scored | 140 | 53.6% | 56.4% | 55.0% | 56.4% | INC / CPM | 4.8 | 0 |
| Madhya_Pradesh | 2018 → 2023 | scored | 230 | 57.0% | 57.4% | 67.4% | 60.9% | BJP / INC | 16.6 | 1 |
| Maharashtra | 2019 → 2024 | scored | 288 | 66.7% | 52.8% | 34.0% | 60.8% | BJP / BJP | 7.2 | 33 |
| Mizoram | 2018 → 2023 | scored | 40 | 15.0% | 15.0% | 2.5% | 15.0% | Zoram People’s Movement / MNF | 11.2 | 27 |
| Odisha | 2019 → 2024 | totals-only (boundaries changed) | — | — | — | — | — | BJP / BJD | 16.2 | 0 |
| Puducherry | 2021 → 2026 | scored | 30 | 33.3% | 40.0% | 13.3% | 40.0% | AINRC / AINRC | 1.3 | 4 |
| Rajasthan | 2018 → 2023 | scored | 198 | 39.9% | 54.0% | 48.5% | 50.5% | BJP / INC | 8.6 | 3 |
| Sikkim | 2019 → 2024 | scored | 32 | 53.1% | 46.9% | 6.3% | 46.9% | SKM / SKM | 7.5 | 0 |
| Tamil_Nadu | 2021 → 2026 | totals-only (boundaries changed) | — | — | — | — | — | Tamilaga Vettri Kazhagam / DMK | 17.2 | 109 |
| Telangana | 2018 → 2023 | scored | 119 | 46.2% | 50.4% | 50.4% | 47.9% | INC / BRS | 11.8 | 0 |
| West_Bengal | 2021 → 2026 | totals-only (boundaries changed) | — | — | — | — | — | BJP / AITC | 30.9 | 3 |

## Pooled (pre-registered tests)
- M0: seat accuracy 51.2% (95% CI 43.2%–57.2%); largest party right in 7/20; mean seat error per party 15.49
- M1: seat accuracy 51.4% (95% CI 47.7%–54.2%); largest party right in 6/20; mean seat error per party 13.21
- M2: seat accuracy 47.7% (95% CI 37.5%–56.6%); largest party right in 11/20; mean seat error per party 12.51
- M3: seat accuracy 52.8% (95% CI 47.1%–56.5%); largest party right in 7/20; mean seat error per party 15.29

- H1 (model card claims >= 65% winner accuracy): M1 = 51.4%, CI upper 54.2% → REJECTED: below 65%
- H2 (engine beats persistence): McNemar engine-only 272, persistence-only 268, z = 0.13 → no significant difference
- H3 (largest party better than a coin flip): 6/20, one-sided binomial p = 0.979
- H4 (stated seat ranges contain the actual count): 77/196 = 39.3% of party ranges
- Lower bound on label effects: 212 seats were won under a party label that did not contest the base election; every model scores these as misses
