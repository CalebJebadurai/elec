# Implementation Report: Indian Election Analytics Platform — Quality Improvement and Monetization

**Date:** 2026-04-28  
**Source Plan:** [Strategic Analysis](../analysis/2026-04-27-elec-platform-improvement.md)  
**Phase Summary:** [Phase Overview](2026-04-27-elec-platform-improvement-phases.md)  
**Assumption:** Full-time development. Double all timelines if part-time.

---

## 1. Implementation Overview

This report translates the finalized strategic plan for the "elec" Indian election analytics platform into a granular, step-by-step implementation guide spanning seven phases and approximately twenty-six weeks of full-time development. The initiative transforms the platform from a technically fragile free tool with zero test coverage into a reliable, commercially operated analytics service with sustainable revenue streams.

The codebase is organized as a three-tier monorepo: a FastAPI backend in `api/`, a React 19 frontend in `frontend/`, and a PostgreSQL 16 database bootstrapped by `init.sql`. Supporting infrastructure includes Docker Compose for local development, Terraform for GCP deployment in `infra/terraform/`, Nginx reverse proxy configuration in `nginx/`, seed scripts in `infra/`, and a data science Jupyter environment in `datascience/`. The implementation touches all three tiers and adds new cross-cutting concerns including payment processing, subscription management, API key authentication, usage metering, and compliance mechanisms.

The work is organized into seven phases: Phase 0 (legal prerequisites), Phase 1 (security and quality foundation), Phase 2 (growth enablement), Phase 3 (minimum viable monetization), Phase 4 (data coverage expansion), Phase 5 (platform hardening), and Phase 6 (revenue expansion). Each phase delivers a deployable increment, and phases are scoped with defined must-ship and can-defer boundaries to support informed scope-cutting under time pressure.

---

## 2. Technology Stack Summary

**Backend (api/):** FastAPI 0.115.12 running on Uvicorn 0.34.2 with asyncpg 0.30.0 for async PostgreSQL connectivity. Authentication uses PyJWT for token creation and verification, with Firebase Phone Auth on the client side verified against Google's public keys fetched via httpx. The backend is structured around four router modules — `routes.py` (election data endpoints), `auth_routes.py` (OTP verification and Google linking), `bookmark_routes.py` (prediction bookmark CRUD and voting), and `national_routes.py` (cross-state aggregation endpoints). All routers are mounted in `main.py` with middleware chains for rate limiting (`RateLimitMiddleware`), security headers (`SecurityHeadersMiddleware`), GZip compression, and CORS. The dependency injection pattern uses FastAPI's `Depends()` consistently — `get_current_user` returns the decoded JWT or None, while `require_user` raises HTTP 401 if unauthenticated. Response caching uses in-memory Python dictionaries with TTL (five minutes for election data, one hour for national aggregations). The API uses Pydantic models defined in `models.py` for request/response validation.

**Frontend (frontend/):** React 19.2.4 with Vite 8.0.4 as the build tool, react-router-dom 7.14.1 for routing, Recharts 2.15.3 for data visualization, react-simple-maps 3.0.0 for the India map visualization, and Firebase 11.x for phone authentication. State management uses React Context — `AuthContext.jsx` manages user session state and `StateContext.jsx` manages state selection and election type toggling. Components are lazy-loaded via `React.lazy()` with `Suspense` fallbacks. The prediction engine lives in `frontend/src/engine/predictionEngine.js` as three pure functions: `generateBaseline`, `applyNewParty`, and `aggregateResults`. The frontend API client in `api.js` uses localStorage for JWT token storage, includes an in-memory request cache with deduplication, and communicates with the backend through a Vite dev proxy (rewriting `/api` to the backend). CSS is in a single `index.css` file using CSS custom properties for theming, with a dark theme as default. No CSS framework or preprocessor is used. No testing framework is currently installed.

**Database:** PostgreSQL 16 (Alpine image in Docker). The schema is defined in `init.sql` with a single main table `tcpd_ae` containing forty-eight columns of election data, plus `users`, `bookmarks`, and `votes` tables for social features. The database includes extensive indexing (composite indexes for state/year/position queries, trigram index for candidate search). A unique constraint on `(state_name, year, constituency_no, candidate, poll_no, election_type)` prevents duplicate entries. The `users` table has a `role` column constrained to `'user'` or `'admin'`. No migration system exists — schema is applied directly via `init.sql` and auto-create logic in `main.py`'s lifespan handler.

**Infrastructure:** Docker Compose orchestrates local development with services for db, api, frontend, jupyter (dev profile), and nginx (prod profile). The api container builds from `api/Dockerfile`, the frontend from `frontend/Dockerfile` with a configurable build target. Terraform in `infra/terraform/` defines a complete GCP deployment with Cloud SQL (PostgreSQL 16 with HA), Cloud Run for the API, Secret Manager for credentials, Artifact Registry for Docker images, and a VPC with private networking. Railway is used for the current production deployment (`railway.toml` files in root and api/). Vercel is used for frontend hosting (`vercel.json` in frontend/).

**Notable Conventions:** Party name normalization is implemented in both backend (`_PARTY_ALIASES` dict in `routes.py`) and frontend (`normalizeParty` function in `constants.js`). Pydantic field validators are used for input sanitization in request models. The backend uses raw SQL queries with parameterized values via asyncpg (no ORM). All endpoints follow a consistent pattern: check cache, acquire pool, execute query, map results, set cache, return. Error responses use FastAPI's `HTTPException`. The frontend uses a consistent component pattern: lazy-loaded functional components with hooks for state and effects.

---

## 3. Phase-by-Phase Implementation

### Phase 0: Legal and Compliance Prerequisites (Week 0)

#### Phase Header

Phase 0 resolves blocking legal and regulatory questions before any development work begins. It delivers the legal foundation required for commercial operation: data licensing clarity, a privacy policy, terms of service, and a licensing model decision. This phase has no technical dependencies and can execute while setting up the development environment.

#### Prerequisites

No technical prerequisites. The developer needs access to TCPD contact information (available via the Ashoka University website), familiarity with India's Digital Personal Data Protection Act 2023, and a domain for hosting legal documents.

#### Step-by-Step Breakdown

**Step 0.1: Resolve TCPD data licensing for commercial use**

What to do: Draft a brief document explaining the platform's intended commercial use — an analytics service with full TCPD attribution, not data resale — and send it to the Trivedi Centre for Political Data at Ashoka University. The document should describe the platform, the attribution model (already present in the footer of `frontend/src/App.jsx` where TCPD is credited with a direct link), and the three possible outcomes: explicit permission, commercial license requirement, or denial requiring a fallback to direct Election Commission of India source data.

Where to do it: Create a new document at `_architect/legal/tcpd-licensing-request.md` containing the outreach letter and tracking the response. No code changes are required in this step.

How it connects: This step gates all of Phase 3 (monetization). Phases 1 and 2 involve no commercial activity and may proceed regardless of licensing status. If TCPD has not responded within two weeks, proceed with Phases 1-2 while documenting the outstanding risk. If TCPD ultimately denies commercial use, the fallback is building an independent data pipeline from ECI source documents, which would be executed concurrently with Phase 3.

What to watch out for: The data in `init.sql` is loaded from CSV files (`TCPD_AE_All_States_2026-4-20.csv` and `TCPD_GE_All_States_2026-4-20.csv`) that are TCPD-sourced. Even the column naming convention follows TCPD's schema. The fallback pipeline would need to produce data in the same schema to avoid breaking all existing queries.

Verification: The step is complete when outreach has been sent and a response tracking mechanism is in place. Resolution is not required to proceed to Phase 1.

**Step 0.2: Draft and publish a DPDP-compliant privacy policy**

What to do: Create a privacy policy document covering all personal data the platform collects. Currently, the `users` table in `init.sql` stores: `mobile` (phone number, the primary identifier), `display_name`, `google_id`, `google_email`, `avatar_url`, `date_of_birth`, and timestamps. The privacy policy must cover: what personal data is collected and why, the legal basis for processing (consent via opt-in at registration), purpose limitation (authentication and service improvement only), data retention period, data subject rights under DPDP (access, correction, deletion), and the data fiduciary's contact information.

Where to do it: Create a new React component at `frontend/src/components/PrivacyPolicy.jsx` that renders the privacy policy content. Add a new route in `frontend/src/App.jsx` at the path `/privacy` that renders this component without requiring authentication (it must be publicly accessible). Add a link to the privacy policy in the footer section of `App.jsx`, alongside the existing TCPD attribution and source code links. The footer is located at the bottom of the App component's return statement, in the `<footer className="app-footer">` element.

How it connects: The privacy policy route must be added to the `<Routes>` section in `App.jsx` without a `RequireAuth` wrapper. The footer link must be visible to all users regardless of authentication state.

What to watch out for: The privacy policy must be drafted with Indian legal requirements in mind, not generic GDPR templates. The DPDP Act 2023 has specific requirements for consent mechanisms and data fiduciary obligations. The developer should consult a privacy policy template adapted for Indian law or engage a legal professional.

Verification: The privacy policy is accessible at `/privacy` without authentication, contains all required DPDP elements, and is linked from the footer and (eventually) the registration flow.

**Step 0.3: Draft and publish terms of service**

What to do: Create a terms of service document that includes: service description, acceptable use policy, a prominent disclaimer that prediction simulations are mathematical models and not electoral forecasts (extending the existing disclaimer text found in the `Disclaimer` component and the footer of `App.jsx`), limitation of liability, intellectual property rights with TCPD attribution, subscription terms, and governing law (Indian jurisdiction). The terms must explicitly state that the prediction simulator is not an exit poll under the Representation of the People Act.

Where to do it: Create `frontend/src/components/TermsOfService.jsx` as a new component. Add a `/terms` route in `App.jsx` without `RequireAuth`. Add a footer link alongside the privacy policy link.

How it connects: Terms of service are referenced by the subscription flow in Phase 3 — users must agree to terms before purchasing a subscription.

Verification: The terms page is accessible at `/terms` without authentication and contains all required legal elements.

**Step 0.4: Evaluate and decide on open-core licensing model**

What to do: The current `LICENSE` file uses MIT, which permits unrestricted forking and commercial use by competitors. Decide between three options: (a) maintain MIT for everything and accept fork risk, (b) adopt open-core with MIT for the base platform and a new private repository for premium features (subscription management, usage metering, embeddable widgets), or (c) relicense to BSL 1.1 before the platform gains visibility.

Where to do it: If option (b) is chosen, create a new private GitHub repository for premium feature code. Update the `README.md` to clarify the licensing model. No code changes to the existing repository are required in this step.

