# Swing model backtest

Rolling origin: 104 assembly elections 2000–2022 with unchanged boundaries, 14347 seats. Each is forecast by a model fitted only on elections before its year.

| Model | Seat winners right (95% CI) | Largest party right | Mean seat error per party | Brier score per seat |
|---|---|---|---|---|
| M0: same party wins again | 44.5% (41.2%–48.7%) | 46 / 104 | – | 1.110 |
| M1: app engine today (10% anti-incumbency) | 43.9% (40.6%–47.6%) | 52 / 104 | 9.1 | – |
| **Swing model** | **49.6% (46.7%–53.6%)** | **59 / 104** | **8.0** | **0.666** |

- Swing model minus persistence, seat accuracy: 5.1% (95% CI 2.8% to 7.9%).
- 80% seat ranges contained the actual count for **80.6%** of parties (target 80%).
- Mean probability the model gave to the party that actually came first: 50.4%.

## Per election

| Election | Seats | M0 | M1 | Swing | Largest right (M1 / Swing) |
|---|---|---|---|---|---|
| Andhra_Pradesh 2004 | 294 | 34.4% | 43.5% | 51.7% | no / yes |
| Andhra_Pradesh 2014 | 175 | 16.6% | 17.7% | 35.4% | no / yes |
| Andhra_Pradesh 2019 | 175 | 47.4% | 48.0% | 63.4% | no / yes |
| Arunachal_Pradesh 2004 | 56 | 46.4% | 48.2% | 42.9% | yes / yes |
| Arunachal_Pradesh 2014 | 60 | 45.0% | 46.7% | 55.0% | yes / yes |
| Arunachal_Pradesh 2019 | 60 | 16.7% | 16.7% | 10.0% | no / no |
| Assam 2001 | 122 | 42.6% | 41.0% | 56.6% | no / yes |
| Assam 2006 | 126 | 46.8% | 50.0% | 43.7% | yes / yes |
| Assam 2016 | 126 | 30.2% | 32.5% | 38.9% | no / no |
| Assam 2021 | 126 | 65.9% | 58.7% | 58.7% | yes / no |
| Bihar 2000 | 324 | 13.6% | 13.0% | 21.6% | no / no |
| Bihar 2005 | 243 | 21.4% | 23.9% | 25.1% | no / no |
| Bihar 2015 | 243 | 44.4% | 41.6% | 44.0% | no / no |
| Bihar 2020 | 243 | 48.1% | 41.6% | 49.4% | yes / no |
| Chhattisgarh 2013 | 90 | 40.0% | 56.7% | 42.2% | no / yes |
| Chhattisgarh 2018 | 90 | 41.1% | 48.9% | 38.9% | no / no |
| Delhi 2003 | 70 | 72.9% | 65.7% | 45.7% | yes / no |
| Delhi 2013 | 70 | 27.1% | 30.0% | 22.9% | no / no |
| Delhi 2015 | 70 | 40.0% | 44.3% | 7.1% | no / no |
| Delhi 2020 | 70 | 90.0% | 90.0% | 14.3% | yes / no |
| Goa 2002 | 40 | 50.0% | 52.5% | 67.5% | no / no |
| Goa 2007 | 40 | 47.5% | 47.5% | 42.5% | yes / no |
| Goa 2017 | 40 | 47.5% | 45.0% | 55.0% | no / no |
| Goa 2022 | 40 | 35.0% | 30.0% | 42.5% | no / yes |
| Gujarat 2002 | 182 | 57.1% | 61.0% | 58.2% | yes / yes |
| Gujarat 2007 | 182 | 61.0% | 63.2% | 57.1% | yes / yes |
| Gujarat 2017 | 182 | 68.1% | 65.9% | 61.5% | yes / yes |
| Gujarat 2022 | 182 | 55.5% | 64.3% | 75.8% | yes / yes |
| Haryana 2000 | 90 | 16.7% | 16.7% | 25.6% | no / no |
| Haryana 2005 | 90 | 31.1% | 31.1% | 60.0% | no / yes |
| Haryana 2014 | 90 | 31.1% | 28.9% | 42.2% | no / no |
| Haryana 2019 | 90 | 38.9% | 38.9% | 51.1% | yes / yes |
| Himachal_Pradesh 2003 | 68 | 48.5% | 48.5% | 52.9% | yes / yes |
| Himachal_Pradesh 2007 | 68 | 41.2% | 39.7% | 45.6% | no / no |
| Himachal_Pradesh 2017 | 68 | 44.1% | 39.7% | 58.8% | no / yes |
| Himachal_Pradesh 2022 | 68 | 54.4% | 54.4% | 39.7% | no / no |
| Jammu_&_Kashmir 2002 | 87 | 28.7% | 29.9% | 31.0% | yes / yes |
| Jammu_&_Kashmir 2014 | 87 | 44.8% | 43.7% | 51.7% | no / no |
| Jharkhand 2014 | 81 | 35.8% | 37.0% | 45.7% | yes / yes |
| Jharkhand 2019 | 81 | 44.4% | 46.9% | 34.6% | no / no |
| Karnataka 2004 | 224 | 33.0% | 34.8% | 40.6% | no / no |
| Karnataka 2013 | 224 | 43.8% | 50.9% | 45.5% | yes / yes |
| Karnataka 2018 | 224 | 42.0% | 47.3% | 54.0% | no / no |
| Kerala 2001 | 140 | 59.3% | 50.0% | 64.3% | yes / yes |
| Kerala 2006 | 140 | 51.4% | 42.9% | 45.7% | no / no |
| Kerala 2016 | 140 | 62.9% | 42.9% | 49.3% | yes / no |
| Kerala 2021 | 140 | 80.7% | 50.7% | 54.3% | yes / no |
| Madhya_Pradesh 2003 | 230 | 41.3% | 44.8% | 57.0% | yes / yes |
| Madhya_Pradesh 2013 | 230 | 48.3% | 53.9% | 53.0% | yes / yes |
| Madhya_Pradesh 2018 | 230 | 47.8% | 56.1% | 52.6% | no / no |
| Maharashtra 2004 | 288 | 57.6% | 53.8% | 58.7% | no / no |
| Maharashtra 2014 | 288 | 44.4% | 43.4% | 47.6% | no / no |
| Maharashtra 2019 | 288 | 57.3% | 54.9% | 58.0% | yes / yes |
| Manipur 2000 | 60 | 20.0% | 21.7% | 18.3% | no / no |
| Manipur 2002 | 60 | 16.7% | 30.0% | 25.0% | no / no |
| Manipur 2007 | 60 | 23.3% | 23.3% | 30.0% | yes / yes |
| Manipur 2017 | 60 | 38.3% | 38.3% | 46.7% | yes / yes |
| Manipur 2022 | 60 | 41.7% | 38.3% | 51.7% | no / yes |
| Meghalaya 2003 | 60 | 40.0% | 36.7% | 38.3% | yes / yes |
| Meghalaya 2008 | 60 | 36.7% | 41.7% | 45.0% | yes / yes |
| Meghalaya 2018 | 60 | 23.3% | 21.7% | 35.0% | yes / yes |
| Mizoram 2003 | 40 | 50.0% | 42.5% | 50.0% | yes / yes |
| Mizoram 2013 | 40 | 70.0% | 60.0% | 85.0% | yes / yes |
| Mizoram 2018 | 40 | 20.0% | 37.5% | 12.5% | no / no |
| Nagaland 2003 | 60 | 33.3% | 35.0% | 35.0% | yes / yes |
| Nagaland 2013 | 60 | 43.3% | 50.0% | 63.3% | yes / yes |
| Nagaland 2018 | 60 | 28.3% | 26.7% | 41.7% | yes / yes |
| Odisha 2000 | 147 | 19.7% | 17.0% | 21.8% | no / no |
| Odisha 2004 | 147 | 56.5% | 66.7% | 51.0% | yes / no |
| Odisha 2014 | 147 | 66.0% | 62.6% | 70.1% | yes / yes |
| Odisha 2019 | 146 | 65.1% | 64.4% | 67.1% | yes / yes |
| Puducherry 2001 | 30 | 50.0% | 46.7% | 53.3% | yes / yes |
| Puducherry 2006 | 30 | 43.3% | 36.7% | 40.0% | no / no |
| Puducherry 2016 | 30 | 43.3% | 50.0% | 46.7% | no / no |
| Puducherry 2021 | 30 | 30.0% | 36.7% | 26.7% | no / no |
| Punjab 2002 | 117 | 37.6% | 44.4% | 49.6% | no / yes |
| Punjab 2007 | 116 | 31.0% | 43.1% | 35.3% | no / yes |
| Punjab 2017 | 117 | 36.8% | 49.6% | 62.4% | yes / yes |
| Punjab 2022 | 117 | 26.5% | 29.9% | 16.2% | no / no |
| Rajasthan 2003 | 200 | 29.5% | 36.0% | 53.0% | no / yes |
| Rajasthan 2013 | 200 | 35.5% | 37.5% | 35.5% | no / no |
| Rajasthan 2018 | 199 | 41.7% | 47.7% | 44.7% | no / no |
| Sikkim 2004 | 28 | 71.4% | 64.3% | 96.4% | yes / yes |
| Sikkim 2014 | 32 | 68.8% | 68.8% | 68.8% | yes / yes |
| Sikkim 2019 | 32 | 59.4% | 59.4% | 59.4% | no / no |
| Tamil_Nadu 2001 | 234 | 21.4% | 20.9% | 53.8% | no / yes |
| Tamil_Nadu 2006 | 234 | 37.6% | 32.1% | 38.5% | no / no |
| Tamil_Nadu 2016 | 232 | 48.7% | 50.9% | 49.1% | yes / yes |
| Tamil_Nadu 2021 | 232 | 52.6% | 48.7% | 52.6% | no / yes |
| Telangana 2018 | 119 | 53.8% | 57.1% | 67.2% | yes / yes |
| Tripura 2003 | 60 | 75.0% | 53.3% | 71.7% | yes / yes |
| Tripura 2008 | 60 | 73.3% | 63.3% | 83.3% | yes / yes |
| Tripura 2018 | 60 | 25.0% | 16.7% | 26.7% | no / no |
| Uttar_Pradesh 2002 | 402 | 23.6% | 20.1% | 25.1% | no / no |
| Uttar_Pradesh 2007 | 403 | 36.2% | 39.0% | 39.7% | no / no |
| Uttar_Pradesh 2017 | 403 | 20.8% | 22.8% | 53.8% | no / yes |
| Uttar_Pradesh 2022 | 403 | 68.0% | 64.3% | 63.8% | yes / yes |
| Uttarakhand 2007 | 69 | 50.7% | 43.5% | 49.3% | yes / yes |
| Uttarakhand 2017 | 70 | 48.6% | 47.1% | 85.7% | yes / yes |
| Uttarakhand 2022 | 70 | 67.1% | 65.7% | 65.7% | yes / yes |
| West_Bengal 2001 | 294 | 63.6% | 54.1% | 66.7% | yes / yes |
| West_Bengal 2006 | 294 | 68.0% | 57.5% | 74.8% | yes / yes |
| West_Bengal 2016 | 294 | 67.3% | 54.1% | 74.8% | yes / yes |
| West_Bengal 2021 | 294 | 55.8% | 45.6% | 69.7% | yes / yes |
