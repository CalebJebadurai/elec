# Swing model backtest

Rolling origin: 21 assembly elections 2023–2026 with unchanged boundaries, 2864 seats. Each is forecast by a model fitted only on elections before its year.

| Model | Seat winners right (95% CI) | Largest party right | Mean seat error per party | Brier score per seat |
|---|---|---|---|---|
| M0: same party wins again | 46.4% (38.1%–52.8%) | 7 / 21 | – | 1.072 |
| M1: app engine today (10% anti-incumbency) | 46.9% (41.7%–50.7%) | 5 / 21 | 12.9 | – |
| **Swing model** | **54.8% (48.1%–60.5%)** | **12 / 21** | **8.7** | **0.613** |

- Swing model minus persistence, seat accuracy: 8.4% (95% CI 2.9% to 16.6%).
- 80% seat ranges contained the actual count for **78.6%** of parties (target 80%).
- Mean probability the model gave to the party that actually came first: 45.3%.

## Per election

| Election | Seats | M0 | M1 | Swing | Largest right (M1 / Swing) |
|---|---|---|---|---|---|
| Andhra_Pradesh 2024 | 175 | 18.9% | 34.3% | 65.1% | no / yes |
| Arunachal_Pradesh 2024 | 50 | 50.0% | 52.0% | 52.0% | yes / yes |
| Bihar 2025 | 243 | 54.3% | 47.3% | 58.8% | no / no |
| Delhi 2025 | 70 | 40.0% | 54.3% | 77.1% | no / yes |
| Haryana 2024 | 90 | 45.6% | 51.1% | 58.9% | yes / yes |
| Jharkhand 2024 | 81 | 58.0% | 54.3% | 39.5% | no / no |
| Karnataka 2023 | 224 | 48.7% | 47.8% | 49.1% | no / no |
| Kerala 2026 | 140 | 53.6% | 56.4% | 64.3% | no / yes |
| Madhya_Pradesh 2023 | 230 | 57.4% | 56.5% | 71.3% | no / yes |
| Maharashtra 2024 | 288 | 67.0% | 51.0% | 65.3% | yes / yes |
| Meghalaya 2023 | 59 | 15.3% | 16.9% | 16.9% | no / no |
| Mizoram 2023 | 40 | 15.0% | 15.0% | 25.0% | no / no |
| Nagaland 2023 | 60 | 26.7% | 30.0% | 45.0% | no / yes |
| Odisha 2024 | 146 | 43.2% | 53.4% | 57.5% | no / yes |
| Puducherry 2026 | 30 | 33.3% | 40.0% | 26.7% | yes / no |
| Rajasthan 2023 | 199 | 40.7% | 51.8% | 59.3% | no / yes |
| Sikkim 2024 | 32 | 50.0% | 46.9% | 50.0% | yes / yes |
| Tamil_Nadu 2026 | 234 | 30.3% | 29.9% | 29.5% | no / no |
| Telangana 2023 | 119 | 46.2% | 50.4% | 54.6% | no / no |
| Tripura 2023 | 60 | 50.0% | 40.0% | 53.3% | no / yes |
| West_Bengal 2026 | 294 | 53.4% | 52.4% | 53.4% | no / no |