How it connects: This decision affects the repository structure for Phase 3 onward. If open-core is chosen, premium feature files (payment routes, subscription models, API key management) live in the private repository and are deployed as a separate module or package that the main API imports.

What to watch out for: The open-core approach adds development complexity — two repositories must stay in sync, and the deployment pipeline must combine code from both sources. The simplest implementation is a Python package in the private repo that gets installed as a dependency in the API's `requirements.txt`.

Verification: A licensing decision is documented and the chosen repository structure is set up.

#### Phase Deliverables

At the end of Phase 0: TCPD licensing outreach is initiated (resolution may be pending), a privacy policy page is live at `/privacy`, a terms of service page is live at `/terms`, both are linked from the application footer, and the licensing model decision is documented.

#### Phase Risks and Mitigations

The primary risk is TCPD denying commercial use. Mitigation: the fallback ECI data pipeline can execute concurrently with Phase 3 development, limiting the delay to four to six weeks on monetization launch rather than blocking the entire project. The secondary risk is the privacy policy being non-compliant with DPDP requirements. Mitigation: use an Indian-law-specific privacy policy template and plan for legal review before processing any payment data in Phase 3.

---

### Phase 1: Security and Quality Foundation (Weeks 1-3)

#### Phase Header

Phase 1 addresses critical security vulnerabilities and establishes minimum quality infrastructure — test suites, monitoring, and database migrations — required for confident deployment of all subsequent features. No user-facing features are added. This phase must substantially complete before Phase 2 begins, as monitoring is needed to detect issues from increased public traffic and test infrastructure is needed to verify auth boundary changes.

#### Prerequisites

Phase 0 must be initiated (licensing outreach sent), but need not be resolved. A local development environment with Docker Compose running (db, api, frontend services) is required. The developer should have accounts ready for UptimeRobot/Pingdom and Sentry.

#### Step-by-Step Breakdown

**Step 1.1: Fix SSL certificate verification in database.py**

What to do: The `_get_ssl_context()` function in `api/database.py` currently creates an SSL context with `ctx.check_hostname = False` and `ctx.verify_mode = ssl.CERT_NONE` for all non-localhost connections. This disables certificate verification entirely, creating a man-in-the-middle attack vector. The fix replaces this with proper certificate verification. Before changing the code, research Railway's PostgreSQL SSL certificate chain — determine whether Railway uses certificates signed by a recognized CA (in which case the default `ssl.create_default_context()` works without modification) or self-signed certificates (in which case the Railway CA bundle must be downloaded and explicitly trusted).

Where to do it: Modify the `_get_ssl_context()` function in `api/database.py`. The current function is approximately fifteen lines long, starting at the module level after the `DATABASE_URL` declaration. The fix changes the function to return `ssl.create_default_context()` without disabling verification, or to load a specific CA bundle via `ctx.load_verify_locations()` if Railway uses self-signed certificates. Add an environment variable `DB_SSL_CA_CERT` that, when set, points to a CA certificate file path, allowing the SSL context to be configured without code changes across environments.

How it connects: The `get_pool()` function passes the SSL context to `asyncpg.create_pool()` via the `ssl` parameter. No other files reference `_get_ssl_context()` directly.

Technology-specific guidance: The `ssl.create_default_context()` call in Python loads the system's trusted CA bundle by default, which includes all major CAs. If Railway's PostgreSQL uses Let's Encrypt or another recognized CA, removing the two lines that disable verification is sufficient. If Railway uses a custom CA, use `ctx.load_verify_locations(cafile=os.environ.get("DB_SSL_CA_CERT"))` to load it. Add a fallback environment variable `DB_SSL_VERIFY` (default `"true"`) that, when set to `"false"`, retains the current insecure behavior — this serves as an emergency rollback toggle if proper verification breaks connectivity in production.

What to watch out for: Enabling certificate verification on a production deployment that currently uses `CERT_NONE` can break database connectivity if the server's certificate is not properly signed. Deploy this change to a branch deployment or staging environment first and confirm the database connection succeeds before merging to main. The Railway documentation or support should confirm their PostgreSQL certificate chain.

Verification: The application connects to the database successfully with `verify_mode = ssl.CERT_REQUIRED` (or equivalent) in a non-localhost environment. The `CERT_NONE` lines are removed from the codebase. The `DB_SSL_VERIFY` fallback toggle exists and is documented.

**Step 1.2: Implement database migration system using Alembic**

What to do: Initialize Alembic in the `api/` directory and create an initial migration that reflects the current database schema as defined in `init.sql`. The migration path from the existing `init.sql` bootstrapping must be clearly defined: schema creation (the `CREATE TABLE` statements for `tcpd_ae`, `users`, `bookmarks`, `votes`, and all indexes) moves into Alembic's initial migration; data loading (the `COPY` commands for CSV ingestion) remains as standalone seed scripts in `infra/`; and the deduplication logic and unique index creation at the end of `init.sql` become part of the initial migration. For existing deployments, use `alembic stamp head` to mark the database as up-to-date without running the initial migration. For new deployments, `alembic upgrade head` creates the full schema, then seed scripts load data.

Where to do it: Run `alembic init` from the `api/` directory to create the Alembic directory structure: `api/alembic/`, `api/alembic/versions/`, and `api/alembic.ini`. Configure `alembic.ini` to read the `DATABASE_URL` from the environment variable (matching the existing pattern in `database.py`). Edit `api/alembic/env.py` to use asyncpg as the database driver (Alembic supports async via `run_async` configuration). Create the initial migration file in `api/alembic/versions/` that contains all the `CREATE TABLE`, `CREATE INDEX`, and `CREATE UNIQUE INDEX` statements currently in `init.sql`. Add `alembic` to `api/requirements.txt`.

How it connects: The auto-create logic in `main.py`'s lifespan handler (the inline `CREATE TABLE IF NOT EXISTS` statements) becomes redundant once Alembic manages the schema. However, the auto-create logic should be retained during the transition period — it serves as a safety net for deployments where Alembic has not yet been run. After Phase 3 (when new tables like `subscriptions` and `api_keys` are added exclusively via Alembic), the auto-create logic can be removed. Future schema changes in Phase 3 (user tiers, subscriptions table, api_keys table) will be created as new Alembic migration files.

Technology-specific guidance: Since the backend uses asyncpg (not SQLAlchemy), Alembic migrations should use raw SQL statements in the `upgrade()` and `downgrade()` functions rather than SQLAlchemy's declarative migration operations. This is consistent with the existing codebase pattern of raw SQL queries throughout `routes.py` and `national_routes.py`. The `alembic.ini` should set `sqlalchemy.url` to the `DATABASE_URL` environment variable using the `%(DATABASE_URL)s` interpolation syntax, or the `env.py` should read it directly from `os.environ`.

What to watch out for: The `init.sql` file contains both schema DDL and data loading DML (`COPY` commands). These must be cleanly separated. The COPY commands reference file paths inside the Docker container (`/data/tcpd_ae.csv`, `/data/tcpd_ae_all.csv`, `/data/tcpd_ge_all.csv`) that are only available during initial database setup. Alembic migrations must not include COPY commands. The deduplication `DELETE` statement at the end of `init.sql` is a one-time data cleanup that should be part of the initial migration's upgrade, with the downgrade being a no-op (deleted data cannot be restored).

Verification: Running `alembic upgrade head` on a fresh database creates all tables and indexes matching the current `init.sql` schema. Running `alembic stamp head` on the existing production database succeeds without error. Running `alembic downgrade -1` from the initial migration drops all tables. A new empty migration can be created with `alembic revision --autogenerate -m "test"` (though autogenerate may have limited utility without SQLAlchemy models, it confirms the tool is properly configured).

**Step 1.3: Add backend test infrastructure and initial test suite using pytest**

What to do: Create the test infrastructure from scratch — the project currently has zero test files. Set up pytest with async support, configure test database fixtures, mock the Firebase Admin SDK for auth testing, and write tests for the five most critical endpoints plus the authentication flow. Target fifty percent coverage of `routes.py` and `auth_routes.py`.

