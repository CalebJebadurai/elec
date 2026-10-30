# Swing model for the Lok Sabha: rolling backtest

| Year | States | Seats | Same party again | Swing model | Gain | 80% ranges held | BJP seats: forecast / actual | INC seats: forecast / actual | Largest party (national) |
|---|---|---|---|---|---|---|---|---|---|
| 1996 | 23 | 531 | 48.4% | 48.4% | 0.0 | 87.2% | 103 / 159 | 226 / 133 | INC / BJP |
| 1998 | 23 | 534 | 49.1% | 51.1% | 2.1 | 88.2% | 150 / 179 | 187 / 138 | INC / BJP |
| 1999 | 23 | 534 | 50.6% | 47.2% | -3.4 | 90.5% | 163 / 181 | 159 / 109 | BJP / BJP |
| 2004 | 23 | 504 | 44.6% | 46.6% | 2.0 | 90.1% | 147 / 124 | 149 / 134 | INC / INC |
| 2014 | 26 | 534 | 40.1% | 47.6% | 7.5 | 72.3% | 114 / 278 | 164 / 43 | INC / BJP |
| 2019 | 26 | 517 | 64.8% | 52.0% | -12.8 | 93.0% | 157 / 297 | 132 / 47 | BJP / BJP |
| 2024 | 25 | 513 | 60.8% | 56.5% | -4.3 | 88.6% | 197 / 226 | 95 / 92 | BJP / BJP |
| **All** | | **3667** | **51.1%** | **49.9%** | **-1.2** | **87.2%** | | | |

Gain by election: 0.0, 2.1, -3.4, 2.0, 7.5, -12.8, -4.3 points. Positive in 3 of 7.

## Decision: not shipped

The gate was set before running: beat persistence on seats, with 80% ranges holding for 70–90% of parties. The ranges pass (87.2%), but seat accuracy fails: 49.9% against 51.1% for "same party wins again", better in only 3 of 7 elections.

The misses are national waves. In 2014 and 2019 the BJP's seats were far above the forecast (114 vs 278, 157 vs 297). State-level history and assembly results do not carry that signal, so no within-state model trained this way can see it.

No variants were tried after this result. With seven elections, searching for one that passes would fit noise. A real Lok Sabha forecast needs a national signal, such as polls, and a new pre-registered test. The app keeps returning "not available" for Lok Sabha predictions.
