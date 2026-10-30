# EDA and backtest on local data (TCPD AE dump 2026-04-30)

Elections analysed: 363 general assembly elections in 34 states/UTs
Backtest pairs (same delimitation, target year >= 1977): 234; with target year >= 2000: 108

## How often does the past repeat? (target year >= 2000)
- Largest party changed in 56.5% of state elections
- Same party re-won a seat in 44.9% of seats (pooled)
  - 1977–1989: seat retention 37.4%, largest party changed 58.5% (65 elections)
  - 1990–1999: seat retention 38.7%, largest party changed 49.2% (61 elections)
  - 2000–2009: seat retention 41.6%, largest party changed 57.8% (45 elections)
  - 2010–2019: seat retention 44.4%, largest party changed 57.8% (45 elections)
  - 2020–2023: seat retention 54.7%, largest party changed 50.0% (18 elections)
- Close seats (margin < 5% of votes): 29.0% of seats on average
- Mean effective number of parties (winner rows): 2.93

## Backtest: predict election t from t-1 (target year >= 2000)
| Model | Seat accuracy | 95% CI (cluster bootstrap) | Largest party right | Mean seat error per party |
|---|---|---|---|---|
| M0 Persistence (same party wins again) | 44.9% | 41.3%–48.6% | 44.4% | 9.42 |
| M1 App engine, shipped default (10% anti-incumbency) | 45.2% | 42.0%–48.3% | 50.0% | 8.87 |
| M2 Largest party loses all its seats | 35.5% | 31.8%–39.4% | 47.2% | 13.31 |

McNemar, M1 vs M0 on matched seats: engine-only correct 2104, persistence-only correct 2071, z = 0.50

## Sensitivity: engine accuracy by anti-incumbency setting (target year >= 2000)
| Anti-incumbency % | Seat accuracy | Largest party right |
|---|---|---|
| 0 | 44.9% | 44.4% |
| 5 | 46.3% | 48.1% |
| 10 | 45.2% | 50.0% |
| 15 | 42.3% | 48.1% |
| 20 | 39.1% | 52.8% |
| 25 | 35.5% | 48.1% |
| 30 | 32.6% | 50.0% |
| 35 | 30.6% | 44.4% |
| 40 | 29.3% | 40.7% |

Best setting on this historical data: 5% (seat accuracy 46.3%). This is frozen as model M3 before any new data is seen.

