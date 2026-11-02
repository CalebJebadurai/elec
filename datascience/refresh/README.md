# Data refresh: 2023–26 assembly elections and the 2024 Lok Sabha

The local TCPD dump (2026-04-30) stops at mid-2023 for assemblies and 2019 for the Lok Sabha. This folder brings in newer results from the **Election Commission of India's statistical reports**: the public listing at `eci.gov.in/eci-backend/public/api/election-result?category_id=N`, which ECI's own report pages call.

## Coverage
- **Assembly:** 19 of the 20 elections held from Nov 2023 to May 2026. **Chhattisgarh 2023** is not published on ECI's site yet, so its forecasts still start from 2018.
- **Lok Sabha 2024:**
  - candidate results for all 542 contested seats (Surat was unopposed)
  - party votes in each of 4,134 assembly segments
  - electors and voters by gender

## Pipeline
```bash
python3 -I fetch_eci_reports.py     # downloads XLSX into raw/eci/<category>_<state>/ (needs curl)
# XLSX -> CSV (legacy .xls files need xlrd: PYTHONPATH=<xlrd wheel>)
for f in raw/eci/*/*.xlsx; do python3 xlsx2csv.py "$f" "${f%.xlsx}.csv"; done
bun build_ae.ts                     # raw/ae_2023_26_tcpd.csv + results/01_ae_validation.md
bun build_ls.ts                     # raw/ge_2024_tcpd.csv, raw/ls2024_segments.csv
bun to_ingest.ts                    # raw/ingest_*.csv in api/ingest.py's column layout
```
Like the TCPD dumps, the outputs are not committed: the repo's `.gitignore` excludes `*.csv.gz` and `raw/`. Local gzipped copies live in `data/ECI_*.csv.gz`. To load them into a database:
```bash
python ../../api/ingest.py --file raw/ingest_ae_2023_26.csv
python ../../api/ingest.py --file raw/ingest_ge_2024.csv
```
Then restart the API, because it caches election years in memory.

## Validation (`results/01_ae_validation.md`)
- **Internal:** every seat's vote shares sum to 100.00%. Seat counts match each house, except Arunachal Pradesh, where the 10 seats won unopposed have no contest.
- **Independent source:** winners were compared with the counting-day pages saved by the Internet Archive (`../backtest`) for about 2,700 seats. Every disagreement is the same party written two ways (a full name against ECI's abbreviation). **No seat has a different winner.**
- **Lok Sabha:** party votes summed over assembly segments equal each constituency's EVM votes for all 4,969 party–constituency pairs. National shares come out at BJP 36.56% and INC 21.19%.

## Conventions and judgement calls
- **Party codes:** ECI abbreviations are mapped to TCPD codes only when they are the same registered party (`CODE_MAP` in `build_ae.ts`): BHRS→TRS, CPI(M)→CPM, RLTP→RaLtP, ASMJTYP→AJP, TTPty→Twenty 20 Party, JKPDFS→JKPDF, AMMKMNKZ→AMMK. TCPD itself writes AAP/AAAP and CPIM/CPM both ways, so `normalizeParty` now merges them. Factions and new parties keep ECI's codes, for example SHSUBT, NCPSP, LJPRV, TVK and ZPM.
- **Boundaries:** a state keeps its base DelimID when at least 90% of seat names match by number. Assam (2023) and Jammu & Kashmir (2022) were redrawn and get a new ID.
- **Sitting MLA terms:** TCPD's `No_Terms` is not in ECI reports. A winner whose name matches the same seat's previous winner continues that count; anyone else starts at 1. This undercounts MLAs who changed seats.
- **Turnout:** stored here as valid votes over electors, while TCPD uses all voters over electors. The difference is under one point.
- **Namesakes:** candidates with the same name in one seat are real. Only in the ingest file, the second and later ones get a ` [n]` suffix, because the database's unique index includes the name.

## Licence and attribution
The source is the Election Commission of India statistical reports. India Data Portal's ODC-By copy of the 2019/2024 Lok Sabha results was used for exploration only.
