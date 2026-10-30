# Amendment 1 to the pre-registration: data source

Written 2026-10-30, after the predictions were frozen (`PREREGISTRATION.md`, SHA-256 `b6d991fd…ea321db`) and **before** the result pages described here were downloaded. This amendment changes only where the results come from and how they are mapped onto TCPD conventions. The predictions, models, hypotheses and metrics are unchanged.

## Why
- TCPD could not be reached from this machine on 2026-10-30. Lok Dhaba refused HTTPS on port 443, and tcpd.ashoka.edu.in timed out.
- The ECI results portal has taken down its archived election pages: every 2023–2026 folder returns 404.
- The Internet Archive (web.archive.org) holds copies of ECI's counting-day pages for all 20 elections.

## What the analyst saw after the freeze and before this amendment
- **Web search snippets** while looking for sources showed headline seat figures for Bihar 2025 and Delhi 2025.
- **One sample page** showed the full vote table for a single Haryana 2024 seat (AC 20, Indri). It was fetched to learn the page layout.

Neither can affect the frozen predictions, which are hashed.

## New source
- **Pages:** ECI "state-wise" result pages (`statewise<STATECODE><page>.htm`) in these folders:
  - `AcResultGenDecNew2023`
  - `AcResultGenJune2024`
  - `AcResultGen2ndJune2024`
  - `AcResultGenOct2024`
  - `ResultAcGenNov2024`
  - `ResultAcGenFeb2025`
  - `ResultAcGenNov2025`
  - `ResultAcGenMay2026`
- **What they give:** each seat's number, name, winning (leading) candidate and party, runner-up and party, margin and status.
- **Snapshot choice:** for every page, the **latest** Internet Archive snapshot is used. Snapshots taken during counting can show leads instead of results.
- **Raw files:** every fetched page is kept unchanged in `new_data_raw/eci/pages/`, with the snapshot timestamp in the file name.

## Rules added
1. **Declared seats only.** A seat counts only if its status in the latest snapshot reads as declared ("Result Declared" or equivalent wording). Seats still showing a lead are excluded, and their number is reported per state.
2. **Year.** The target year is the counting year: 2023, 2024, 2025 or 2026.
3. **Party names.** ECI full party names map to TCPD codes using the fixed table in `05_convert_eci.ts`.
   - Mapping is by **legal identity**: a name maps to an old code only when it is the same registered party name.
   - Factions registered under new names, for example "Shiv Sena (Uddhav Balasaheb Thackeray)" or "Nationalist Congress Party – Sharadchandra Pawar", keep their own new labels. Under rule 3 of the pre-registration, seats they win count as misses for every model.
   - Names not in the table keep the ECI name. The list of unmapped names is reported. If a name is plainly the same registered party as a code in the table (spelling or punctuation differences only), it may be added, and every such addition is listed in the results.
4. **Seat matching.** ECI pages do not carry TCPD's DelimID, so matching uses the assembly constituency **number**.
   - A state is scored at seat level only if:
     - its seat count equals the base election's seat count, and
     - at least 90% of numbered seats have similar names (normalised character-bigram similarity ≥ 0.5) between the base TCPD name and the ECI name.
   - Otherwise boundaries are treated as changed, and the state is scored on seat totals only.
   - Matched seats take the base TCPD constituency name, so the unchanged `04_score.ts` can score them.
5. **Unchanged scoring.** The converted file is written in TCPD column format, and `04_score.ts` runs on it unchanged (its hash is in the pre-registration).

## Hashes
Recorded in `AMENDMENT-1.sha256` before any state-wise page is downloaded.
