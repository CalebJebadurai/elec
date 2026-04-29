# Test Plan: Indian Election Analytics Platform

**Date:** 2026-04-27  
**Source:** [Full Analysis](../analysis/2026-04-27-elec-platform-improvement.md)

---

## Unit Tests

### Prediction Engine (predictionEngine.js) — Target: 70% Phase 1, 100% Phase 5
- generateBaseline: anti-incumbency redistribution (70/30 split), vote share normalization, winner determination
- applyNewParty: vote conservation, affinity presets (ruling/opposition/neutral), per-constituency overrides
- aggregateResults: seat counts, flipped constituency detection, hung assembly threshold
- Edge cases: zero votes, single candidate, 100% turnout, 0% turnout, large electorate floating-point

### Backend API (pytest) — Target: 50% Phase 1, 80% Phase 5
- Stats summary, constituencies list, constituency swing, prediction data, health check
- Auth flow: valid/invalid Firebase tokens, JWT claims, expired JWTs
- Bookmark CRUD: create, list, public feed, voting, deletion
- Razorpay webhooks: signature verification (security-critical), subscription lifecycle, idempotency
- CSRF: reject missing/mismatched tokens, accept valid tokens

## Integration Tests
- Full auth flow: Firebase OTP → JWT → API request → logout
- Bookmark lifecycle: create → publish → community feed → vote → delete
- Auth boundary (Step 2.1): all 16 endpoints accessible without auth, prediction_data still requires auth
- Subscription lifecycle: signup → Razorpay checkout → webhook → tier upgrade → feature access → lapse → downgrade
- API key + JWT: both auth paths reach same endpoints correctly

## End-to-End Tests (Playwright)
- **Environment:** Docker Compose (FastAPI + PostgreSQL with Tamil Nadu seed data + Vite); Firebase mocked; Razorpay test mode
- Anonymous browsing: homepage → state overview → constituency list → constituency detail
- Prediction flow: login → prediction panel → adjust sliders → save bookmark → verify in My Bookmarks
- Community flow: browse feed → view prediction → vote → verify count
- Subscription flow: pricing page → Razorpay checkout (test mode) → verify Pro features
- API key flow: generate key → API request → verify response → verify usage counter

## Performance Tests
- Prediction engine: < 500ms for UP (403 constituencies) on mid-range Android
- National aggregation CTEs: < 2s cold start, < 500ms warm cache
- CSV export: 50K rows without timeout (streaming response)
- Webhook handler: 50 concurrent signed webhooks without deadlocks

## Regression Tests
- Prediction vote conservation after any applyNewParty changes
- Community feed sort ordering after schema changes
- Auth flow after JWT cookie migration
- Multi-state display after data quality fixes