## Per election (target year >= 2010)
| State | From → to | Seats matched | M0 | M1 | M2 | Largest party: actual / M1 |
|---|---|---|---|---|---|---|
| Chhattisgarh | 2008 → 2013 | 90 | 41.1% | 56.7% | 40.0% | BJP / BJP |
| Delhi | 2008 → 2013 | 70 | 27.1% | 30.0% | 38.6% | BJP / INC |
| Karnataka | 2008 → 2013 | 224 | 43.8% | 51.3% | 55.8% | INC / BJP |
| Madhya_Pradesh | 2008 → 2013 | 230 | 48.3% | 55.7% | 23.5% | BJP / BJP |
| Mizoram | 2008 → 2013 | 40 | 70.0% | 62.5% | 5.0% | INC / INC |
| Nagaland | 2008 → 2013 | 60 | 43.3% | 50.0% | 16.7% | NPF / NPF |
| Rajasthan | 2008 → 2013 | 200 | 35.5% | 41.5% | 71.5% | BJP / INC |
| Andhra_Pradesh | 2009 → 2014 | 167 | 20.4% | 23.4% | 41.3% | TDP / INC |
| Arunachal_Pradesh | 2009 → 2014 | 60 | 45.0% | 46.7% | 5.0% | INC / INC |
| Haryana | 2009 → 2014 | 90 | 31.1% | 30.0% | 30.0% | BJP / INC |
| Jammu_&_Kashmir | 2008 → 2014 | 87 | 44.8% | 50.6% | 48.3% | JKPDP / JKN |
| Jharkhand | 2009 → 2014 | 81 | 35.8% | 39.5% | 27.2% | BJP / BJP |
| Maharashtra | 2009 → 2014 | 288 | 44.4% | 44.8% | 43.8% | BJP / INC |
| Odisha | 2009 → 2014 | 147 | 66.0% | 63.9% | 13.6% | BJD / BJD |
| Sikkim | 2009 → 2014 | 32 | 68.8% | 68.8% | 3.1% | SDF / SDF |
| Bihar | 2010 → 2015 | 243 | 44.0% | 44.9% | 29.2% | RJD / JD(U) |
| Delhi | 2013 → 2015 | 70 | 40.0% | 44.3% | 64.3% | AAAP / BJP |
| Assam | 2011 → 2016 | 126 | 30.2% | 33.3% | 39.7% | BJP / INC |
| Kerala | 2011 → 2016 | 140 | 62.9% | 42.9% | 34.3% | CPM / CPM |
| Puducherry | 2011 → 2016 | 30 | 43.3% | 53.3% | 43.3% | INC / AINRC |
| Tamil_Nadu | 2011 → 2016 | 231 | 48.5% | 51.1% | 23.4% | ADMK / ADMK |
| West_Bengal | 2011 → 2016 | 294 | 67.0% | 54.1% | 21.1% | AITC / AITC |
| Goa | 2012 → 2017 | 40 | 47.5% | 45.0% | 35.0% | INC / BJP |
| Gujarat | 2012 → 2017 | 181 | 67.4% | 66.9% | 41.4% | BJP / BJP |
| Himachal_Pradesh | 2012 → 2017 | 68 | 44.1% | 42.6% | 54.4% | BJP / INC |
| Manipur | 2012 → 2017 | 60 | 38.3% | 38.3% | 6.7% | INC / INC |
| Punjab | 2012 → 2017 | 117 | 36.8% | 49.6% | 57.3% | INC / INC |
| Uttar_Pradesh | 2012 → 2017 | 403 | 20.8% | 23.1% | 20.8% | BJP / SP |
| Uttarakhand | 2012 → 2017 | 70 | 47.1% | 51.4% | 67.1% | BJP / BJP |
| Chhattisgarh | 2013 → 2018 | 90 | 41.1% | 48.9% | 74.4% | INC / BJP |
| Karnataka | 2013 → 2018 | 224 | 42.0% | 47.8% | 39.3% | BJP / INC |
| Madhya_Pradesh | 2013 → 2018 | 230 | 47.8% | 57.0% | 45.2% | INC / BJP |
| Meghalaya | 2013 → 2018 | 60 | 23.3% | 23.3% | 8.3% | INC / INC |
| Mizoram | 2013 → 2018 | 40 | 20.0% | 37.5% | 50.0% | MNF / INC |
| Nagaland | 2013 → 2018 | 60 | 28.3% | 25.0% | 3.3% | NPF / NPF |
| Rajasthan | 2013 → 2018 | 199 | 41.7% | 48.7% | 43.7% | INC / BJP |
| Telangana | 2014 → 2018 | 119 | 53.8% | 58.0% | 19.3% | BRS / BRS |
| Tripura | 2013 → 2018 | 60 | 25.0% | 16.7% | 0.0% | BJP / CPM |
| Andhra_Pradesh | 2014 → 2019 | 166 | 47.6% | 49.4% | 84.9% | YSRCP / TDP |
| Arunachal_Pradesh | 2014 → 2019 | 60 | 16.7% | 15.0% | 33.3% | BJP / INC |
| Haryana | 2014 → 2019 | 90 | 38.9% | 38.9% | 17.8% | BJP / BJP |
| Jharkhand | 2014 → 2019 | 81 | 44.4% | 48.1% | 43.2% | JMM / BJP |
| Maharashtra | 2014 → 2019 | 288 | 57.3% | 54.9% | 36.1% | BJP / BJP |
| Odisha | 2014 → 2019 | 146 | 65.1% | 65.1% | 13.0% | BJD / BJD |
| Sikkim | 2014 → 2019 | 32 | 59.4% | 59.4% | 53.1% | SKM / SDF |
| Bihar | 2015 → 2020 | 243 | 48.1% | 41.6% | 42.0% | RJD / RJD |
| Delhi | 2015 → 2020 | 70 | 90.0% | 90.0% | 11.4% | AAAP / AAAP |
| Assam | 2016 → 2021 | 126 | 66.7% | 61.1% | 34.9% | BJP / BJP |
| Kerala | 2016 → 2021 | 140 | 80.7% | 52.1% | 45.7% | CPM / CPM |
| Puducherry | 2016 → 2021 | 30 | 30.0% | 36.7% | 33.3% | AINRC / INC |
| Tamil_Nadu | 2016 → 2021 | 231 | 52.4% | 48.9% | 50.2% | DMK / ADMK |
| West_Bengal | 2016 → 2021 | 294 | 55.8% | 46.3% | 1.7% | AITC / AITC |
| Goa | 2017 → 2022 | 40 | 35.0% | 32.5% | 40.0% | BJP / INC |
| Gujarat | 2017 → 2022 | 181 | 55.8% | 64.1% | 9.4% | BJP / BJP |
| Himachal_Pradesh | 2017 → 2022 | 68 | 54.4% | 52.9% | 54.4% | INC / BJP |
| Manipur | 2017 → 2022 | 60 | 41.7% | 36.7% | 51.7% | BJP / INC |
| Punjab | 2017 → 2022 | 117 | 26.5% | 29.9% | 38.5% | AAAP / INC |
| Uttar_Pradesh | 2017 → 2022 | 403 | 68.0% | 64.3% | 19.4% | BJP / BJP |
| Uttarakhand | 2017 → 2022 | 70 | 67.1% | 67.1% | 27.1% | BJP / BJP |
| Karnataka | 2018 → 2023 | 224 | 48.7% | 48.7% | 50.9% | INC / BJP |
| Meghalaya | 2018 → 2023 | 59 | 8.5% | 13.6% | 8.5% | NPP / INC |
| Nagaland | 2018 → 2023 | 60 | 26.7% | 30.0% | 43.3% | NDPP / NPF |
| Tripura | 2018 → 2023 | 60 | 40.0% | 26.7% | 0.0% | BJP / BJP |