Where to do it: Create a `api/tests/` directory with the following files: `api/tests/__init__.py` (empty), `api/tests/conftest.py` (fixtures for database pool, test client, and auth mocking), `api/tests/test_health.py` (health endpoint test), `api/tests/test_routes.py` (tests for stats_summary, constituencies, constituency_swing, list_years, list_elections), `api/tests/test_auth.py` (tests for verify-otp flow with mocked Firebase), and `api/tests/test_bookmarks.py` (tests for bookmark CRUD). Add the following to `api/requirements.txt`: `pytest`, `pytest-asyncio`, `httpx` (already present, used as test client via FastAPI's `TestClient` or async HTTPX), and `pytest-cov`. Create a `api/pytest.ini` or `api/pyproject.toml` section configuring pytest with `asyncio_mode = auto`.

How it connects: The test database should use the same Docker Compose PostgreSQL instance but a separate database name (e.g., `elec_test`). The `conftest.py` fixtures should: create the test database, run Alembic migrations to set up the schema (depends on Step 1.2), load a minimal seed dataset (one state, two election years — approximately two thousand rows, sufficient for meaningful tests), provide an authenticated test client (with a valid JWT generated by `auth.create_token()`), and clean up after the test session. The test client should use FastAPI's `TestClient` or `httpx.AsyncClient` with the `app` object imported from `main.py`.

Technology-specific guidance: FastAPI testing uses `httpx.AsyncClient` with `ASGITransport` for async tests. The `conftest.py` should define a session-scoped fixture that creates the test database pool and a function-scoped or module-scoped fixture that wraps tests in a transaction and rolls back after each test (or test module) for isolation. Firebase token verification in `auth_routes.py` must be mocked — the `_get_firebase_public_keys()` function should be patched to return test keys, and test Firebase ID tokens should be pre-generated using the test keys. Alternatively, create a test-mode bypass: when the environment variable `TESTING=true` is set, the verify-otp endpoint accepts a hardcoded test phone number and skips Firebase verification.

What to watch out for: The `main.py` lifespan handler calls `get_pool()` which creates a database connection pool. Tests must either mock this or point it to the test database. The in-memory caches (`_response_cache` in `routes.py`, `_NATIONAL_CACHE` in `national_routes.py`, `_GENERAL_YEARS_CACHE`) must be cleared between tests to avoid stale data. The rate limiter stores (`_rate_store`, `_auth_rate_store` in `main.py`) must also be cleared or disabled during testing.

Verification: Running `pytest api/tests/ --cov=. --cov-report=term` from the `api/` directory executes all tests, reports coverage, and achieves at least fifty percent coverage of `routes.py` and `auth_routes.py`. All tests pass. The test database is created and destroyed cleanly.

**Step 1.4: Add frontend test infrastructure and prediction engine tests using vitest**

What to do: Install vitest and write comprehensive unit tests for the prediction engine — the platform's core differentiator. The prediction engine is a set of three pure JavaScript functions in `frontend/src/engine/predictionEngine.js` (`generateBaseline`, `applyNewParty`, `aggregateResults`) that have no external dependencies beyond `normalizeParty` from `constants.js`, making them ideal for unit testing. Target seventy percent branch coverage in Phase 1.

Where to do it: Add `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom` to `devDependencies` in `frontend/package.json`. Add a `"test"` script: `"vitest"` and a `"test:coverage"` script: `"vitest run --coverage"`. Create `frontend/vitest.config.js` (or add vitest configuration to the existing `vite.config.js` via a `test` key) with `environment: 'jsdom'`. Create `frontend/src/engine/__tests__/predictionEngine.test.js` containing tests for all three exported functions.

How it connects: The prediction engine functions are pure — they take data and parameters as inputs and return prediction results. They depend only on `normalizeParty` from `../constants`, which is also a pure function. No mocking of React, Firebase, or API calls is needed for these tests.

Technology-specific guidance: Tests for `generateBaseline` should cover: various `antiIncumbencyPct` values (0, 50, 100), verifying that vote shares are correctly redistributed with seventy percent going to the runner-up and thirty percent distributed among others, that vote shares normalize to 1.0 after redistribution, and that the winner is correctly determined from sorted vote totals. Tests for `applyNewParty` should verify: vote conservation (total votes before equals total votes after redistribution), that per-constituency overrides correctly replace statewide vote share, and that affinity presets produce expected redistribution patterns. Tests for `aggregateResults` should verify: total seat counts match constituency count, flipped constituency detection correctly identifies party changes, and the party summary is sorted by seats descending. Edge cases to cover: zero votes for a candidate, single-candidate constituencies, one hundred percent turnout, zero candidates array (testing the `emptyResult` fallback path in `generateBaseline`).

What to watch out for: The `generateBaseline` function has an early return to `emptyResult(c)` when `parties.length === 0`. This code path references an `emptyResult` function that must exist in the module — verify it does. The vote share normalization guard (`if (totalShare > 0)`) prevents division by zero but the branch where `totalShare` is zero should be tested. Floating-point arithmetic in vote share calculations can cause precision issues — tests should use approximate equality assertions (e.g., `toBeCloseTo`) rather than exact equality for percentage values.

Verification: Running `npm test` from the `frontend/` directory executes all vitest tests. Running `npm run test:coverage` reports at least seventy percent branch coverage of `predictionEngine.js`. All tests pass.

**Step 1.5: Set up external monitoring**

What to do: Register free-tier accounts with UptimeRobot (for uptime monitoring) and Sentry (for error tracking). Integrate the Sentry SDK into both the FastAPI backend and the React frontend. Configure UptimeRobot to ping the `/health` endpoint at the production URL every five minutes. Configure Sentry to capture unhandled exceptions and set up alerting for error rate spikes and downtime events.

Where to do it: For the backend, add `sentry-sdk[fastapi]` to `api/requirements.txt`. In `api/main.py`, add Sentry initialization at the top of the file (after imports, before the FastAPI app creation), reading the DSN from a `SENTRY_DSN` environment variable. The Sentry FastAPI integration automatically captures exceptions from route handlers. Add `SENTRY_DSN` to the Docker Compose environment variables for the api service in `docker-compose.yml`. For the frontend, install `@sentry/react` via npm. In `frontend/src/main.jsx`, add Sentry initialization before the React root render call. Use `Sentry.init()` with the DSN read from `import.meta.env.VITE_SENTRY_DSN`. Wrap the root component with `Sentry.ErrorBoundary` or integrate with the existing `ErrorBoundary` component at `frontend/src/components/ErrorBoundary.jsx`.

How it connects: The existing `ErrorBoundary` component in the frontend catches rendering errors and displays a fallback UI. Sentry should be integrated into this boundary so that caught errors are reported to Sentry before being displayed to the user. The backend's existing security logger (used for rate limit violations in `main.py`) can coexist with Sentry — Sentry captures unhandled exceptions while the security logger continues to log rate limit events.

What to watch out for: Sentry should not be initialized when the `SENTRY_DSN` environment variable is empty (local development). Use a guard like `if os.environ.get("SENTRY_DSN"):` before `sentry_sdk.init()`. Similarly on the frontend, check `import.meta.env.VITE_SENTRY_DSN` before initializing. Do not send personally identifiable information (phone numbers, user IDs) to Sentry — configure `before_send` to scrub sensitive data.

Verification: Trigger a test exception in the backend (e.g., a route that raises an unhandled error) and confirm it appears in the Sentry dashboard. Trigger a frontend error and confirm it appears. Confirm UptimeRobot sends alerts when the health endpoint is unreachable (briefly stop the API container to test).

**Step 1.6: Migrate JWT token storage from localStorage to httpOnly cookies**

What to do: Move JWT token storage from `localStorage` (accessible to JavaScript, vulnerable to XSS) to httpOnly cookies (inaccessible to JavaScript). This requires coordinated backend and frontend changes, plus the addition of CSRF protection since cookie-based auth introduces CSRF vulnerability.

Where to do it: On the backend, modify the `/auth/verify-otp` endpoint in `api/auth_routes.py` to set the JWT as an httpOnly, Secure, SameSite=Lax cookie on the response instead of returning it in the JSON body. The response should still include user data but no longer include the raw token. Add a new `/auth/logout` endpoint that clears the cookie. Modify `api/auth.py`'s `get_current_user` function to check both the `Authorization` header (for backward compatibility and API key access) and the cookie — read the cookie from `request.cookies.get("auth_token")` if no Authorization header is present. Implement the CSRF double-submit cookie pattern: on login, set a second non-httpOnly cookie (`csrf_token`) containing a random token value; create a new middleware class in `main.py` that, for all state-changing requests (POST, PUT, DELETE), verifies that the `X-CSRF-Token` request header matches the `csrf_token` cookie value. On the frontend, modify `frontend/src/api.js` to remove all `localStorage` token management (`_token`, `setToken`, `getToken` functions). The `authHeaders()` function changes: for cookie-based auth, the browser sends cookies automatically, so no `Authorization` header is needed for same-origin requests. However, for CSRF protection, `authHeaders()` must read the `csrf_token` cookie and include it as an `X-CSRF-Token` header on all POST/PUT/DELETE requests. Update `frontend/src/contexts/AuthContext.jsx` to remove `api.setToken(result.token)` from the login flow and `api.setToken(null)` from the logout flow — instead, login stores user data (returned in the JSON body) in state, and logout calls the new `/auth/logout` endpoint.

How it connects: This change affects the authentication flow end-to-end. The `authHeaders()` function in `api.js` is called by `get()`, `post()`, `put()`, and `del()` — all API communication flows through these functions. The CORS configuration in `main.py` already has `allow_credentials=True`, which is required for cookies to be sent cross-origin. The CSRF middleware must be added to the middleware chain in `main.py`, after the CORS middleware and before the rate limiter.

What to watch out for: The Vite dev proxy configuration in `vite.config.js` rewrites `/api` requests to the backend. Cookies set by the backend will have the backend's domain; with the proxy, they should appear as same-origin. However, in the split production deployment (Railway API + Vercel frontend), cookies require `SameSite=None; Secure` and the CORS configuration must include the frontend domain in `allow_origins`. The current CORS configuration reads `ALLOWED_ORIGINS` from an environment variable, which is correct. The CSRF token cookie must NOT be httpOnly (the frontend JavaScript needs to read it) but MUST be Secure and SameSite=Lax. The CSRF middleware should exempt GET, HEAD, and OPTIONS requests (which are safe methods). It should also exempt the `/auth/verify-otp` endpoint itself (the login request cannot have a CSRF token yet since the user is not authenticated). The `/health`, `/docs`, and webhook endpoints (Phase 3) should also be exempt.

Verification: After implementation, logging in via the frontend sets an httpOnly cookie (visible in browser DevTools under Application > Cookies but not accessible via `document.cookie`). Subsequent API requests include the cookie automatically. State-changing requests without the `X-CSRF-Token` header are rejected with 403. The existing backend tests (Step 1.3) must be updated to use cookie-based authentication in the test client.

**Step 1.7: Fix client IP identification for rate limiting**

What to do: The current rate limiter in `main.py` uses `request.client.host` to identify clients, which returns the proxy IP rather than the real client IP when behind Railway's or Vercel's load balancer. This means the rate limiter currently rate-limits all users as a single IP, making it functionally useless. Add middleware that extracts the real client IP from the `X-Forwarded-For` or `X-Real-IP` headers with appropriate security validation.

Where to do it: Modify the `RateLimitMiddleware` class in `api/main.py`. Replace the line `client_ip = request.client.host if request.client else "unknown"` with a function call to a new `_get_client_ip(request)` helper function. This helper should: check for the `X-Real-IP` header first (simplest, set by most proxies), then check `X-Forwarded-For` (comma-separated list of IPs, take the rightmost untrusted IP), and fall back to `request.client.host`. Add a `TRUSTED_PROXIES` environment variable (comma-separated CIDR ranges) that lists known proxy addresses. Only trust proxy headers when the immediate connecting IP (`request.client.host`) falls within a trusted CIDR range. For Railway deployments, Railway's proxy IP ranges should be configured. For local development without proxies, the fallback to `request.client.host` applies.

How it connects: The rate limiter is used in two places within `RateLimitMiddleware.dispatch()`: the general rate store (`_rate_store[client_ip]`) and the auth-specific rate store (`_auth_rate_store[client_ip]`). Both use the same `client_ip` variable, so fixing the IP extraction fixes both.

Technology-specific guidance: Use Python's `ipaddress` module to parse and validate CIDR ranges from `TRUSTED_PROXIES`. The `X-Forwarded-For` header can be spoofed by clients, so the implementation must only trust the rightmost IP that is not in the trusted proxy set — this is the IP of the last untrusted hop, which is the actual client. For a single-proxy deployment (Railway's load balancer), the client IP is the first entry in `X-Forwarded-For` when `request.client.host` is the proxy.

What to watch out for: If `TRUSTED_PROXIES` is not configured, the middleware should log a warning at startup and fall back to `request.client.host` (current behavior) rather than trusting all proxy headers, which would allow clients to spoof their IP. The `X-Forwarded-For` header can contain multiple IPs separated by commas and optional spaces — parse carefully. IPv6 addresses in proxy headers are valid and must be handled.

