# Implementation Plan: Indian Election Analytics Platform — Quality Improvement and Monetization

**Date:** 2026-04-27  
**Source:** [Full Analysis](../analysis/2026-04-27-elec-platform-improvement.md)  
**Assumption:** Full-time development. Double all timelines if part-time.

---

## Phase 0: Legal and Compliance Prerequisites (Week 0)

- **Step 0.1:** Resolve TCPD data licensing for commercial use (blocking prerequisite for monetization; Phases 1-2 may proceed without resolution)
- **Step 0.2:** Draft and publish DPDP-compliant privacy policy
- **Step 0.3:** Draft and publish terms of service (deferrable)
- **Step 0.4:** Decide on open-core licensing model (deferrable — recommended: open-core with private repo for premium features)

## Phase 1: Security and Quality Foundation (Weeks 1-3)

- **Step 1.1:** Fix SSL certificate verification in database.py (verify Railway cert chain first)
- **Step 1.2:** Implement Alembic database migrations (refactor init.sql: schema → Alembic, data loading → seed scripts)
- **Step 1.3:** Add pytest backend test infrastructure + initial tests (50% coverage of routes.py, auth_routes.py)
- **Step 1.4:** Add vitest frontend tests for predictionEngine.js (70% branch coverage in Phase 1; 100% in Phase 5)
- **Step 1.5:** Set up UptimeRobot + Sentry monitoring (NON-NEGOTIABLE)
- **Step 1.6:** Migrate JWT from localStorage to httpOnly cookies with CSRF double-submit protection (deferrable)
- **Step 1.7:** Fix client IP identification (X-Forwarded-For with TRUSTED_PROXIES validation) (NON-NEGOTIABLE)
- **Step 1.8:** Make database connection pool sizes configurable via env vars

## Phase 2: Growth Enablement (Weeks 4-6)

- **Step 2.1:** Remove auth wall — backend: change `Depends(require_user)` → `Depends(get_current_user)` on 16 read-only endpoints (keep `prediction_data` authenticated); frontend: remove RequireAuth from public routes
- **Step 2.2:** Add Open Graph meta tags with cached image generation (deferrable — text-only OG tags as MVP)
- **Step 2.3:** Make prediction panel mobile-responsive (replace fixed 320px sidebar)
- **Step 2.4:** Add 300ms debouncing to search/filter inputs
- **Step 2.5:** Set up privacy-respecting analytics (Plausible/Umami) (deferrable)

## Phase 3: Minimum Viable Monetization (Weeks 7-12)

- **Step 3.1:** Extend user model with tiers (free/pro/enterprise), subscriptions table, api_keys table (bcrypt hashing)
- **Step 3.1a:** Implement API versioning (/v1/ prefix on all routes)
- **Step 3.2:** Implement tier-based access control as FastAPI dependency (require_tier factory)
- **Step 3.3:** Integrate Razorpay (webhook signature verification MANDATORY, idempotent processing, subscription lifecycle: grace periods, proration, refunds)
- **Step 3.3a:** Complete PCI DSS SAQ A (deferrable to first month of live payments)
- **Step 3.3b:** Implement payment rollback/error handling (admin override endpoint)
- **Step 3.4:** Build Pro-tier gated features (minimum: CSV export + API key management)
- **Step 3.5:** Implement batched async usage metering (Redis or in-memory counters, 5-min flush to PostgreSQL)
- **Step 3.6:** Implement DPDP compliance mechanisms (data deletion, export, consent)

## Phase 4: Data Coverage Expansion (Weeks 13-16)

- **Step 4.1:** Validate and fix multi-state data quality (audit for Tamil Nadu-specific assumptions)
- **Step 4.2:** Expand alliance/party config for 5 priority states (Maharashtra, Karnataka, West Bengal, UP, Gujarat)
- **Step 4.3:** Build comprehensive data ingestion pipeline (validation → normalization → upsert → transactional rollback)
- **Step 4.4:** Integrate data science model insights into production prediction engine (deferrable)

## Phase 5: Platform Hardening (Weeks 17-20)

- **Step 5.1:** Replace in-memory caching with Redis
- **Step 5.2:** Replace in-memory rate limiting with Redis-backed sliding window
- **Step 5.3:** Add structured JSON logging with correlation IDs (deferrable)
- **Step 5.4:** Increase test coverage to 80% + prediction engine to 100% + Playwright E2E
- **Step 5.5:** Migrate to paid infrastructure when MRR > $500 or users > 2000
- **Step 5.6:** Set up CI/CD pipeline (GitHub Actions: pytest, vitest, eslint, ruff)

## Phase 6: Revenue Expansion (Weeks 21-26)

- **Step 6.1:** Build embeddable election widgets (iframe-based, branded)
- **Step 6.2:** Implement prediction accuracy tracking + leaderboards
- **Step 6.3:** Launch Business tier (₹4,999/mo) for media houses
- **Step 6.4:** Establish tiered customer support operations
- **Step 6.5:** List API on RapidAPI marketplace

---

## Key Dependencies

- Phase 0 TCPD licensing → blocks Phase 3 (not Phases 1-2)
- Phase 1 must substantially complete → before Phase 2
- Step 2.1 requires BOTH frontend + backend changes
- Phase 3 depends on Steps 1.2 (Alembic) and 1.3 (tests)
- Phase 5 Redis → can begin during Phase 3
- Phase 6 → depends on Phase 3 subscriptions + Phase 4 data
