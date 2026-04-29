# Test Plan: Frontend Tooling Evaluation

**Date:** 2026-04-28
**Source:** [Full Analysis](../analysis/2026-04-28-frontend-tooling-evaluation.md)

---

## Prediction Engine Tests (Expand existing 27 tests)

- **Golden-value numerical assertions:** Known election input data → manually verified expected output (seat totals, vote shares); assert exact values, not just "not NaN"
- **NaN propagation:** Constituency with missing vote_share_percentage → verify defined behavior (error or zero, not NaN)
- **Boundary conditions:** Zero vote share for all candidates; single-candidate constituency; maximum constituency count (UP 403)
- **applyNewParty mutation:** Verify original constituency data is not modified (deep equality check on input before/after)
- **aggregateResults expansion:** Already has 6 tests; add empty constituency array, all-zero results, rounding edge cases
- **Full-chain integration:** generateBaseline → applyNewParty → aggregateResults as used in App.jsx

## API Client Tests (New — src/__tests__/api.test.ts)

- **Cache TTL:** Second call within 5 minutes returns cached response without fetch; call after expiry fetches again
- **Cache key differentiation:** Different parameters produce different cache entries
- **Request deduplication:** Two concurrent calls to same endpoint produce one fetch
- **Error handling:** Mock 400, 401, 403, 404, 500 responses; verify appropriate Error thrown with status
- **JSON parse failure:** Non-JSON response body → meaningful error
- **CSRF headers:** Cookie with csrf_token → correct header extracted; malformed cookie → graceful handling
- **authHeaders edge cases:** Empty token, null token, unavailable localStorage
- **Token management:** setToken/getToken roundtrip with localStorage

## Context Provider Tests

- **AuthContext:** Initial state (user null, loading true); login sets user+token; logout clears both; linkGoogle updates user; useAuth outside provider throws
- **StateContext:** Default state is Tamil_Nadu; selectState persists to localStorage; state change resets electionType to AE; states validated against API response

## Component Tests (Lower priority, written during .tsx migration)

- **NationalDashboard:** Tab navigation renders correct sub-view; data loading on tab change
- **PredictionPanel:** Input changes propagate through callback chain
- **ConstituencyDetail:** Handles missing candidates, zero votes, null fields without crashing

## CI Pipeline Tests

- **Bun version consistency:** CI, Docker, Vercel all use same pinned Bun version
- **tsc --noEmit:** Zero type errors in CI
- **Prettier --check:** All files pass format check
- **ESLint with TypeScript rules:** .ts/.tsx files are linted
- **Type sync validation:** CI script catches field name divergence between Python models and TS interfaces

## Regression Tests

- Any bug fixed in prediction engine, API client, or contexts gets a reproducing test case before the fix