Verification: Deploy to a Railway branch deployment and confirm that rate limiting applies per-client-IP rather than globally. Locally, test by setting `X-Forwarded-For` headers and verifying the rate limiter uses the extracted IP. Confirm that spoofed `X-Forwarded-For` headers from untrusted sources are ignored.

**Step 1.8: Make database connection pool sizes configurable**

What to do: The `get_pool()` function in `api/database.py` uses hardcoded `min_size=2` and `max_size=10`. Add environment variables `DB_POOL_MIN_SIZE` (default 2) and `DB_POOL_MAX_SIZE` (default 10) to make these configurable.

Where to do it: Modify `api/database.py`. At the module level, add two lines reading environment variables with defaults: `DB_POOL_MIN_SIZE = int(os.environ.get("DB_POOL_MIN_SIZE", "2"))` and `DB_POOL_MAX_SIZE = int(os.environ.get("DB_POOL_MAX_SIZE", "10"))`. In the `get_pool()` function, replace `min_size=2` with `min_size=DB_POOL_MIN_SIZE` and `max_size=10` with `max_size=DB_POOL_MAX_SIZE`.

How it connects: The pool is created once in `get_pool()` and shared across all request handlers. No other changes are needed.

Verification: Setting `DB_POOL_MAX_SIZE=5` in the environment and restarting the API confirms the pool respects the configuration (observable in PostgreSQL's `pg_stat_activity` view showing the max connection count).

#### Phase Deliverables

At the end of Phase 1: SSL certificate verification is enabled for remote database connections; Alembic is initialized with an initial migration matching the current schema; a pytest test suite exists with fifty percent backend coverage; a vitest test suite exists with seventy percent prediction engine branch coverage; Sentry and UptimeRobot are monitoring the application; JWT cookies and CSRF protection are in place (or deferred if behind schedule); rate limiting correctly identifies client IPs behind proxies; and database pool sizes are configurable.

#### Phase Risks and Mitigations

Risk: SSL verification breaks Railway database connectivity. Mitigation: the `DB_SSL_VERIFY` environment variable provides an emergency toggle. Risk: test infrastructure setup takes longer than budgeted (estimated one to two days). Mitigation: start with the simplest possible fixture setup (a shared test database rather than per-test isolation) and improve later. Risk: JWT cookie migration introduces authentication regressions. Mitigation: this step depends on test coverage from Step 1.3 and is marked as deferrable — if Phase 1 is running long, defer it.

---

### Phase 2: Growth Enablement (Weeks 4-6)

#### Phase Header

Phase 2 removes barriers to user acquisition by making election data publicly accessible (enabling SEO indexing), adding social sharing capabilities, and making the mobile experience usable. These are the highest-ROI growth levers identified in the strategic analysis. This phase delivers the first user-facing improvements.

#### Prerequisites

Phase 1 must be substantially complete — specifically, monitoring (Step 1.5) must be operational to detect issues from increased public traffic, and backend test infrastructure (Step 1.3) must exist to verify auth boundary changes. The test client must be able to make both authenticated and unauthenticated requests.

#### Step-by-Step Breakdown

**Step 2.1: Remove authentication wall for read-only data pages**

What to do: This is the highest-impact growth change and requires coordinated frontend and backend modifications. Currently, all data pages require authentication — both at the API level (endpoints use `Depends(require_user)`) and the frontend level (`RequireAuth` wrappers on routes). The change makes read-only data pages publicly accessible while keeping prediction data, bookmarks, and community features behind authentication.

Where to do it — Backend changes in `api/routes.py`: Change `_user: dict = Depends(require_user)` to `_user: dict | None = Depends(get_current_user)` on the following eleven endpoints: `list_elections`, `get_election`, `get_year_results`, `list_years`, `list_parties`, `list_constituencies`, `list_districts`, `search_candidates`, `constituency_swing`, `state_swing`, and `all_constituency_swings`. The `prediction_data` endpoint must retain `Depends(require_user)` — it remains authenticated. Add `from auth import get_current_user` to the imports in `routes.py` if not already present (the current imports only include `require_user`).

Where to do it — Backend changes in `api/national_routes.py`: Change `_user: dict = Depends(require_user)` to `_user: dict | None = Depends(get_current_user)` on the following four endpoints: `national_state_summary`, `national_party_strength`, `national_turnout_trends`, `compare_states`, and `party_map`. Add `from auth import get_current_user` to the imports (currently only `require_user` is imported). Note that `upcoming_elections` is already unauthenticated and requires no change.

Where to do it — Frontend changes in `frontend/src/App.jsx`: Remove the `RequireAuth` wrapper from the following routes: `/national` (and its sub-routes `/national/parties`, `/national/compare`, `/national/timeline`), `/state/:stateName/overview`, `/state/:stateName/constituencies`, `/state/:stateName/constituencies/:name`. Retain `RequireAuth` on: `/state/:stateName/predictions` (prediction panel), `/state/:stateName/community` (community feed). Additionally, update the navigation buttons in the `<nav>` section — currently, clicking "State Overview", "Constituencies", or "Community" when not logged in calls `setShowLogin(true)` instead of navigating. For the routes that are now public (State Overview, Constituencies), remove the login gate and navigate directly. Keep the login gate for Predictions and Community.

How it connects: The `get_current_user` function already exists in `api/auth.py` and returns `None` for unauthenticated requests. This preserves optional user context — endpoints can still access the user payload when available for analytics or personalization, but return data normally for anonymous callers. The `api.js` frontend client includes the `Authorization` header only when a token is present (via `authHeaders()`), so unauthenticated requests will not include the header, and `get_current_user` will return `None`. The routes that previously relied on `require_user` used the user parameter only for authorization gating, not for data personalization, so the `None` value does not affect the response data.

What to watch out for: The `list_elections` endpoint in `routes.py` names its user parameter `_user` (with underscore prefix, indicating it is unused beyond the dependency). This convention is consistent across all endpoints — the user parameter exists solely for the authentication side effect. Ensure no endpoint uses the `_user` value for query logic (review each endpoint to confirm). Also ensure the frontend's `api.js` functions (`get()`, `post()`, etc.) handle responses correctly regardless of whether a token is present — the current implementation already includes the token conditionally in `authHeaders()`, so this should work without changes.

Verification: Add tests to the backend test suite that verify: all sixteen modified read endpoints return 200 with valid data for unauthenticated requests (no Authorization header); all sixteen endpoints still return 200 for authenticated requests; `prediction_data` returns 401 for unauthenticated requests; all write endpoints (bookmark creation/deletion/voting) return 401 for unauthenticated requests. On the frontend, manually verify that navigating to `/national`, a state overview, and a constituency detail page works without logging in. Verify that navigating to the predictions page redirects to the landing page (or shows login prompt) when not authenticated.

**Step 2.2: Implement dynamic Open Graph meta tags for social sharing**

What to do: Add Open Graph meta tags to state and constituency pages so that links shared on Twitter, WhatsApp, Facebook, and LinkedIn display rich previews with titles, descriptions, and (optionally) images. Because the frontend is a single-page application, meta tags must be injected server-side or at the CDN layer — social media crawlers do not execute JavaScript.

Where to do it: For the simplest implementation, add a server-side meta tag injection endpoint to the backend. Create a new route in `api/main.py` or a new file `api/og_routes.py` that, given a URL path, returns an HTML page with appropriate OG tags and a JavaScript redirect to the SPA. For example, a request to `/share/state/Tamil_Nadu/overview` returns a minimal HTML page with `<meta property="og:title" content="Tamil Nadu Election Analysis">`, `<meta property="og:description" content="Assembly Elections 1957-2021 · 234 Constituencies">`, and a `<script>window.location = '/state/Tamil_Nadu/overview';</script>` tag. Register this route pattern as a catch-all that only triggers for known social media user agents (via User-Agent sniffing), falling through to the SPA for normal browsers. Alternatively, configure the Nginx reverse proxy or Vercel's edge functions to handle the meta tag injection.

For OG image generation, the recommended approach is to use a lightweight SVG-to-PNG conversion rather than headless browsers. Create a utility function that generates a simple bar chart SVG from party seat data (using template strings, not a rendering library) and converts it to PNG using a library like `sharp` (Node.js, for build-time generation) or `cairosvg`/`Pillow` (Python, for on-demand generation). Cache generated images on disk or cloud storage and serve them via the CDN with long TTLs.

How it connects: The OG meta tags reference the same data available from existing API endpoints (`stats_summary` for state data, `constituency_swing` for constituency data). The social sharing flow is: user copies a URL, pastes it in WhatsApp/Twitter, the social media crawler fetches the URL, receives the OG-tagged HTML, and displays the preview.

What to watch out for: This step can be complex if done fully — OG image generation, caching, and server-side rendering for a SPA are significant engineering tasks. The must-ship scope for this step is text-only OG tags (title and description) with image generation deferred. The text-only approach can be implemented in the `index.html` template with Vite's HTML transforms or in the Vercel/Nginx layer. If using the server-side approach, ensure the OG route does not conflict with the SPA routing.

Verification: Share a state page URL on WhatsApp or Twitter (or use Facebook's Sharing Debugger tool) and confirm that a rich preview with title and description is displayed. Verify that clicking the preview link navigates to the correct SPA page.

**Step 2.3: Make the prediction panel mobile-responsive**

What to do: The prediction panel currently uses a fixed-width sidebar layout that does not adapt to mobile screens. Replace the fixed layout with a responsive design that works on screens from 320 pixels to 1400 pixels wide.

Where to do it: Modify `frontend/src/index.css` to add responsive styles for the prediction layout. The current prediction layout uses a `.pred-layout` class (visible in the `App.jsx` rendering of the predictions route) that likely uses flexbox or CSS grid with a fixed sidebar width. Add media queries at the 768-pixel breakpoint to: collapse the prediction panel from a side-by-side layout to a stacked vertical layout, make the prediction parameter sliders full-width, increase touch target sizes for sliders to at least 44 pixels, and adjust the constituency table to be horizontally scrollable on narrow screens. The `PredictionPanel` component at `frontend/src/components/PredictionPanel.jsx` may need adjustments to its internal layout — ensure slider labels and values are properly sized for mobile.

How it connects: The prediction layout is rendered in `App.jsx` within the `/state/:stateName/predictions` route. The `.pred-layout` container holds `PredictionPanel` (sidebar) and `.pred-main` (results and table). The CSS changes affect only the layout of these existing components.

What to watch out for: The prediction panel contains multiple interactive elements — sliders for anti-incumbency percentage, turnout percentage, and new party parameters. These must have adequate touch targets on mobile. The `PredictionConstituencyTable` component renders a wide table with many columns — on mobile, horizontal scrolling should be enabled rather than squishing columns. The existing `.const-grid-wrap` class in `index.css` already has `overflow-x: auto` which handles this.

Verification: Open the prediction page in Chrome DevTools mobile emulator at 375px (iPhone SE), 390px (iPhone 14), and 768px (iPad) widths. The prediction panel and results display correctly without overflow, all sliders are operable with touch, and the constituency table scrolls horizontally.

**Step 2.4: Add debouncing to search and filter inputs**

What to do: Implement a 300-millisecond debounce on text inputs that trigger API calls or expensive re-renders, particularly the constituency search filter.

Where to do it: Create a `useDebounce` hook at `frontend/src/hooks/useDebounce.js` (or inline in the components). Apply it to the search input in `frontend/src/components/ConstituencyList.jsx` and any other filter inputs that trigger API calls or re-computation on keystroke.

How it connects: The constituency list likely filters data on each keystroke. The debounce hook delays the filter/fetch until the user pauses typing, reducing unnecessary re-renders and API calls.

Verification: Type rapidly in the constituency search input and confirm that filtering occurs only after a pause, not on every keystroke. No perceptible lag in the final filtered results.

**Step 2.5: Implement basic analytics tracking**

What to do: Integrate Plausible Analytics (or Umami) to track page views, user flows, and session duration. Plausible is recommended because it is privacy-respecting and cookie-free, avoiding the need for a cookie consent banner under DPDP.

Where to do it: Add the Plausible script tag to `frontend/index.html` in the `<head>` section. The script tag is a single line: `<script defer data-domain="your-domain.com" src="https://plausible.io/js/script.js"></script>`. For the self-hosted option, replace the src URL with the self-hosted Plausible instance URL. No npm package installation is required for basic tracking. For custom event tracking (e.g., prediction saved, bookmark created), use `window.plausible()` calls in the relevant React components.

How it connects: Plausible tracks page views automatically by detecting URL changes. For a SPA using react-router, Plausible handles this natively by listening to `pushState` events.

Verification: Visit the Plausible dashboard after deploying and confirm that page views are being tracked. Verify that navigating between routes in the SPA registers as separate page views.

#### Phase Deliverables

At the end of Phase 2: all read-only data pages are accessible without authentication (both frontend and backend), social sharing produces rich previews on WhatsApp and Twitter, the prediction panel is usable on mobile devices, search inputs are debounced, and analytics tracking provides visibility into user behavior.

#### Phase Risks and Mitigations

Risk: removing the auth wall causes a spike in API traffic that overwhelms the free-tier infrastructure. Mitigation: monitoring from Step 1.5 detects traffic spikes, and the rate limiter (fixed in Step 1.7) protects against abuse. Risk: OG tag implementation is complex for the SPA architecture. Mitigation: text-only OG tags (no image generation) can be implemented quickly via the server-side HTML approach, with image generation deferred.

---

### Phase 3: Minimum Viable Monetization (Weeks 7-12)

#### Phase Header

Phase 3 introduces the first revenue stream with a subscription model targeting individual analysts and election enthusiasts. This is the longest phase (six weeks) because payment processing — Razorpay integration, webhook handling, subscription lifecycle management, and thorough sandbox testing — is inherently complex and requires careful implementation to avoid financial liability. The phase delivers: subscription tiers, payment processing, API key access, and Pro-tier gated features.

#### Prerequisites

Phase 1 must be complete — specifically, Alembic (Step 1.2) for schema changes and test infrastructure (Step 1.3) for verifying payment flows. Phase 0 TCPD licensing must be resolved or the contingency plan activated — paid features cannot launch without legal clarity on data usage. If licensing is still pending, Phase 3 development can proceed but the launch must wait.

#### Step-by-Step Breakdown

**Step 3.1: Extend the user model with subscription tiers**

What to do: Create an Alembic migration that modifies the `users` table and adds two new tables: `subscriptions` and `api_keys`.

Where to do it: Create a new migration file via `alembic revision -m "add_subscription_tiers"` in the `api/` directory. The migration's `upgrade()` function should contain the following schema changes: add a `tier` column to the `users` table with values `'free'`, `'pro'`, `'enterprise'` and a default of `'free'` (modify the existing `role` CHECK constraint to remain as-is — `tier` is separate from `role`); create a `subscriptions` table with columns for `id` (serial primary key), `user_id` (foreign key to users), `tier`, `razorpay_customer_id`, `razorpay_subscription_id`, `status` (values: `'active'`, `'canceled'`, `'past_due'`, `'in_grace_period'`, `'expired'`), `current_period_start` (timestamptz), `current_period_end` (timestamptz), `grace_period_end` (timestamptz), `created_at`, `canceled_at`; create an `api_keys` table with columns for `id` (serial primary key), `user_id` (foreign key to users), `key_hash` (text, bcrypt hash), `key_prefix` (text, first eight characters for identification), `label` (text), `created_at`, `last_used_at`, `is_active` (boolean, default true), `revoked_at` (timestamptz nullable); create a `processed_webhooks` table with columns for `id` (serial primary key), `event_id` (text, unique), `event_type` (text), `processed_at` (timestamptz, default now). Add appropriate indexes: `idx_subscriptions_user` on `subscriptions(user_id)`, `idx_api_keys_user` on `api_keys(user_id)`, `idx_api_keys_prefix` on `api_keys(key_prefix)`, `idx_processed_webhooks_event` on `processed_webhooks(event_id)`. Add Pydantic models for the new tables to `api/models.py`.

How it connects: The `tier` column on `users` is the primary lookup for access control in subsequent steps. The `subscriptions` table tracks the full lifecycle of Razorpay subscriptions. The `api_keys` table enables programmatic API access. The `processed_webhooks` table ensures idempotent webhook processing.

What to watch out for: The `key_hash` column stores bcrypt hashes, not plaintext keys. The API key is shown to the user exactly once at creation time. The `key_prefix` column stores the first eight characters of the plaintext key — this allows users to identify which key is which in the management UI without storing the full key. Never log or return the full API key after creation.

Verification: Running `alembic upgrade head` adds the new columns and tables. Running `alembic downgrade -1` removes them. The existing tables (users, bookmarks, votes) are unaffected.

**Step 3.1a: Implement API versioning**

What to do: Prefix all existing API routes with `/v1/` to establish versioned endpoints before any paid API keys are issued. This is a standard requirement for paid APIs — once developers build integrations, breaking changes cause churn and refund requests.

Where to do it: In `api/main.py`, create a versioned router: change the current `app.include_router(router)` to mount the router under a `/v1` prefix. Do the same for `auth_router`, `bookmark_router`, and `national_router`. The simplest approach is to create a parent `v1_router = APIRouter(prefix="/v1")` and include all sub-routers into it, then mount `v1_router` on the app. Maintain the old unprefixed routes as aliases during a six-month deprecation period by including the same routers twice — once under `/v1` and once at the root — and adding a middleware or response hook that injects a `Deprecation: true` header and a `Sunset` header on responses to unprefixed routes.

How it connects: The frontend's `api.js` must be updated to use `/v1/` prefixed paths. Since the `BASE` constant in `api.js` is set to `import.meta.env.VITE_API_URL || '/api'`, and the Vite proxy rewrites `/api` to the backend, the simplest approach is to update all API calls in `api.js` to prefix paths with `/v1/`. For example, `_cachedGet('/states')` becomes `_cachedGet('/v1/states')`.

Verification: All API endpoints respond at both `/v1/...` and the unprefixed path. The unprefixed responses include `Deprecation: true` headers. The frontend works correctly with the `/v1/` prefix.

**Step 3.2: Implement tier-based access control**

What to do: Create a dependency factory function in `api/auth.py` that checks the user's tier and restricts access to Pro-tier features. Also implement API key authentication as an alternative to JWT for programmatic access.

Where to do it: In `api/auth.py`, add a `require_tier` function that accepts a minimum tier level and returns a FastAPI dependency. The function should query the user's `tier` column from the `users` table (using the user ID from the decoded JWT) and return HTTP 403 with an upgrade prompt if the user's tier is below the required level. The tier hierarchy is: `free` < `pro` < `enterprise`. Add API key authentication to `get_current_user`: if the `Authorization` header contains a Bearer token with the prefix `elk_live_`, treat it as an API key instead of a JWT. Look up the key by matching its prefix in the `api_keys` table, then verify the full key against the stored bcrypt hash using a constant-time comparison. Update `last_used_at` on the matching key row. Return the user payload associated with the key's `user_id`.

How it connects: The `require_tier` dependency is used alongside `require_user` on Pro-tier endpoints. For example, the CSV export endpoint (Step 3.4) would use `user: dict = Depends(require_tier("pro"))`. The dependency first calls `require_user` (ensuring authentication) and then checks the tier.

What to watch out for: bcrypt hash verification is computationally expensive (by design). For API key-authenticated requests at high throughput, this could become a bottleneck. In Phase 3, API key traffic volume will be low and this is acceptable. In Phase 5, when Redis is introduced, implement a validated-key cache (cache `key_prefix → user_id` for keys that have been verified within the last five minutes) to avoid bcrypt computation on every request.

Verification: A free-tier user accessing a Pro-gated endpoint receives HTTP 403 with a JSON body containing an upgrade message. A Pro-tier user accesses the same endpoint successfully. An API key with the `elk_live_` prefix successfully authenticates and returns data.

**Step 3.3: Integrate Razorpay for payment processing**

What to do: Implement the full Razorpay subscription lifecycle: subscription creation, payment processing via webhooks, and subscription status management. This is the most complex step in Phase 3 and should be allocated two to three weeks including sandbox testing.

Where to do it: Create a new file `api/payment_routes.py` containing: a `POST /v1/subscriptions/create` endpoint that creates a Razorpay subscription via the Razorpay Python SDK, stores the subscription record in the `subscriptions` table, and returns the Razorpay checkout URL; a `POST /v1/webhooks/razorpay` endpoint that receives webhook events, verifies the signature, and processes subscription lifecycle events; a `GET /v1/subscriptions/me` endpoint that returns the current user's subscription status; and a `POST /v1/subscriptions/cancel` endpoint that cancels the current subscription (at period end, not immediately). Add `razorpay` to `api/requirements.txt`. Mount the payment router in `main.py`. Store the Razorpay API key and webhook secret in environment variables: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Add these to `docker-compose.yml`.

The webhook handler is the most critical component. It must: verify the `X-Razorpay-Signature` header against the webhook secret using HMAC-SHA256 before any processing; check the `processed_webhooks` table for the event ID to ensure idempotency; process the event based on its type (`subscription.activated` → set user tier to pro, `subscription.charged` → update `current_period_end`, `subscription.cancelled` → set `canceled_at` and schedule tier downgrade at period end, `payment.failed` → set status to `in_grace_period` with `grace_period_end` seven days from now); and log the event processing result.

On the frontend, create a new component at `frontend/src/components/PricingPage.jsx` that displays the Free vs Pro comparison and a "Subscribe" button. The subscribe button calls the create subscription endpoint, receives the Razorpay checkout URL or checkout ID, and opens Razorpay's hosted checkout (using Razorpay's JavaScript SDK). Add a `/pricing` route in `App.jsx` without `RequireAuth` (the pricing page should be visible to everyone, but the subscribe action requires authentication).

How it connects: The subscription creation endpoint is called from the frontend pricing page. Razorpay processes the payment and sends webhook events to the backend. The webhook handler updates the user's tier, which is checked by the `require_tier` dependency on subsequent API calls.

Technology-specific guidance: Razorpay's Python SDK provides `razorpay.Client` for API operations and a `Utility.verify_webhook_signature()` method for signature verification. Use Razorpay's test mode (test API keys) during development — test mode provides test card numbers and simulated webhook events. The Razorpay checkout can be integrated via their hosted checkout (simpler, redirects to Razorpay's page) or embedded checkout (stays on the platform, requires loading Razorpay's JavaScript SDK). The hosted checkout is simpler and recommended for the initial implementation.

What to watch out for: Webhook signature verification is a critical security requirement — without it, an attacker could forge webhook payloads to grant themselves a paid subscription. The webhook endpoint must be excluded from CSRF protection (it is not a browser-initiated request) and from rate limiting (Razorpay may send bursts of webhooks). The Razorpay webhook secret must be stored securely and never logged. Grace period logic is important: when a payment fails, the user retains Pro access for seven days (configurable) while Razorpay retries the payment. During this grace period, the frontend should display a banner warning about the payment issue.

Verification: In Razorpay test mode: create a subscription, complete payment with a test card, confirm the user's tier updates to Pro, simulate a payment failure webhook and confirm the grace period flow activates, cancel a subscription and confirm the tier downgrades at period end. Verify that unsigned webhook payloads are rejected with 400.

**Step 3.3b: Implement payment rollback and error handling**

What to do: Create an admin-only mechanism for correcting payment errors — a critical safety net for the first payment implementation.

Where to do it: Add admin endpoints to `api/payment_routes.py` or a new `api/admin_routes.py`: `GET /v1/admin/subscriptions` (list all subscriptions with user details), `PUT /v1/admin/subscriptions/{user_id}/tier` (manually set a user's tier), `POST /v1/admin/subscriptions/{subscription_id}/refund` (trigger a refund via Razorpay's API). These endpoints must be protected by requiring the user's `role` to be `'admin'` (using the existing `role` column in the users table). The admin verification should follow the pattern established in `main.py`'s `_verify_admin` function.

Verification: An admin user can view all subscriptions, manually upgrade/downgrade a user's tier, and trigger refunds. Non-admin users receive 404 (not 403, to avoid revealing the endpoint's existence).

