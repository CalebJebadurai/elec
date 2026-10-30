# Swing model EDA

Pairs of consecutive general assembly elections with unchanged boundaries, targets 1977–2023: **234**.

## 1. Does the largest party lose votes next time?

| Target years | Elections | Largest party mean swing (pts) | SD | Share losing votes | Share losing seat lead |
|---|---|---|---|---|---|
| 1977–1989 | 65 | -12.5 | 19.6 | 66% | 58% |
| 1990–1999 | 61 | -7.7 | 11.9 | 70% | 49% |
| 2000–2009 | 45 | -3.1 | 8.5 | 67% | 58% |
| 2010–2023 | 63 | -4.4 | 9.3 | 70% | 56% |
| 1977–2023 | 234 | -7.3 | 14.0 | 68% | 55% |

## 2. State-wide swing of parties with ≥3% (party-election rows)

Rows: 963. Mean swing -3.06 pts, SD 10.6.

| Signal known before the election | Rows | Correlation with swing |
|---|---|---|
| Base vote share (size) | 963 | -0.21 |
| Is the largest party (0/1) | 963 | -0.20 |
| Trend: base share minus the share one election earlier | 941 | -0.32 |
| Lok Sabha signal: latest LS share in between minus base share | 851 | 0.58 |

Known only after the election (used for slider effects, not for default forecasts):

| Signal | Rows | Correlation with the largest party's swing |
|---|---|---|
| Turnout change (pts) | 229 | -0.03 |
| Electorate growth (%) — new-voter proxy | 229 | -0.11 |

## 3. Seat level: the ceiling if the state swing were known exactly

Seats in matched pairs: 34296.

| Rule | Seat winners right |
|---|---|
| Same party wins again | 40.7% |
| Base result + exact state swing, uniform (pts) | 52.3% |
| Base result + exact state swing, proportional | 53.1% |

A party's seat swing has SD 14.8 pts; after removing its exact state swing, SD 12.4 pts. So 30% of seat-level variance is the state-wide swing.

**Reading:** the state-wide swing is the one big shared driver: knowing it exactly lifts seat accuracy by about 12 points over persistence, and no seat-level formula can see it. The rest is seat-level noise (candidates, local alliances), which can only be expressed as uncertainty. The model should forecast the state swing with honest error bars and let sliders move it.
