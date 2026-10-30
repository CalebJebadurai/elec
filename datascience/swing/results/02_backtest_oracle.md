# Swing model backtest — ORACLE (actual state swings fed in through the party sliders)

Rolling origin: 108 assembly elections 2000–2023 with unchanged boundaries, 14750 seats. Each is forecast by a model fitted only on elections before its year.

| Model | Seat winners right (95% CI) | Largest party right | Mean seat error per party | Brier score per seat |
|---|---|---|---|---|
| M0: same party wins again | 44.3% (40.8%–48.2%) | 47 / 108 | – | 1.113 |
| M1: app engine today (10% anti-incumbency) | 43.7% (40.4%–47.2%) | 52 / 108 | 9.1 | – |
| **Swing model** | **56.1% (52.5%–60.1%)** | **84 / 108** | **5.7** | **0.609** |

- Swing model minus persistence, seat accuracy: 11.8% (95% CI 8.9% to 15.8%).
- 80% seat ranges contained the actual count for **85.3%** of parties (target 80%).
- Mean probability the model gave to the party that actually came first: 61.2%.

## Per election

| Election | Seats | M0 | M1 | Swing | Largest right (M1 / Swing) |
|---|---|---|---|---|---|
| Andhra_Pradesh 2004 | 294 | 34.4% | 43.5% | 35.7% | no / no |
| Andhra_Pradesh 2014 | 175 | 16.6% | 17.7% | 42.9% | no / yes |
| Andhra_Pradesh 2019 | 175 | 47.4% | 48.0% | 85.7% | no / yes |
| Arunachal_Pradesh 2004 | 56 | 46.4% | 48.2% | 51.8% | yes / yes |
| Arunachal_Pradesh 2014 | 60 | 45.0% | 46.7% | 58.3% | yes / yes |
| Arunachal_Pradesh 2019 | 60 | 16.7% | 16.7% | 60.0% | no / yes |
| Assam 2001 | 122 | 42.6% | 41.0% | 57.4% | no / yes |
| Assam 2006 | 126 | 46.8% | 50.0% | 46.8% | yes / yes |
| Assam 2016 | 126 | 30.2% | 32.5% | 37.3% | no / no |
| Assam 2021 | 126 | 65.9% | 58.7% | 61.9% | yes / yes |
| Bihar 2000 | 324 | 13.6% | 13.0% | 24.7% | no / no |
| Bihar 2005 | 243 | 21.4% | 23.9% | 24.7% | no / no |
| Bihar 2015 | 243 | 44.4% | 41.6% | 44.9% | no / no |
| Bihar 2020 | 243 | 48.1% | 41.6% | 44.9% | yes / yes |
| Chhattisgarh 2013 | 90 | 40.0% | 56.7% | 43.3% | no / yes |
| Chhattisgarh 2018 | 90 | 41.1% | 48.9% | 71.1% | no / yes |
| Delhi 2003 | 70 | 72.9% | 65.7% | 68.6% | yes / yes |
| Delhi 2013 | 70 | 27.1% | 30.0% | 45.7% | no / yes |
| Delhi 2015 | 70 | 40.0% | 44.3% | 94.3% | no / yes |
| Delhi 2020 | 70 | 90.0% | 90.0% | 90.0% | yes / yes |
| Goa 2002 | 40 | 50.0% | 52.5% | 62.5% | no / no |
| Goa 2007 | 40 | 47.5% | 47.5% | 52.5% | yes / no |
| Goa 2017 | 40 | 47.5% | 45.0% | 50.0% | no / no |
| Goa 2022 | 40 | 35.0% | 30.0% | 35.0% | no / yes |
| Gujarat 2002 | 182 | 57.1% | 61.0% | 63.7% | yes / yes |
| Gujarat 2007 | 182 | 61.0% | 63.2% | 65.9% | yes / yes |
| Gujarat 2017 | 182 | 68.1% | 65.9% | 68.7% | yes / yes |
| Gujarat 2022 | 182 | 55.5% | 64.3% | 85.7% | yes / yes |
| Haryana 2000 | 90 | 16.7% | 16.7% | 24.4% | no / no |
| Haryana 2005 | 90 | 31.1% | 31.1% | 73.3% | no / yes |
| Haryana 2014 | 90 | 31.1% | 28.9% | 60.0% | no / yes |
| Haryana 2019 | 90 | 38.9% | 38.9% | 50.0% | yes / yes |
| Himachal_Pradesh 2003 | 68 | 48.5% | 48.5% | 60.3% | yes / yes |
| Himachal_Pradesh 2007 | 68 | 41.2% | 39.7% | 54.4% | no / yes |
| Himachal_Pradesh 2017 | 68 | 44.1% | 39.7% | 61.8% | no / yes |
| Himachal_Pradesh 2022 | 68 | 54.4% | 54.4% | 66.2% | no / yes |
| Jammu_&_Kashmir 2002 | 87 | 28.7% | 29.9% | 35.6% | yes / yes |
| Jammu_&_Kashmir 2014 | 87 | 44.8% | 43.7% | 57.5% | no / yes |
| Jharkhand 2014 | 81 | 35.8% | 37.0% | 49.4% | yes / yes |
| Jharkhand 2019 | 81 | 44.4% | 46.9% | 35.8% | no / no |
| Karnataka 2004 | 224 | 33.0% | 34.8% | 39.3% | no / no |
| Karnataka 2013 | 224 | 43.8% | 50.9% | 56.3% | yes / yes |
| Karnataka 2018 | 224 | 42.0% | 47.3% | 55.4% | no / no |
| Karnataka 2023 | 224 | 48.7% | 47.8% | 59.4% | no / yes |
| Kerala 2001 | 140 | 59.3% | 50.0% | 66.4% | yes / yes |
| Kerala 2006 | 140 | 51.4% | 42.9% | 58.6% | no / yes |
| Kerala 2016 | 140 | 62.9% | 42.9% | 60.7% | yes / yes |
| Kerala 2021 | 140 | 80.7% | 50.7% | 70.7% | yes / yes |
| Madhya_Pradesh 2003 | 230 | 41.3% | 44.8% | 69.6% | yes / yes |
| Madhya_Pradesh 2013 | 230 | 48.3% | 53.9% | 59.1% | yes / yes |
| Madhya_Pradesh 2018 | 230 | 47.8% | 56.1% | 56.5% | no / no |
| Maharashtra 2004 | 288 | 57.6% | 53.8% | 58.3% | no / no |
| Maharashtra 2014 | 288 | 44.4% | 43.4% | 53.8% | no / yes |
| Maharashtra 2019 | 288 | 57.3% | 54.9% | 57.6% | yes / yes |
| Manipur 2000 | 60 | 20.0% | 21.7% | 23.3% | no / no |
| Manipur 2002 | 60 | 16.7% | 30.0% | 31.7% | no / yes |
| Manipur 2007 | 60 | 23.3% | 23.3% | 45.0% | yes / yes |
| Manipur 2017 | 60 | 38.3% | 38.3% | 45.0% | yes / yes |
| Manipur 2022 | 60 | 41.7% | 38.3% | 58.3% | no / yes |
| Meghalaya 2003 | 60 | 40.0% | 36.7% | 40.0% | yes / yes |
| Meghalaya 2008 | 60 | 36.7% | 41.7% | 45.0% | yes / yes |
| Meghalaya 2018 | 60 | 23.3% | 21.7% | 30.0% | yes / yes |
| Meghalaya 2023 | 59 | 6.8% | 11.9% | 10.2% | no / no |
| Mizoram 2003 | 40 | 50.0% | 42.5% | 45.0% | yes / yes |
| Mizoram 2013 | 40 | 70.0% | 60.0% | 85.0% | yes / yes |
| Mizoram 2018 | 40 | 20.0% | 37.5% | 57.5% | no / yes |
| Nagaland 2003 | 60 | 33.3% | 35.0% | 35.0% | yes / yes |
| Nagaland 2013 | 60 | 43.3% | 50.0% | 61.7% | yes / yes |
| Nagaland 2018 | 60 | 28.3% | 26.7% | 45.0% | yes / yes |
| Nagaland 2023 | 60 | 26.7% | 30.0% | 46.7% | no / yes |
| Odisha 2000 | 147 | 19.7% | 17.0% | 23.1% | no / no |
| Odisha 2004 | 147 | 56.5% | 66.7% | 61.2% | yes / no |
| Odisha 2014 | 147 | 66.0% | 62.6% | 71.4% | yes / yes |
| Odisha 2019 | 146 | 65.1% | 64.4% | 74.0% | yes / yes |
| Puducherry 2001 | 30 | 50.0% | 46.7% | 50.0% | yes / yes |
| Puducherry 2006 | 30 | 43.3% | 36.7% | 40.0% | no / yes |
| Puducherry 2016 | 30 | 43.3% | 50.0% | 46.7% | no / no |
| Puducherry 2021 | 30 | 30.0% | 36.7% | 43.3% | no / yes |
| Punjab 2002 | 117 | 37.6% | 44.4% | 65.0% | no / yes |
| Punjab 2007 | 116 | 31.0% | 43.1% | 32.8% | no / no |
| Punjab 2017 | 117 | 36.8% | 49.6% | 66.7% | yes / yes |
| Punjab 2022 | 117 | 26.5% | 29.9% | 73.5% | no / yes |
| Rajasthan 2003 | 200 | 29.5% | 36.0% | 57.5% | no / yes |
| Rajasthan 2013 | 200 | 35.5% | 37.5% | 79.0% | no / yes |
| Rajasthan 2018 | 199 | 41.7% | 47.7% | 58.8% | no / yes |
| Sikkim 2004 | 28 | 71.4% | 64.3% | 100.0% | yes / yes |
| Sikkim 2014 | 32 | 68.8% | 68.8% | 68.8% | yes / yes |
| Sikkim 2019 | 32 | 59.4% | 59.4% | 65.6% | no / no |
| Tamil_Nadu 2001 | 234 | 21.4% | 20.9% | 47.4% | no / no |
| Tamil_Nadu 2006 | 234 | 37.6% | 32.1% | 37.6% | no / no |
| Tamil_Nadu 2016 | 232 | 48.7% | 50.9% | 51.7% | yes / yes |
| Tamil_Nadu 2021 | 232 | 52.6% | 48.7% | 51.3% | no / yes |
| Telangana 2018 | 119 | 53.8% | 57.1% | 77.3% | yes / yes |
| Tripura 2003 | 60 | 75.0% | 53.3% | 76.7% | yes / yes |
| Tripura 2008 | 60 | 73.3% | 63.3% | 75.0% | yes / yes |
| Tripura 2018 | 60 | 25.0% | 16.7% | 38.3% | no / no |
| Tripura 2023 | 60 | 40.0% | 26.7% | 51.7% | no / yes |
| Uttar_Pradesh 2002 | 402 | 23.6% | 20.1% | 26.1% | no / yes |
| Uttar_Pradesh 2007 | 403 | 36.2% | 39.0% | 55.3% | no / yes |
| Uttar_Pradesh 2017 | 403 | 20.8% | 22.8% | 73.4% | no / yes |
| Uttar_Pradesh 2022 | 403 | 68.0% | 64.3% | 69.0% | yes / yes |
| Uttarakhand 2007 | 69 | 50.7% | 43.5% | 56.5% | yes / yes |
| Uttarakhand 2017 | 70 | 48.6% | 47.1% | 82.9% | yes / yes |
| Uttarakhand 2022 | 70 | 67.1% | 65.7% | 70.0% | yes / yes |
| West_Bengal 2001 | 294 | 63.6% | 54.1% | 65.3% | yes / yes |
| West_Bengal 2006 | 294 | 68.0% | 57.5% | 74.1% | yes / yes |
| West_Bengal 2016 | 294 | 67.3% | 54.1% | 75.9% | yes / yes |
| West_Bengal 2021 | 294 | 55.8% | 45.6% | 71.8% | yes / yes |