**Step 3.4: Build Pro-tier gated features**

What to do: Implement the minimum set of features that differentiate the Pro tier from Free: CSV export of election data and API key management.

Where to do it: For CSV export, create a `GET /v1/export/csv` endpoint in `api/routes.py` (or a new `api/export_routes.py`) that accepts state, election_type, and optional year/party filters, queries the `tcpd_ae` table, and returns the results as a streaming CSV response using FastAPI's `StreamingResponse`. Protect this endpoint with `Depends(require_tier("pro"))`. For API key management, create endpoints in `api/auth_routes.py` or `api/payment_routes.py`: `POST /v1/api-keys` (generate a new API key — return the plaintext key once, store only the bcrypt hash), `GET /v1/api-keys` (list the user's keys showing prefix, label, created_at, last_used_at, is_active), `DELETE /v1/api-keys/{key_id}` (revoke a key by setting `is_active = false` and `revoked_at = now()`). On the frontend, create an `ApiKeyManager` component at `frontend/src/components/ApiKeyManager.jsx` that provides the key management UI, and add a user profile section for managing API keys.

How it connects: The CSV export endpoint reuses the existing query logic from `list_elections` in `routes.py` but returns CSV instead of JSON. The API key endpoints interact with the `api_keys` table created in Step 3.1.

