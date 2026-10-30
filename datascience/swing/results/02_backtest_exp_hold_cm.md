# Swing model backtest

Rolling origin: 21 assembly elections 2023–2026 with unchanged boundaries, 2864 seats. Each is forecast by a model fitted only on elections before its year.

| Model | Seat winners right (95% CI) | Largest party right | Mean seat error per party | Brier score per seat |
|---|---|---|---|---|
| M0: same party wins again | 46.0% (37.7%–52.6%) | 7 / 21 | – | 1.080 |
| M1: app engine today (10% anti-incumbency) | 46.5% (41.0%–50.6%) | 5 / 21 | 13.0 | – |
| **Swing model** | **53.0% (46.3%–59.1%)** | **11 / 21** | **9.3** | **0.626** |

- Swing model minus persistence, seat accuracy: 7.0% (95% CI 1.6% to 14.1%).
- 80% seat ranges contained the actual count for **77.9%** of parties (target 80%).
- Mean probability the model gave to the party that actually came first: 43.6%.

## Per election

| Election | Seats | M0 | M1 | Swing | Largest right (M1 / Swing) |
|---|---|---|---|---|---|
| Andhra_Pradesh 2024 | 175 | 18.9% | 34.3% | 54.3% | no / yes |
| Arunachal_Pradesh 2024 | 50 | 50.0% | 52.0% | 50.0% | yes / yes |
| Bihar 2025 | 243 | 54.3% | 47.3% | 59.3% | no / no |
| Delhi 2025 | 70 | 40.0% | 54.3% | 77.1% | no / yes |
| Haryana 2024 | 90 | 45.6% | 51.1% | 56.7% | yes / yes |
| Jharkhand 2024 | 81 | 58.0% | 54.3% | 35.8% | no / no |
| Karnataka 2023 | 224 | 48.7% | 47.8% | 47.3% | no / no |
| Kerala 2026 | 140 | 53.6% | 56.4% | 59.3% | no / yes |
| Madhya_Pradesh 2023 | 230 | 57.4% | 56.5% | 73.5% | no / yes |
| Maharashtra 2024 | 288 | 67.0% | 51.0% | 64.6% | yes / yes |
| Meghalaya 2023 | 59 | 6.8% | 11.9% | 10.2% | no / no |
| Mizoram 2023 | 40 | 15.0% | 15.0% | 25.0% | no / no |
| Nagaland 2023 | 60 | 26.7% | 30.0% | 43.3% | no / yes |
| Odisha 2024 | 146 | 43.2% | 53.4% | 57.5% | no / no |
| Puducherry 2026 | 30 | 33.3% | 40.0% | 26.7% | yes / no |
| Rajasthan 2023 | 199 | 40.7% | 51.8% | 59.8% | no / yes |
| Sikkim 2024 | 32 | 50.0% | 46.9% | 62.5% | yes / yes |
| Tamil_Nadu 2026 | 234 | 30.3% | 29.9% | 30.3% | no / no |
| Telangana 2023 | 119 | 46.2% | 50.4% | 52.9% | no / no |
| Tripura 2023 | 60 | 40.0% | 26.7% | 46.7% | no / yes |
| West_Bengal 2026 | 294 | 53.4% | 52.4% | 48.3% | no / no |