What to watch out for: The CSV export for large datasets (e.g., all-India data is 574K rows) must use streaming to avoid memory exhaustion. Use Python's `csv` module with an async generator to produce CSV rows on-the-fly. Set `Content-Disposition: attachment; filename="election_data.csv"` to trigger download in the browser. Limit free-tier exports (if any) to a subset of columns or rows.

Verification: A Pro user can generate an API key, see it listed in the management UI, use it to make authenticated API requests, and revoke it. A Pro user can download CSV exports. A Free user receives 403 on both features with an upgrade prompt.

**Step 3.5: Implement API usage metering**

What to do: Track API usage per user for billing visibility and rate limiting, using an asynchronous batched approach to avoid write amplification.

Where to do it: Create a new middleware or modify the rate limiter in `api/main.py` to maintain per-user request counters in an in-memory dictionary (graduating to Redis in Phase 5). Use an asyncio background task (registered via FastAPI's lifespan handler) that flushes aggregated counts to a `usage_summary` table in PostgreSQL every five minutes. Create the `usage_summary` table via an Alembic migration with columns: `id`, `user_id` (nullable — anonymous requests are tracked by IP), `api_key_id` (nullable), `date` (date), `endpoint_group` (text), `request_count` (integer), `total_response_time_ms` (integer). Set free-tier API key limits to one thousand requests per month and Pro-tier to ten thousand.

How it connects: The metering middleware runs on every request, incrementing in-memory counters. The periodic flush task writes to the database. The usage data is displayed in the user profile on the frontend and used for enforcing monthly rate limits.

Verification: Make API requests with an API key and confirm that usage counts appear in the `usage_summary` table after the flush interval. Exceed the free-tier monthly limit and confirm that requests are rejected with HTTP 429 and a `Retry-After` header.

**Step 3.6: Implement DPDP compliance mechanisms**

What to do: Implement the technical mechanisms required by the Digital Personal Data Protection Act 2023: data deletion, data export, and explicit consent at registration.

Where to do it: Create a `DELETE /v1/users/me` endpoint in `api/auth_routes.py` that deletes the user's account and all associated data (bookmarks, votes, API keys, subscriptions, usage data) within the current request. The deletion should cascade through foreign keys (the existing schema has `ON DELETE CASCADE` on bookmarks and votes). Create a `GET /v1/users/me/data` endpoint that returns all personal data held about the user in JSON format. On the frontend, modify the `LoginModal` component at `frontend/src/components/LoginModal.jsx` to add an explicit consent checkbox that must be checked before the user can proceed with registration — the checkbox text should link to the privacy policy.

Verification: A user can export their data (JSON file contains all personal data), delete their account (all associated records are removed), and the consent checkbox is required at registration.

#### Phase Deliverables

At the end of Phase 3: subscription tiers exist in the database, Razorpay payment processing is operational with webhook signature verification, API keys can be generated and used for programmatic access, CSV export and API key management are available to Pro users, usage metering tracks API consumption, DPDP compliance mechanisms are in place, and a pricing page is visible to all users. The platform can accept its first paying customer.

#### Phase Risks and Mitigations

Risk: payment processing bugs cause incorrect charges. Mitigation: admin override endpoints (Step 3.3b), Razorpay test mode for thorough sandbox testing, documented refund policy, and error threshold for disabling new signups. Risk: webhook delivery failures cause subscription state drift. Mitigation: idempotent webhook processing with the `processed_webhooks` table, and a periodic reconciliation check that compares local subscription status with Razorpay's API. Risk: TCPD licensing is still unresolved. Mitigation: Phase 3 development can proceed; launch is blocked but development is not wasted.

---

### Phase 4: Data Coverage Expansion (Weeks 13-16)

#### Phase Header

Phase 4 expands the platform's analytical value by ensuring all major Indian states have full feature parity with Tamil Nadu, and by building a repeatable data ingestion pipeline. This phase is primarily about data quality and breadth rather than new features.

#### Prerequisites

Phase 1 test coverage (for catching regressions during multi-state fixes) and Phase 1 Alembic (for any schema changes needed by the ingestion pipeline).

#### Step-by-Step Breakdown

**Step 4.1: Validate and fix multi-state data quality**

What to do: The database already contains all-India data (loaded from `TCPD_AE_All_States_2026-4-20.csv` and `TCPD_GE_All_States_2026-4-20.csv`), but the prediction engine and frontend may have Tamil Nadu-specific assumptions. Audit the entire codebase for hardcoded state-specific values.

Where to do it: Review `frontend/src/engine/predictionEngine.js` for any hardcoded constituency counts, party names, or state-specific logic — currently, the engine is parameterized by the input data, so it should be state-agnostic, but verify this. Review `frontend/src/constants.js` for the `PARTY_COLORS` mapping — check that parties dominant in the five priority states (BJP, INC, TMC, JD(U), SP, BSP, TDP, YSRCP, BJD, SS/SHS) have color assignments (most already do based on the current mapping). Review `frontend/src/contexts/StateContext.jsx` — the `DEFAULT_STATE` is `'Tamil_Nadu'`, which is appropriate as a fallback but should not cause issues for other states. Review `api/routes.py` for the `_EXCLUDED_STATES` set (`{'Mysore', 'Madras', 'Goa_Daman_&_Diu', 'Goa,_Daman_&_Diu'}`) and verify these are historical state names that should indeed be excluded from the states list.

Verification: Select each of the five priority states (Maharashtra, Karnataka, West Bengal, Uttar Pradesh, Gujarat) in the frontend and verify: the state overview loads with correct data, constituency list shows all constituencies, constituency detail pages show swing history, and the prediction simulator produces reasonable results.

**Step 4.2: Expand alliance and party configuration for five priority states**

What to do: Add alliance structures, party affinity presets, and any missing party color mappings for the five priority states.

Where to do it: In `frontend/src/constants.js`, add any missing party colors to `PARTY_COLORS`. In the same file, review the `normalizeParty` function to ensure it handles party name variants common in the five priority states. The `buildAffinityPresets` function (referenced in `App.jsx`) generates affinity presets dynamically from the top parties in the prediction data, so it should work for any state — verify this by testing with each priority state's prediction data.

Verification: Each priority state's prediction panel shows appropriate party names and colors, and the affinity presets reflect that state's political landscape.

**Step 4.3: Build a data ingestion pipeline for new election results**

What to do: Replace the manual shell scripts in `infra/` with a repeatable, validated, and transactional data ingestion pipeline.

Where to do it: Create a new file `api/ingest.py` (or `api/ingestion/pipeline.py`) that implements a four-stage pipeline: (a) schema validation — verify CSV columns match the expected forty-eight-column schema; (b) data cleaning — apply party name normalization, handle encoding issues, standardize state and constituency names; (c) upsert — use PostgreSQL's `ON CONFLICT` clause on the unique index `idx_tcpd_unique_entry` to update existing records and insert new ones; (d) transactional rollback — wrap the entire ingestion in a database transaction. Build the pipeline as both a CLI tool (invoked via `python ingest.py --file results.csv --state Tamil_Nadu --year 2026 --election-type AE`) and an admin-only API endpoint (`POST /v1/admin/ingest`). Add logging for every ingestion run: timestamp, row counts (inserted, updated, skipped, failed), and the uploading user.

How it connects: The ingestion pipeline replaces the existing manual process using `infra/seed-db.sh`, `infra/seed-railway.sh`, and the `POST /admin/seed` endpoint in `main.py`. The existing seed endpoint accepts raw CSV in the request body — the new pipeline adds validation and transformation on top. The rough directory contains enrichment scripts (`enrich_2011.py`, `enrich_2016.py`, etc.) that suggest complex data transformations are needed — the pipeline should handle the same transformations.

Verification: Ingest a CSV file for a state/year combination that already exists in the database and confirm that records are updated (not duplicated). Ingest a CSV with intentional schema errors and confirm that the entire transaction is rolled back with a detailed error report. Ingest a valid CSV and confirm new records appear in the database.

**Step 4.4: Integrate data science model insights**

What to do: Review the predictive model in `datascience/notebooks/06_predictive_model.ipynb` and determine whether trained model coefficients or feature importances can improve the production prediction engine.

Where to do it: If the ML model provides value, create a server-side prediction endpoint in `api/routes.py` that runs the trained model for Pro-tier users. The client-side heuristic engine continues to serve free users.

Verification: The ML-based predictions produce more accurate results than the heuristic engine when backtested against historical data.

#### Phase Deliverables

At the end of Phase 4: five priority states are validated and configured with alliance structures, a data ingestion pipeline enables repeatable data loading, and (optionally) ML model insights enhance predictions for Pro users.

---

### Phase 5: Platform Hardening and Scale Preparation (Weeks 17-20)

#### Phase Header

Phase 5 addresses technical debt that becomes critical at scale: in-memory state that fails across instances, lack of structured logging, insufficient test coverage, and manual deployment processes. This phase prepares the platform for growth beyond a single-instance deployment.

#### Prerequisites

Phase 1 (test infrastructure), Phase 3 (Redis is introduced here to support usage metering and caching). Redis can be provisioned at any time — Railway offers a Redis plugin, and Docker Compose can include a Redis service.

#### Step-by-Step Breakdown

**Step 5.1: Replace in-memory caching with Redis**

What to do: Deploy a Redis instance and replace the dictionary-based response caches with Redis-backed caching.

Where to do it: Add a Redis service to `docker-compose.yml` (image: `redis:7-alpine`, port 6379). Add `redis[hiredis]` (async Redis client) to `api/requirements.txt`. Create a new module `api/cache.py` that provides `async get_cached(key)` and `async set_cached(key, data, ttl)` functions using Redis. Replace the `_response_cache` dictionary and `_get_cached`/`_set_cached` functions in `api/routes.py` with calls to the new Redis-backed cache. Do the same for `_NATIONAL_CACHE` in `api/national_routes.py` and `_GENERAL_YEARS_CACHE` in `routes.py`. Add a `REDIS_URL` environment variable to the API service in `docker-compose.yml`.

How it connects: The caching interface remains the same (key → value with TTL), so the route handlers require minimal changes — only the import source changes from the local cache functions to the Redis-backed module. The Redis cache persists across server restarts and is shared across multiple server instances.

Verification: Restart the API server and confirm that cached responses are still available (not cleared by restart). Add a second API instance and confirm both instances share the cache.

**Step 5.2: Replace in-memory rate limiting with Redis-backed rate limiting**

What to do: Migrate the `_rate_store` and `_auth_rate_store` dictionaries in `main.py` to Redis using sorted sets for sliding window implementation.

Where to do it: Modify the `RateLimitMiddleware` in `api/main.py` to use Redis sorted sets instead of in-memory dictionaries. The Redis sorted set approach: for each client IP, add the current timestamp to a sorted set keyed by `rate:{ip}`, remove entries older than the window, and check the set's cardinality against the limit. This is a standard Redis rate limiting pattern.

Verification: Rate limiting works correctly across multiple API instances. The in-memory dictionary cleanup logic is removed.

**Step 5.3: Add structured logging with correlation IDs**

What to do: Implement middleware that generates a unique request ID for each incoming request and includes it in all log messages.

Where to do it: Create a new middleware in `api/main.py` that generates a UUID for each request, stores it in a context variable, and includes it in the response via an `X-Request-ID` header. Switch from the basic Python logging format in `main.py` to structured JSON logging using the `structlog` or `python-json-logger` library. Add the library to `api/requirements.txt`.

Verification: Each log line includes a `request_id` field. The same request ID appears in the response header and all associated log messages.

**Step 5.4: Increase test coverage**

What to do: Expand test suites to achieve eighty percent overall coverage and one hundred percent branch coverage of the prediction engine. Add Playwright end-to-end tests for critical user flows.

Where to do it: Add `playwright` to the frontend's devDependencies. Create `frontend/e2e/` directory with test files for: anonymous browsing flow (land on homepage, navigate to state overview, view constituency detail), authenticated prediction flow (login, adjust prediction parameters, save bookmark), and community interaction flow (browse community feed, vote on prediction). Expand backend tests in `api/tests/` to cover remaining endpoints, error handling paths, and middleware behavior.

Verification: `pytest --cov` reports at least eighty percent coverage. `vitest --coverage` reports one hundred percent branch coverage on `predictionEngine.js`. Playwright tests pass for all defined flows.

**Step 5.5: Migrate to paid infrastructure**

What to do: When MRR reaches five hundred dollars or active users exceed two thousand, migrate from Railway free tier to either Railway Pro or the GCP Terraform deployment.

Where to do it: The GCP deployment is already configured in `infra/terraform/main.tf` with Cloud SQL, Cloud Run, Secret Manager, and Artifact Registry. Running `terraform apply` provisions the infrastructure. Before migrating, implement a parallel deployment period where both Railway and GCP run simultaneously.

Verification: The GCP deployment serves the same responses as Railway. DNS cutover completes without downtime.

**Step 5.6: Implement CI/CD pipeline**

What to do: Configure GitHub Actions to run tests, linting, and type checking on every pull request.

Where to do it: Create `.github/workflows/ci.yml` with jobs for: backend tests (`pytest` with coverage reporting), frontend tests (`vitest` with coverage reporting), linting (`eslint` for frontend, `ruff` for backend), and (optionally) Playwright E2E tests. Configure coverage thresholds as CI gates — coverage must not decrease between PRs.

Verification: Opening a pull request triggers the CI pipeline. Tests, linting, and coverage checks pass or fail with clear output.

#### Phase Deliverables

At the end of Phase 5: Redis backs both caching and rate limiting (enabling multi-instance deployment), structured logging enables debugging, test coverage exceeds eighty percent with Playwright E2E tests, CI/CD pipeline runs on every PR, and (when revenue justifies) infrastructure has migrated to paid hosting.

---

### Phase 6: Revenue Expansion (Weeks 21-26)

#### Phase Header

Phase 6 adds additional revenue streams and B2B capabilities. All items in this phase are optional and should be prioritized based on market signals from Phase 3 analytics.

#### Prerequisites

Phase 3 subscription infrastructure and Phase 4 data coverage.

#### Step-by-Step Breakdown

**Step 6.1: Build embeddable election widgets**

What to do: Create iframe-embeddable widgets — seat projection bar charts, constituency result cards, state election timelines — that media houses can embed in their articles.

Where to do it: Create a new directory `frontend/src/widgets/` containing standalone React components designed for iframe embedding. Build these as separate Vite entry points that produce self-contained HTML files. The widgets are branded with a "Powered by [platform name]" footer. Create a widget configuration endpoint in the backend that generates embed codes.

Verification: An embed code renders correctly in an iframe on an external page. The widget loads data from the API independently.

**Step 6.2: Implement prediction accuracy tracking**

What to do: After actual election results become available, compare stored community predictions (bookmarks) against actual outcomes and calculate accuracy scores.

Where to do it: Create a scoring function that, given a bookmark's prediction parameters and the actual results (loaded via the ingestion pipeline in Step 4.3), calculates accuracy metrics (seats correctly predicted, mean absolute error on vote shares). Store scores in a new `prediction_scores` table (created via Alembic migration). Display leaderboards in the community feed.

Verification: After ingesting actual election results, accuracy scores are calculated for all public bookmarks that predicted that election. Leaderboards display the most accurate predictors.

**Step 6.3: Launch Business tier**

What to do: Create a Business tier at four thousand nine hundred ninety-nine rupees per month with higher API limits, unbranded widgets, and priority email support.

Where to do it: Add `'business'` to the tier hierarchy in `api/auth.py`. Create a new Razorpay subscription plan for the Business tier. Update the pricing page to include the Business tier.

Verification: Business tier users access higher API limits and unbranded widgets.

**Step 6.4: Establish customer support operations**

What to do: Set up tiered support operations: community support for free users, email support with 48-hour SLA for Pro users, and 24-hour SLA for Business users.

Where to do it: Set up a shared inbox (support@domain). Create a support page in the frontend at `/support` with contact information and SLA details per tier.

**Step 6.5: API marketplace listing**

What to do: Publish the election data API on RapidAPI to reach developers building political tech tools.

Where to do it: Configure the API on RapidAPI's platform using the existing OpenAPI documentation at `/docs`.

#### Phase Deliverables

At the end of Phase 6: embeddable widgets serve as a B2B product, prediction accuracy tracking drives engagement, Business tier targets media houses, customer support operations are sustainable, and the API marketplace generates passive revenue.

---

## 4. Cross-Cutting Concerns

**Error handling patterns:** The existing codebase uses `HTTPException` for API errors with numeric status codes and string details. This pattern should be maintained consistently across all new endpoints. Payment-related errors should include a `code` field in the detail JSON (e.g., `{"detail": "Subscription required", "code": "TIER_REQUIRED", "upgrade_url": "/pricing"}`) to enable the frontend to display contextual upgrade prompts.

**Logging and monitoring:** The existing security logger (`logging.getLogger("security")`) should continue to be used for security-relevant events (rate limit violations, unauthorized access attempts, webhook signature failures). Application-level events (subscription created, API key generated, data ingested) should use a separate `app` logger. Sentry captures unhandled exceptions. UptimeRobot monitors the `/health` endpoint.

**Security considerations:** All new endpoints handling user data must validate input using Pydantic models (following the existing pattern in `bookmark_routes.py` with field validators). API key secrets must be hashed with bcrypt before storage. Razorpay webhook signatures must be verified with HMAC-SHA256. Admin endpoints must return 404 (not 403) to non-admin users to avoid endpoint enumeration. All payment-related data (subscription IDs, customer IDs) should be treated as sensitive and excluded from Sentry reports.

**Performance considerations:** Database queries should use parameterized values exclusively (the existing codebase uses `$1`, `$2` placeholders via asyncpg, and this must continue). Avoid N+1 query patterns — the existing `list_public_bookmarks` endpoint in `bookmark_routes.py` already uses a JOIN to avoid N+1, and this pattern should be followed. CSV exports must use streaming responses for large datasets. Usage metering must use batched writes, not per-request writes.

**Accessibility:** New UI components (pricing page, API key manager, mobile prediction panel) should use semantic HTML, include ARIA labels for interactive elements, and maintain the existing color contrast ratios (light text on dark background in the default theme).

---

## 5. Migration and Data Considerations

The implementation involves four schema migrations, all created via Alembic:

The first migration (Phase 1, Step 1.2) is the initial migration capturing the existing schema from `init.sql`. Existing deployments use `alembic stamp head` to mark the current schema without applying changes. New deployments use `alembic upgrade head` to create all tables.

The second migration (Phase 3, Step 3.1) adds: `tier` column to `users` (default `'free'`), `subscriptions` table, `api_keys` table, and `processed_webhooks` table. Existing users receive the `'free'` tier automatically via the column default. No data backfill is required.

The third migration (Phase 3, Step 3.5) adds the `usage_summary` table. No existing data is affected.

The fourth migration (Phase 6, Step 6.2) adds the `prediction_scores` table. No existing data is affected.

Rollback procedures: each Alembic migration includes a `downgrade()` function that reverses the schema change. For the `tier` column addition, the downgrade drops the column, which means any tier assignments are lost — this is acceptable because downgrading from Phase 3 implies reverting to the pre-monetization state. Database backups should be taken before running each migration in production.

---

## 6. Integration Points

**Frontend-Backend API contracts:** The frontend communicates with the backend exclusively through the `api.js` module, which defines the request format for each endpoint. All new endpoints must follow the same pattern: path parameters and query strings for GET requests, JSON bodies for POST/PUT/DELETE, and JSON responses with appropriate HTTP status codes. New Pro-tier endpoints should return `{"detail": "...", "code": "TIER_REQUIRED"}` for 403 responses to enable the frontend to distinguish tier errors from other authorization failures.

**Razorpay integration boundary:** The backend communicates with Razorpay via their Python SDK for subscription creation and management. Razorpay communicates with the backend via webhook POST requests to `/v1/webhooks/razorpay`. The frontend communicates with Razorpay via their JavaScript SDK for the checkout experience. The Razorpay checkout flow is: frontend calls backend to create subscription → backend returns Razorpay checkout configuration → frontend opens Razorpay checkout → user completes payment → Razorpay sends webhook to backend → backend updates user tier.

**Firebase authentication:** The existing flow is: frontend initiates phone OTP via Firebase SDK → user enters OTP → Firebase verifies OTP and returns an ID token → frontend sends ID token to backend `/auth/verify-otp` → backend verifies the ID token against Google's public keys → backend creates/finds user and returns a JWT. This flow is not modified by the implementation. The JWT cookie migration (Step 1.6) changes the token delivery mechanism (cookie vs response body) but not the verification flow.

---

## 7. Configuration and Environment

New environment variables required across phases:

Phase 1: `SENTRY_DSN` (backend), `VITE_SENTRY_DSN` (frontend), `DB_SSL_CA_CERT` (optional, path to CA certificate), `DB_SSL_VERIFY` (default `"true"`), `TRUSTED_PROXIES` (comma-separated CIDR ranges), `DB_POOL_MIN_SIZE` (default `2`), `DB_POOL_MAX_SIZE` (default `10`).

Phase 2: `VITE_PLAUSIBLE_DOMAIN` (for analytics tracking).

Phase 3: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `VITE_RAZORPAY_KEY_ID` (frontend checkout), `RAZORPAY_PLAN_ID_PRO_MONTHLY`, `RAZORPAY_PLAN_ID_PRO_ANNUAL`.

Phase 5: `REDIS_URL` (Redis connection string).

All new environment variables should be added to `docker-compose.yml` for local development, documented in `README.md`, and added to Railway/Vercel configuration for production.

---

## 8. Implementation Order and Dependencies

The following dependency map governs the implementation order:

Steps with no dependencies (can begin immediately): 0.1, 0.2, 0.3, 0.4, 1.1, 1.3, 1.4, 1.5, 1.7, 1.8.

Steps that depend on Step 1.2 (Alembic): 3.1 (tier migration).

Steps that depend on Step 1.3 (backend tests): 1.6 (JWT migration — tests must cover auth flow first), 2.1 (auth boundary change verification).

Steps that depend on Phase 1 completion: 2.1, 2.2, 2.3, 2.4, 2.5 (all of Phase 2).

Steps that depend on Step 3.1 (tier model): 3.2, 3.3, 3.4, 3.5, 3.6.

Steps that depend on Step 3.2 (tier access control): 3.3 (payment integration), 3.4 (Pro features).

Parallelizable pairs for a single developer: Steps 1.1 and 1.7 (both modify `api/` but different files); Steps 1.3 and 1.4 (backend and frontend test infra are independent); Steps 2.1 and 2.3 (auth wall and mobile responsiveness affect different layers); Steps 2.4 and 2.5 (debouncing and analytics are independent).

Recommended order for a single developer: Phase 0 (non-technical, do first) → 1.1 → 1.7 → 1.8 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 → 2.1 → 2.3 → 2.2 → 2.4 → 2.5 → 3.1a → 3.1 → 3.2 → 3.3 → 3.3b → 3.4 → 3.5 → 3.6 → 4.1 → 4.2 → 4.3 → 4.4 → 5.1 → 5.2 → 5.6 → 5.3 → 5.4 → 5.5 → Phase 6 items by priority.

How work could be split across two developers: Developer A focuses on backend (Steps 1.1, 1.2, 1.3, 1.6, 1.7, 1.8, 3.1-3.6, 4.3, 5.1-5.3) while Developer B focuses on frontend (Steps 1.4, 2.1-frontend, 2.2-2.5, 3.4-frontend components, 4.1-4.2, 5.4, 5.6, 6.1). The auth boundary change (2.1) requires coordination — Developer A modifies backend endpoints while Developer B modifies frontend routes.

---

## 9. Completion Criteria

**Phase 0:** TCPD licensing outreach initiated, privacy policy live at `/privacy`, terms of service live at `/terms`, licensing model decision documented.

**Phase 1:** All backend tests pass with fifty percent coverage of routes.py and auth_routes.py; all frontend prediction engine tests pass with seventy percent branch coverage; SSL certificate verification enabled (CERT_NONE removed); UptimeRobot and Sentry operational; rate limiter uses real client IPs; Alembic initialized with initial migration.

**Phase 2:** Sixteen read-only API endpoints return data for unauthenticated callers; `prediction_data` still requires auth; prediction panel usable on mobile (375px width); OG tags present on shared URLs; analytics tracking page views.

**Phase 3:** At least one user can subscribe to Pro tier and access gated features; Razorpay webhooks are processed with signature verification; API keys can be generated and used; CSV export works for Pro users; usage metering records API consumption; DPDP deletion and export endpoints functional.

**Phase 4:** Five priority states display correct data in the frontend; prediction engine produces reasonable results for all five states; data ingestion pipeline validates, cleans, and loads new CSV files transactionally.

**Phase 5:** Redis backs caching and rate limiting; CI/CD pipeline runs on PRs; test coverage exceeds eighty percent backend, one hundred percent prediction engine; structured logging with request IDs.

**Phase 6:** At least one embeddable widget is functional; prediction accuracy scoring calculates for completed elections; Business tier is available for purchase.

---

## 10. Implementation Report Summary

This implementation report decomposes the elec platform improvement and monetization initiative into approximately forty distinct implementation steps across seven phases spanning twenty-six weeks. The implementation is grounded in the detected technology stack: a FastAPI backend using asyncpg with raw SQL queries, a React 19 frontend with Vite 8 and context-based state management, a PostgreSQL 16 database with a single-table election data schema, Docker Compose for local development, and Railway/Vercel for production hosting.

Phase 0 resolves legal prerequisites (TCPD licensing, privacy policy, terms of service). Phase 1 addresses critical security vulnerabilities (SSL verification in `database.py`, client IP identification in `main.py`, JWT storage migration) and establishes quality infrastructure (Alembic in `api/`, pytest in `api/tests/`, vitest in `frontend/`, Sentry and UptimeRobot monitoring). Phase 2 unlocks organic growth through the highest-impact change — removing `Depends(require_user)` from sixteen read-only endpoints across `routes.py` and `national_routes.py` while removing `RequireAuth` wrappers from corresponding frontend routes, keeping `prediction_data` authenticated. Phase 3 introduces monetization with Razorpay payment processing, subscription tiers, API key management, and Pro-tier feature gating — the most complex phase at six weeks. Phase 4 expands data coverage to five priority states with a validated ingestion pipeline. Phase 5 hardens the platform with Redis-backed caching and rate limiting, CI/CD, and expanded test coverage. Phase 6 adds revenue expansion streams including embeddable widgets and a Business tier.

Key decision points include: TCPD licensing outcome (Phase 0, gates Phase 3), the free vs Pro feature boundary (informed by Phase 2 analytics), and the timing of infrastructure migration (Phase 5, triggered by revenue/traffic thresholds). Critical dependencies are: Phase 1 monitoring and tests must precede Phase 2; Alembic setup must precede Phase 3 schema changes; TCPD licensing must be resolved before Phase 3 launches. The implementation can adapt to market signals — if organic growth exceeds expectations during election season, prioritize Phase 4 data coverage; if a B2B opportunity emerges, pull Phase 6 widget and Business tier work earlier.

---

*Report saved to: `_architect/implementations/2026-04-27-elec-platform-improvement-implementation.md`*
