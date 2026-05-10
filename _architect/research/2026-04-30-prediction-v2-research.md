# Deep Technical Research: Prediction Platform V2 — Surveyor-Centric Extension

**Date:** 2026-04-30  
**Analyst:** GitHub Copilot (Senior Technical Analyst)  
**Subject:** Comprehensive feasibility and architecture research for V2 features: survey workflows, booth-level disaggregation, geospatial visualization, report generation, real-time dashboards, offline-first patterns, advanced ML, external data, and performance architecture  
**Prior Research:** Builds on `_architect/research/2026-04-30-prediction-sliders-research.md` (V1 factor catalog, TCPD structure, existing prediction architecture)

---

## 1. Current Implementation Audit — V1 Completeness Assessment

### Codebase Findings

The V1 multi-factor prediction system has been implemented with high fidelity to the plan documented in `_architect/analysis/2026-04-30-prediction-sliders.md`. The following components are in place:

**Frontend Prediction Engine** (`frontend/src/engine/predictionEngine.ts`): The formula-based engine is fully implemented with all twelve factor sliders specified in V1. The `FactorParams` interface defines twelve factors: `turnoutChange`, `incumbencyFatigue`, `turncoatPenalty`, `recontestBonus`, `sameConstituencyBonus`, `previousMarginFactor`, `enopFactor`, `nCandFactor`, `constituencyTypeFactor`, `genderFactor`, `partyStrengthFactor`, `partyVoteShareFactor`. The multiplicative proportional swing model works as designed — each factor produces a modifier via `1 + (coefficient * sliderValue / 100)`, clamped to `[0.5, 2.0]`, with final renormalization to ensure vote shares sum to one. The `applyMultiFactorModifiers()` function correctly distinguishes between candidate-level factors (applied to incumbents/runners-up based on position), constituency-level factors (using actual constituency data like `margin_percentage_latest`, `enop_latest`, `n_cand_latest`), and state-level factors (applied uniformly). Error margins are computed using a Euclidean slider-deviation distance function (`computeSliderDistance()`), with a base error of ±3% that widens as sliders deviate from defaults.

**Alliance Configuration** (`predictionEngine.ts`, `applyAllianceTransfers()`): Fully implemented. The function accepts an array of `AllianceBloc` objects, each with a `parties` list and `transferEfficiency` (clamped 0.5–1.0). Within each constituency, the strongest allied party receives transferred votes from weaker allies at the specified efficiency rate. Alliance presets exist for ten major states in `frontend/src/engine/data/alliance_data.json` with historical configurations for 2–3 election cycles per state: Tamil Nadu, Maharashtra, Uttar Pradesh, West Bengal, Karnataka, Bihar, Rajasthan, Madhya Pradesh, Andhra Pradesh, and Gujarat.

**Factor Configuration** (`frontend/src/engine/factorConfig.ts`, `factor_catalog.json`, `coefficients.json`): The factor catalog is fully defined as a JSON file with twelve entries, each specifying `name`, `displayName`, `category` (five categories), `level` (candidate/constituency/state), `sliderType` (impact/value/state), `range`, `step`, `defaultValue`, `defaultType`, `direction`, and `tooltip`. Coefficients are provided for `_national` and nine state-specific configurations (Tamil Nadu, Maharashtra, Uttar Pradesh, West Bengal, Karnataka, Bihar, Rajasthan, Madhya Pradesh, Gujarat).

**Backend ML Endpoint** (`api/prediction_routes.py`): The `/v1/predict/ml` POST endpoint is implemented with: Pydantic `FactorInput` model with `Field(ge=..., le=...)` constraints for all twelve factors; lazy ONNX model loading from `api/models/election_predictor.onnx`; circuit breaker pattern (5 failures → open); bucketed caching with 5-minute TTL (slider values rounded to nearest 5 for cache key coalescing); constituency feature matrix construction via batch SQL query. The `/v1/predict/model-health` GET endpoint reports model load status, version, and circuit breaker state.

**Backend Factor Routes** (`api/factor_routes.py`): The `GET /v1/factors` and `GET /v1/factors/{state}` endpoints serve the factor catalog and state-specific coefficients from static JSON files in `api/factor_data/`. State name normalization replaces spaces/hyphens with underscores. Falls back to `_national` coefficients when state-specific data is unavailable.

**Survey Import** (`frontend/src/components/SurveyImportModal.tsx`): CSV and JSON import is implemented via a Radix Dialog modal. CSV parsing validates against `factor_catalog` ranges. JSON parsing accepts `{factor: value}` objects. Validation is field-level with clear error messages. Successfully parsed rows are previewed before import, with invalid rows highlighted.

**Data Science Pipeline** (`datascience/notebooks/08_factor_discovery.ipynb`): The notebook implements the complete pipeline — data loading (post-2008 AE data), feature engineering (12 features from TCPD columns with previous-election linkage), logistic regression coefficient derivation (national + per-state), XGBoost classification training (200 estimators, max_depth=6), SHAP explainability analysis, and ONNX export with metadata. However, the notebook has **not been executed** — no cells show output. The `datascience/output/MODEL_CARD.md` exists but `election_predictor.onnx` is not present in the `api/models/` directory (no `api/models/` directory exists).

**Database Migrations**: Alembic migration `0006_model_metadata` creates the `model_metadata` table for ML model versioning, matching V1 specification.

**UI Components**: The frontend has `PredictionPanel.tsx`, `PredictionResults.jsx`, `PredictionConstituencyTable.jsx`, and `ui/FactorSlider.tsx` components. `IndiaMap.jsx` exists with state-level rendering using `react-simple-maps`. `SurveyImportModal.tsx` handles CSV/JSON import.

### V1 Implementation Gaps

1. **ONNX model not deployed**: The notebook exists but hasn't been executed. No model artifact exists at `api/models/`. The ML prediction endpoint will return 503 until the model is trained and deployed.

2. **SHAP feature attributions not in API response**: The V1 plan specified returning top-five SHAP attributions per constituency from the `/v1/predict/ml` endpoint. The current `ConstituencyPrediction` response model does not include a `feature_attributions` field. SHAP computation is in the notebook but not integrated into the API runtime.

3. **Circuit breaker uses failure count, not accuracy validation**: The V1 plan specified circuit breaker based on prediction accuracy deviating from known historical results. The implemented circuit breaker (`_failure_count`, `_FAILURE_THRESHOLD = 5`) triggers on consecutive inference failures (exceptions), not accuracy degradation. This is simpler but less robust against silently wrong models.

4. **Model metadata table exists but isn't queried**: The `model_metadata` table is created via Alembic migration but the `prediction_routes.py` code doesn't read from it — the model version comes from ONNX metadata instead. No `GET /v1/predict/model-health` query against `model_metadata` exists.

5. **Quantile regression confidence intervals not implemented**: The error margins in the ML response are parsed from model output (`pred[4]`, `pred[5]`) assuming the model outputs them, but the XGBoost classifier in the notebook does not produce quantile outputs. The formula engine uses the simpler slider-deviation heuristic (base ±3% × distance factor).

6. **No dedicated rate limiting for ML endpoint**: The V1 plan specified 20 requests per 60 seconds for the ML endpoint. The current implementation uses the global rate limiter only (100 requests per 60 seconds, configurable via env vars).

---

## 2. Booth-Level Data Feasibility

### TCPD Data Structure Analysis

The TCPD datasets operate at **candidate-within-constituency** granularity — each row represents one candidate's results in one constituency for one election. There is no booth-level (polling station) data in any TCPD dataset. The data files are:
- `data/TCPD_AE_All_States_2026-4-30.csv.gz` — Assembly Elections
- `data/TCPD_GE_All_States_2026-4-30.csv.gz` — General Elections
- `data/TCPD_GA_All_States_2026-4-30.csv.gz` — General Assembly (unused, not loaded)

The CSV columns examined from `TCPD_AE_Tamil_Nadu_2026-4-12.csv` confirm constituency-level granularity with fields like `Valid_Votes`, `Electors`, `Constituency_Name`, `Constituency_No`, `Vote_Share_Percentage` — all at constituency level. No `booth_no`, `polling_station`, or sub-constituency identifiers exist.

### Booth Count Estimation

Indian polling stations are established by the Election Commission of India based on registered elector counts, with a guideline of approximately 800–1500 electors per polling station (typical average ~1200). Based on the TCPD data:

- **Tamil Nadu 2021**: 234 constituencies, total electors ~6.28 crore (62.8M). Estimated booths: ~52,000–78,000 (average ~270 per constituency). The `Electors` field for Gummidipundi constituency shows 284,412 electors, which at ~1200/booth implies ~237 booths.
- **Uttar Pradesh**: 403 constituencies, total electors ~15 crore. Estimated ~125,000–165,000 booths (average ~350 per constituency).
- **National total** (all AE): 4000+ constituencies across all states, potentially 1.5–2M total booths.

### Synthetic Disaggregation Approaches

**Approach A — Uniform Distribution**: Split each constituency's vote totals equally across estimated booth count. For constituency C with V valid votes and B estimated booths, each booth gets V/B votes, and each party gets its constituency vote share × V/B votes. This is the naive baseline described in the V2 prompt.

- *Accuracy implication*: Ignores intra-constituency heterogeneity. Urban booths within a constituency may vote 70% for one party while rural booths vote 50% for another. Uniform disaggregation would assign ~60% to all booths, systematically underestimating variance and producing misleadingly narrow per-booth predictions.
- *Feasibility*: Trivial to implement. Requires only constituency-level data already available.

**Approach B — Proportional by Elector Count**: If booth-level elector counts are available (from voter rolls), split votes proportionally by each booth's elector count. Larger booths get proportionally more votes. Party shares remain uniform within the constituency.

- *Accuracy implication*: Marginal improvement over uniform — accounts for booth size variation but not voting pattern variation.
- *Feasibility*: Booth elector counts are published by ECI before each election. PDF format, non-standardized across states.

**Approach C — Historical Booth Results Integration**: ECI publishes booth-wise results (Form 20 / Part III) after elections. These contain actual votes per candidate per polling station.

- *Data availability*: ECI publishes booth-wise results as PDF tables (not machine-readable). Some states have digitized results on their CEO websites. Organizations like DataMeet have crowd-sourced some booth-level data, but coverage is incomplete and inconsistent. Lok Dhaba (TCPD's platform) does not provide booth-level data.
- *Data quality*: PDF extraction via Tabula or Camelot is error-prone — table formats vary across states and years, OCR quality varies for scanned PDFs, and multi-page tables require manual boundary correction.
- *Volume estimate*: Tamil Nadu 2021 alone has ~55,000 booths × ~12 candidates average = ~660,000 rows. National coverage would be millions of rows.
- *Effort*: The V2 prompt estimates 50+ hours for all states. For a single state (Tamil Nadu), a realistic estimate is 10–20 hours for PDF acquisition, extraction, cleaning, and validation.

### Accuracy Implications

Synthetic disaggregation fundamentally cannot capture booth-level dynamics — caste-dominated pockets, urban-rural splits within constituencies, local leader influence at specific booths, or religious/community concentration patterns. The prediction error at booth level will always be significantly wider than at constituency level. Uniform disaggregation would produce booth-level predictions with error margins of ±15–25% vote share (compared to ±3–8% at constituency level), rendering individual booth predictions nearly meaningless for competitive constituencies.

Booth-level predictions become useful primarily for three purposes: (1) aggregation validation (do booth predictions sum correctly to constituency totals?), (2) survey data anchoring (attaching surveyor observations to specific booths rather than entire constituencies), and (3) visualization granularity (showing within-constituency patterns when real survey data is available).

### Recommendation-Free Summary

The TCPD data provides no booth-level information. Booth counts for Indian constituencies range from ~100 to ~500+. Synthetic disaggregation is technically trivial but introduces large error margins at booth level. Historical booth-level results exist in ECI publications but require significant manual data extraction effort. The accuracy of booth-level predictions depends almost entirely on whether real booth-level data (from surveys or historical extraction) is available.

---

## 3. Survey Workflow Architecture

### Existing Stack Assessment

The current backend stack is FastAPI + asyncpg + PostgreSQL with Redis caching, JWT authentication (httpOnly cookies + CSRF tokens + API keys), and role-based access (`user`, `admin` roles in the `users` table `role` column with CHECK constraint). The authentication system supports mobile OTP via Firebase phone auth and Google account linking.

### New Database Schema Requirements

The V2 survey features require four new tables, referencing the existing `users` table:

**`survey_campaigns`**: campaign_id (PK), creator_user_id (FK → users), state_name, election_year, scope_constituencies (JSONB array of constituency_nos, NULL = entire state), start_date, end_date, status (draft/active/completed/archived), questionnaire_config (JSONB), visibility (private/public), created_at, updated_at. Indexes: `(creator_user_id)`, `(state_name, election_year)`, `(status)`.

**`survey_booths`**: booth_id (PK), campaign_id (FK → survey_campaigns), constituency_no, booth_number (from ECI numbering), booth_name, latitude/longitude (NUMERIC(10,7)), assigned_surveyors (JSONB array of user_ids), target_sample_size, created_at. Indexes: `(campaign_id, constituency_no)`, `(campaign_id)` for progress queries.

**`survey_submissions`**: submission_id (PK), booth_id (FK → survey_booths), surveyor_user_id (FK → users), timestamp (TIMESTAMPTZ), observations (JSONB with factor_name → value mapping), confidence_scores (JSONB with factor_name → high/medium/low), evidence_urls (JSONB array of S3/R2 URLs), gps_latitude/gps_longitude (NUMERIC(10,7)), quality_score (NUMERIC(5,2), computed), review_status (pending/approved/flagged/rejected), reviewed_by (FK → users, nullable), reviewed_at (TIMESTAMPTZ, nullable), created_at. Indexes: `(booth_id, surveyor_user_id)`, `(booth_id, created_at)`, `(surveyor_user_id, created_at)` for leaderboard queries.

**Surveyor role extension**: The `users` table currently has `role CHECK (role IN ('user', 'admin'))`. Adding `'surveyor'` and `'coordinator'` to the CHECK constraint requires an ALTER TABLE migration. The existing `role` column is a single value, not an array — supporting multiple roles per user would require either a junction table or changing to an array type. A simpler approach is adding a `surveyor_campaigns` JSONB field to `users` tracking which campaigns a user is assigned to, while keeping `role` as the primary permission level.

### Authentication Extensions

The existing auth system supports three tiers: anonymous (no auth), `user` (basic access), `admin` (full access). V2 needs finer-grained authorization:

- **Campaign creators** need `coordinator` role or `admin` role
- **Assigned surveyors** need to be authenticated users whose ID appears in a campaign's surveyor assignment list
- **Survey submission** requires auth + assignment verification (user is assigned to the specific booth's campaign)

The existing `require_user` dependency can be extended with campaign-specific authorization checks in endpoint handlers. A new `require_campaign_access(campaign_id)` dependency would verify the user is the creator, an assigned surveyor, or an admin. This follows the existing pattern of `require_tier(minimum)` for subscription-based access control.

### File Upload Architecture

The current stack has no file upload infrastructure. Photo uploads for survey evidence require:

- **Development**: Local filesystem storage at `api/uploads/` with path-based URLs
- **Production**: Object storage via Cloudflare R2 (S3-compatible, free tier includes 10GB storage + 10M reads/month) or Railway persistent volumes
- **Implementation**: A new `POST /v1/surveys/upload` endpoint accepting `multipart/form-data`, compressing images to ≤500KB via Pillow/PIL, storing to the configured backend, returning a URL. The existing `MAX_BODY_SIZE` middleware (10MB default) accommodates photo uploads without modification.
- **Security**: Validate file types (JPEG, PNG only), reject files with executable headers, generate unique filenames with UUIDs (prevent path traversal), and scope access to authenticated users with campaign assignment.

### API Endpoint Structure

New endpoints in a `survey_routes.py` file:
- `POST /v1/surveys/campaigns` — create campaign (coordinator/admin)
- `GET /v1/surveys/campaigns` — list user's campaigns
- `GET /v1/surveys/campaigns/{id}` — campaign detail + progress metrics
- `PUT /v1/surveys/campaigns/{id}` — update campaign config/status
- `POST /v1/surveys/campaigns/{id}/booths` — bulk create/import booths
- `GET /v1/surveys/campaigns/{id}/booths` — list booths with status
- `POST /v1/surveys/booths/{booth_id}/submit` — submit survey observation
- `GET /v1/surveys/dashboard/{campaign_id}` — aggregated progress/quality metrics
- `PUT /v1/surveys/submissions/{id}/review` — admin review/flag
- `GET /v1/surveys/conflicts/{campaign_id}` — conflicting submissions
- `POST /v1/surveys/upload` — photo upload

All endpoints follow the existing route registration pattern: dual-registration under the `v1` APIRouter and app-level router.

---

## 4. Geospatial Capabilities

### Current Mapping Implementation

The existing `IndiaMap.jsx` component uses `react-simple-maps` (v3.0.0, already in dependencies) with a **state-level** GeoJSON file at `frontend/src/assets/india-states.json`. It renders a `ComposableMap` with `ZoomableGroup` for pan/zoom, `Geographies` for SVG path rendering, and three color modes (ruling party, turnout, margin). Tooltip interaction is implemented. The `GEO_TO_DB` mapping object translates GeoJSON property names to database state names.

### Constituency-Level GeoJSON Sources

No constituency-level GeoJSON or TopoJSON files exist in the workspace. No `public/maps/` directory exists.

**Available data sources for Indian constituency boundaries:**

1. **DataMeet India Maps** (github.com/datameet): Community-maintained GIS data under CC-BY license. Contains state-level boundaries and some district-level boundaries. **Assembly constituency boundaries are limited** — DataMeet has Lok Sabha (parliamentary) constituency boundaries for 2014 delimitation but assembly constituency boundaries are sparse and incomplete for most states.

2. **Election Commission of India Shapefiles**: ECI does not publish official machine-readable constituency boundary files. Some state CEOs (Chief Electoral Officers) have published maps as images but not GeoJSON.

3. **Census of India (census2011.co.in)**: Provides district and sub-district boundaries but not assembly constituency boundaries (constituencies do not align perfectly with administrative divisions).

4. **MapmyIndia / Mappls**: Commercial provider with constituency-level boundaries. Requires paid API access.

5. **Community-sourced**: Some academic projects and election analysis websites have created constituency boundary files by georeferencing ECI maps, but these are often incomplete, inaccurate, or use outdated delimitation boundaries.

6. **Lok Dhaba (lokniti.org)**: Provides some geographic data for TCPD datasets but not systematic constituency boundary files.

### Technical Implementation Options

**Option A — react-simple-maps (current library)**: Extends the existing `IndiaMap.jsx` to render constituency-level GeoJSON. react-simple-maps uses D3-geo under the hood with SVG rendering. For Tamil Nadu (234 constituencies), SVG rendering is feasible — 234 `<path>` elements with fill/stroke render in <100ms. For all-India assembly constituencies (~4000+ polygons), SVG rendering becomes sluggish — 4000+ SVG paths with event handlers cause significant DOM overhead, likely >500ms render time and laggy interactions.

**Option B — D3.js with Canvas**: Replace SVG rendering with canvas-based rendering using `d3-geo` path generator on a `<canvas>` element. Canvas renders thousands of polygons efficiently (<100ms for 4000+ constituencies) but loses the DOM event model — click detection requires point-in-polygon testing via `d3.geoContains()`. This trades interaction simplicity for rendering performance.

**Option C — deck.gl (WebGL)**: Use Uber's deck.gl library with a `GeoJsonLayer` for GPU-accelerated rendering. Handles millions of vertices efficiently. Adds ~200KB to bundle size. Requires WebGL support (available in 97%+ of mobile browsers). Provides smooth zoom/pan with tile-based rendering. The most performant option but the heaviest dependency and most complex integration.

**Option D — Leaflet + react-leaflet**: Tile-based map with GeoJSON overlay. Leaflet handles pan/zoom natively with tile caching. GeoJSON polygons render as SVG overlays. Performance is good for moderate polygon counts (~500) but degrades with very complex boundaries. Adds map tile dependency (OpenStreetMap or similar). The most familiar UX (Google Maps-like) but least suited for a standalone election visualization (unnecessary base map clutter).

### Performance Assessment

For the V2 use case (single state at a time, 200–400 constituencies), **react-simple-maps with SVG is adequate**. The existing library is already integrated, and state-level rendering (234 constituencies for Tamil Nadu) is well within SVG's performance envelope. The 500ms render target specified in the V2 prompt is achievable for single-state views without changing rendering technology.

For a future all-India constituency view (4000+ polygons), canvas or WebGL would be necessary. This is not a V2 requirement.

### GeoJSON File Size Concerns

Raw constituency boundaries at full resolution can be 50–100MB per state. Simplification using Mapshaper or turf.js can reduce file sizes dramatically:
- Full resolution: ~1–5MB per state (234 constituencies)
- Simplified (0.1% of vertices): ~100–300KB per state
- TopoJSON (shared boundaries): ~50–150KB per state (50–70% smaller than GeoJSON due to arc sharing)

For web delivery, TopoJSON is strongly preferred. The `topojson-client` library (20KB gzipped) can convert TopoJSON to GeoJSON at runtime. State-specific files loaded on demand (code-split per state) keep initial bundle impact near zero.

### Key Constraint

The fundamental blocker is **data availability**, not technology. Constituency-level boundary files are not freely available in machine-readable format for all Indian states. Creating them requires either (a) purchasing commercial data, (b) tracing boundaries from ECI maps (labor-intensive), or (c) using community-sourced data of uncertain quality and completeness. For Tamil Nadu specifically, academic projects studying Tamil Nadu politics may have digitized boundaries — but verification is required.

---

## 5. Report Generation

### Python PDF Generation Libraries

**ReportLab** (reportlab.com):
- Industry standard for programmatic PDF generation in Python
- Low-level canvas API + higher-level `Paragraph`, `Table`, `Image` platypus framework
- Generates PDFs without external dependencies (no system packages, no headless browser)
- Charts via `reportlab.graphics.charts` (bar charts, pie charts, line charts)
- Supports custom fonts, colors, page templates, headers/footers
- **Size**: ~10MB installed
- **Performance**: 1–3 seconds for a 15-page report with tables and one chart
- **License**: BSD (open source community edition), commercial license for advanced features
- Already used extensively in Django and Flask applications
- The community edition lacks some features (e.g., barcode generation, advanced SVG support) but covers election report needs

**WeasyPrint** (weasyprint.org):
- HTML/CSS to PDF converter — write report as HTML, render to PDF
- Supports CSS Paged Media (page breaks, headers/footers, margins)
- Requires system-level dependencies: Pango, Cairo, GLib, libffi — these are C libraries that may be complex to install on Railway's containerized environment
- **Performance**: 3–8 seconds for a 15-page report (HTML parsing + CSS layout + PDF rendering)
- **Advantage**: Designers can style reports with CSS rather than learning ReportLab's API
- **Disadvantage**: System dependency installation adds Dockerfile complexity and potential deployment issues
- Charts must be pre-rendered as images (Matplotlib/Plotly → PNG → embedded in HTML)

**fpdf2** (github.com/py-pdf/fpdf2):
- Lightweight Python PDF library (pure Python, no C dependencies)
- Simple API: `pdf.cell()`, `pdf.multi_cell()`, `pdf.image()`
- ~1MB installed
- Performance: Fastest of the three for simple documents (~500ms for 15 pages)
- Limited styling capabilities — no CSS-like layouts, manual positioning required
- Good for simple tabular reports, inadequate for complex multi-section psephological reports

**Client-side generation (jsPDF + html2canvas)**:
- Generate PDF in the browser from rendered HTML
- No server-side computation or storage
- Quality depends on browser rendering
- Cannot access server-side data without pre-fetching everything
- Large file sizes (html2canvas produces raster images)
- Not suitable for publication-quality reports

### Server-Side vs Client-Side Trade-offs

Server-side generation (ReportLab or WeasyPrint) is appropriate for V2 because: (1) reports aggregate data from multiple database tables (survey submissions, predictions, quality scores) that shouldn't all be sent to the client, (2) report generation is a one-time operation (generate once, download the PDF) not a real-time interaction, (3) consistent output regardless of browser/device, (4) can be triggered via API and returned as a signed URL.

Client-side generation is appropriate only for simple, single-page exports (e.g., "download this chart as PDF"). For the multi-section psephological report described in V2, server-side is clearly better.

### Deployment Considerations

ReportLab is pure Python and installs via pip with no system dependencies — it works out-of-the-box in the existing Railway Docker container. WeasyPrint requires `apt-get install libpango1.0-dev libcairo2-dev libgdk-pixbuf2.0-dev` in the Dockerfile, adding ~50MB to the image and potential build complexity.

For report storage, the existing Redis cache can store report URLs temporarily (7-day TTL). Generated PDFs can be stored in the same object storage used for survey photos (R2 or Railway volumes).

### Performance Constraints

The V2 prompt estimates 5–10 seconds for a full state report. With ReportLab, a 15-page report with executive summary, methodology, 234-row constituency table, bar chart, and data provenance section should generate in 2–5 seconds. This is acceptable for synchronous API generation with an extended timeout. A Celery task queue is unnecessary for single-developer traffic levels — synchronous generation with a 30-second HTTP timeout is sufficient, with the frontend showing a loading spinner.

---

## 6. Real-Time Dashboard Architecture

### Current Infrastructure

The backend has **Redis** available (docker-compose includes `redis:7-alpine`, and `cache.py` implements Redis-backed caching with in-memory fallback). The cache module exposes `get_cached()`, `set_cached()`, and `invalidate()` functions with configurable TTL. No WebSocket or SSE infrastructure exists.

FastAPI natively supports all three real-time patterns:

### Polling (HTTP Long-Polling)

The simplest approach. The dashboard component sends `GET /v1/surveys/dashboard/{campaign_id}` every N seconds and renders the response. The V2 prompt specifies 30-second intervals.

- **Implementation**: Zero new infrastructure. The endpoint returns aggregated metrics (completion percentages, surveyor counts, quality scores, recent submissions). The frontend uses `setInterval` or React Query's `refetchInterval` option.
- **Bandwidth**: A dashboard response for a 1000-booth campaign with 50 surveyors is approximately 5–20KB of JSON. At 30-second intervals, this is ~60KB/minute — negligible.
- **Latency**: Updates appear within 0–30 seconds of submission. The "staleness" is bounded by the poll interval.
- **Server load**: With 5 coordinators polling simultaneously (realistic for a single campaign), the endpoint serves 10 requests per minute — trivial for the FastAPI + asyncpg stack.
- **Compatibility**: Works on all browsers, all network conditions, and behind all proxies/firewalls.

### Server-Sent Events (SSE)

A persistent HTTP connection from server to client, sending events as they occur.

- **Implementation**: FastAPI supports SSE via `StreamingResponse` with `text/event-stream` content type. A new endpoint `GET /v1/surveys/stream/{campaign_id}` yields events from a Redis Pub/Sub channel. Survey submission endpoints publish to the channel when new data arrives.
- **Bandwidth**: More efficient than polling — only sends data when events occur. But the persistent connection consumes one HTTP connection per dashboard client.
- **Latency**: Near real-time (<1 second from submission to dashboard update).
- **Complexity**: Requires Redis Pub/Sub integration (the `redis.asyncio` library in `requirements.txt` supports this). Requires handling connection drops and automatic reconnection (built into the browser `EventSource` API). Does not work behind some corporate proxies that close idle HTTP connections.
- **Compatibility**: `EventSource` API is supported in all modern browsers (Chrome, Firefox, Safari, Edge). Not supported in IE11 (irrelevant for V2's target user base).

### WebSockets

Bidirectional persistent connection between client and server.

- **Implementation**: FastAPI supports WebSockets natively. A `WebSocket /v1/surveys/ws/{campaign_id}` endpoint maintains a connection per client. Requires a WebSocket manager to track connections per campaign and broadcast updates.
- **Bandwidth**: Most efficient for bidirectional communication but overkill for a read-only dashboard (data flows server → client only).
- **Latency**: Lowest possible — sub-100ms from submission to dashboard update.
- **Complexity**: Significantly more complex than SSE or polling. Requires connection lifecycle management, heartbeat/ping frames, reconnection logic, and authentication for WebSocket upgrades. Railway's deployment model may not support persistent WebSocket connections without configuration (Railway uses HTTP routing that may time out idle WebSocket connections).
- **Compatibility**: Supported in all modern browsers. May be blocked by corporate firewalls or proxies.

### Assessment for V2

For the V2 use case (single developer, <50 simultaneous coordinators, 30-second update tolerance), **polling is the pragmatically correct choice**. The implementation effort is near zero — it's just a regular API endpoint with React Query's `refetchInterval: 30000`. The bandwidth cost is negligible. The latency is acceptable (30 seconds maximum). No new infrastructure is needed.

SSE is a reasonable upgrade path if real-time updates become important (e.g., monitoring a live survey campaign during election season). The migration from polling to SSE requires adding a Redis Pub/Sub channel and a streaming endpoint — approximately 2–4 hours of backend work.

WebSockets are over-engineered for this use case. The dashboard is read-only (server → client only), the update frequency is low, and the deployment environment may not fully support persistent connections.

---

## 7. Offline-First Patterns

### Current Frontend State

The Vite configuration (`vite.config.js`) has **no PWA plugin** — no service worker, no manifest.json with PWA metadata, no workbox integration. The `public/` directory contains only `favicon.svg`, `icons.svg`, and `robots.txt`. The `idb` package appears in `package-lock.json` only as a transitive dependency of Firebase (Firebase uses IndexedDB for offline persistence internally) — it is not a direct application dependency.

### Service Worker Integration with Vite

**vite-plugin-pwa** (vite-pwa.org) is the standard approach for adding service worker support to Vite applications. It wraps Google's Workbox library and provides:
- Automatic service worker generation during `vite build`
- Precaching of build assets (JS, CSS, HTML)
- Runtime caching strategies (NetworkFirst, CacheFirst, StaleWhileRevalidate) configurable per route pattern
- Background sync via Workbox's `BackgroundSyncPlugin` (uses the browser's Background Sync API when available, falls back to retry-on-reconnect)
- Web app manifest generation (for "Add to Home Screen" prompt)

Configuration would be added to `vite.config.js`:
```js
import { VitePWA } from 'vite-plugin-pwa';
// ...in plugins array:
VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    runtimeCaching: [
      { urlPattern: /\/v1\/surveys\//, handler: 'NetworkFirst' },
      { urlPattern: /\/v1\/factors/, handler: 'CacheFirst' },
    ],
    // Background sync for offline submissions
    // (requires custom service worker injection)
  },
})
```

### IndexedDB for Offline Storage

**Dexie.js** (dexie.org, ~25KB gzipped) is the most ergonomic IndexedDB wrapper for React applications. It provides:
- Declarative schema definitions with versioning
- Promise-based API (compatible with async/await)
- Live queries via `useLiveQuery()` React hook (reactive — UI updates when IndexedDB data changes)
- Built-in table/index management
- Sync protocol via Dexie Cloud (optional SaaS, not needed for V2 — manual sync is simpler)

An alternative is **idb** (already a transitive dependency via Firebase, ~2KB gzipped) — a thin Promise wrapper around the raw IndexedDB API. Lower-level but smaller.

For V2's survey submission queue, the schema would include:
- `pendingSubmissions` table: `{id (auto), boothId, campaignId, observations, confidenceScores, timestamp, syncStatus}`
- `cachedCampaigns` table: `{campaignId, config, booths[], lastSynced}`

### Background Sync API

The Background Sync API (`SyncManager.register()`) allows a service worker to defer network requests until connectivity is available. When the service worker detects connectivity, it fires a `sync` event where queued requests can be replayed.

**Browser support**:
- Chrome/Android: Full support since Chrome 49 (2016)
- Samsung Internet: Full support
- Firefox: Not supported (as of 2026)
- Safari/iOS: **Not supported** — this is the critical limitation. Safari does not implement the Background Sync API, and iOS Safari aggressively evicts service worker caches after ~7 days of inactivity.

**Fallback for Safari/iOS**: Implement application-level sync using IndexedDB + periodic check in `useEffect`. When the app detects connectivity (`navigator.onLine` + actual fetch probe), it drains the IndexedDB pending queue. This is less reliable than Background Sync (only works while the app tab is active) but provides basic offline support on iOS.

### Mobile Browser Compatibility Matrix

| Feature | Chrome Android | Samsung Internet | Safari iOS | Firefox Android |
|---------|---------------|-----------------|------------|-----------------|
| Service Workers | ✅ | ✅ | ✅ (limited) | ✅ |
| IndexedDB | ✅ | ✅ | ✅ | ✅ |
| Background Sync | ✅ | ✅ | ❌ | ❌ |
| Geolocation | ✅ | ✅ | ✅ | ✅ |
| Camera/file upload | ✅ | ✅ | ✅ | ✅ |
| Persistent storage | ✅ | ✅ | ⚠️ (7-day eviction) | ✅ |
| Add to Home Screen | ✅ | ✅ | ✅ | ❌ |

The iOS Safari limitations are significant: service worker caches are evicted after ~7 days without user interaction, and there is no Background Sync support. The offline-first experience on iOS will be notably inferior to Android. Progressive enhancement (full offline on Android, basic form caching on iOS) is the realistic approach.

### Implementation Pattern

The practical pattern for V2:
1. Survey form data is saved to IndexedDB immediately on user input (draft auto-save)
2. On "Submit" click, the submission is written to IndexedDB `pendingSubmissions` table with `syncStatus: 'pending'`
3. If online, immediately attempt to POST to the API. On success, mark `syncStatus: 'synced'`
4. If offline, show "Pending sync" indicator. Register a Background Sync event (Chrome/Samsung) or start a `setInterval` connectivity check (Safari/Firefox)
5. When connectivity returns, drain the pending queue sequentially
6. Display sync status: "Pending sync (3)" → "Syncing..." → "All synced ✅"
7. Cap offline submissions at 10–20 to prevent unbounded IndexedDB growth

---

## 8. Advanced ML Capabilities

### Bayesian Updating for Survey Integration

The V2 prompt describes a Bayesian framework where survey observations progressively override historical priors. In statistical terms:

**Prior**: Constituency-level vote share prediction from the formula/ML engine based on historical TCPD data. For party P in constituency C: $\text{prior} \sim \mathcal{N}(\mu_{prior}, \sigma^2_{prior})$ where $\mu_{prior}$ is the predicted vote share and $\sigma_{prior}$ is the error margin.

**Likelihood**: Survey observations from booth-level submissions. If K surveyors report an average support of $\bar{x}$ for party P in constituency C with variance $s^2$, the likelihood is $\text{likelihood} \sim \mathcal{N}(\bar{x}, s^2/K)$.

**Posterior**: Conjugate normal update:
$$\mu_{post} = \frac{\mu_{prior}/\sigma^2_{prior} + \bar{x}/(s^2/K)}{1/\sigma^2_{prior} + K/s^2}$$
$$\sigma^2_{post} = \frac{1}{1/\sigma^2_{prior} + K/s^2}$$

As survey coverage increases (K grows), the posterior shifts toward the survey mean and the posterior variance shrinks. When no survey data exists (K=0), the posterior equals the prior.

**Implementation complexity**: Low — this is straightforward arithmetic that can be implemented in both Python (API-side) and TypeScript (client-side). The challenge is in choosing appropriate prior variances (too tight → surveys have no effect; too loose → a single survey overrides the model) and handling multi-party scenarios (survey estimates for all parties must be jointly updated while maintaining the constraint that shares sum to 100%).

**Calibration**: Prior variances should be derived from the historical model's residual variance per state — states where the model has higher historical accuracy get tighter priors (survey data needs to be more compelling to override the model), while states with lower accuracy get looser priors.

### Online Learning Approaches

**Incremental model updates**: XGBoost does not natively support incremental learning (adding new data points without retraining from scratch). However, `xgb.train()` with the `xgb_model` parameter can continue training from an existing model with new data — effectively fine-tuning. This is faster than full retraining (~10% of training time) but risks overfitting to recent data.

**Alternative approaches**:
- **Stochastic Gradient Descent (SGD) classifiers**: scikit-learn's `SGDClassifier` supports `partial_fit()` for true online learning. Less accurate than XGBoost for tabular data but enables real-time model updates.
- **Logistic regression refit**: The coefficient derivation pipeline already uses logistic regression. Refitting with survey-augmented data is cheap (~1 second) and could be done on every N submissions.
- **Model averaging**: Maintain the original TCPD-trained model and a survey-updated model. Blend predictions with weights based on survey coverage (0% coverage → 100% TCPD model; 100% coverage → 80% survey model + 20% TCPD model).

### Anomaly Detection for Survey Fraud

**Outlier detection approaches**:

1. **Inter-surveyor consistency**: When multiple surveyors submit data for overlapping booths, compute pairwise agreement metrics. Surveyors whose observations consistently deviate from peers (>2 standard deviations) are flagged. This is the V2 prompt's "conflict detection" mechanism.

2. **Historical deviation flagging**: Compare survey-reported values against historical baselines. If a surveyor reports 90% turnout for a constituency that has never exceeded 75%, flag the submission. Threshold: deviation > 2× historical standard deviation for that constituency.

3. **Temporal pattern analysis**: Surveyors submitting too many booths per hour (more than ~8, given realistic transit time between polling stations), submitting identical values across multiple booths, or submitting at implausible times (3 AM) should be flagged.

4. **GPS verification**: Compare submission GPS coordinates against booth geolocation. If the surveyor is >5km from the assigned booth, flag as "remote entry." This catches surveyors entering data from home rather than at the polling station.

**Implementation**: A quality scoring function (described in the V2 prompt's Success Criteria 12) that combines completeness, consistency, confidence, timeliness, and photo evidence into a 0–100 score. Submissions below 50 are auto-flagged. This can be implemented as a Python function called during the survey submission API handler, with no ML dependency.

### SHAP Integration Gap

The V1 plan specified SHAP feature attributions in the ML API response, but the current implementation does not include this. The data science stack already has `shap==0.46.0` in requirements. For the `TreeExplainer` used with XGBoost, SHAP computation adds ~5–50ms per prediction batch (near-zero marginal cost for tree-based models). The API endpoint would need to:
1. Load or compute SHAP values alongside predictions
2. Return a `feature_attributions` field per constituency (top 5 factors with SHAP values)
3. Store `TreeExplainer` in memory alongside the ONNX session (requires access to the original XGBoost model, not the ONNX export — SHAP's `TreeExplainer` works with native XGBoost objects, not ONNX)

This creates a tension: the ONNX model is used for inference, but SHAP requires the original model object. Options: (a) serialize the XGBoost model as pickle/joblib alongside ONNX (security concern — pickle deserialization), (b) export SHAP base values and interaction values as static files during training and interpolate at runtime, (c) compute SHAP values during training and store per-constituency baselines, or (d) use ONNX-compatible SHAP computation (not natively supported by the `shap` library).

---

## 9. External Data Sources

### Constituency-Level Development Indices

**NITI Aayog Aspirational Districts Programme**: Publishes district-level composite development indices covering health, education, agriculture, financial inclusion, and basic infrastructure. Data is published at district level for 112 "aspirational" (underdeveloped) districts. Available at https://championsofchange.gov.in/ — free, publicly accessible. **Limitation**: Covers only 112 districts, not all ~770 districts. Cannot be mapped to assembly constituencies without a district-to-constituency mapping table (which requires manual curation since constituency boundaries don't align perfectly with district boundaries).

**Census 2011 Data**: The Census of India 2011 provides village-level and town-level socioeconomic data. District-level summary data is freely available at censusindia.gov.in. Key indicators: literacy rate, workforce participation, urbanization rate, SC/ST population percentage, sex ratio. The data is 15 years old but is the most comprehensive demographic dataset available for India. The TCPD dataset includes `district_name` for AE data, enabling direct joins.

**UNDP India Human Development Index**: State-level and district-level HDI data published periodically. Available for major states. Less granular than Census data but more recent.

**Electoral data enrichment**: The `rough/` directory contains enrichment scripts (`enrich_2011.py`, `enrich_2016.py`, `enrich_2021.py`, `enrich_csv.py`) that appear to process Tamil Nadu election results. These could serve as templates for integrating external data.

### Social Media Sentiment

**Twitter/X API**: Requires Basic tier ($100/month) for search functionality. The free tier provides only posting, not reading/searching. Academic Research access (free, higher limits) was discontinued by X in 2023. For a personal project with no budget, X API access is not feasible.

**Free alternatives**:
- **Reddit API**: Free tier with generous limits. Subreddits like r/IndiaSpeaks, r/india, r/Chennai have election-related discussions. Sentiment is text-heavy and may not map to constituency-level granularity.
- **Google Trends**: Free API (pytrends library) for search volume data. Can track interest in party names/candidate names by state. Not sentiment per se, but interest/salience as a proxy.
- **Pre-computed sentiment datasets**: Academic researchers (IIIT Hyderabad, IIT Bombay) occasionally release labeled Indian political sentiment datasets. Kaggle has some relevant datasets. These are static and not real-time.
- **RSS/news aggregation**: Free RSS feeds from Indian news sources (NDTV, The Hindu, India Today) can be parsed for constituency-mentioned articles. Sentiment analysis via VADER (English) or multilingual BERT is possible but noisy.

**Assessment**: Social media sentiment at constituency level is extremely difficult to obtain for free. Twitter/X data is paywalled, and alternatives provide state-level or national-level signals at best. The V2 prompt correctly flags this as a candidate for deferral.

### Demographic and Caste Data

**Legal constraints on caste data**: India's Constitution (Article 15, 16) and the Census Act (1948) govern caste data collection. The Caste Census has been politically contentious — only a Socio-Economic and Caste Census (SECC) 2011 was conducted alongside Census 2011, but its caste data was never fully published. OBC (Other Backward Classes) population estimates are available from Mandal Commission (1980) and National Commission for Backward Classes reports, but are dated and contested.

SC/ST population data is published by the Census and is freely available at district level. This is legally unproblematic to use. SC/ST constituency reservation status is already in the TCPD data (`constituency_type` field: GEN/SC/ST).

General caste/community sentiment data collected by surveyors is legally permissible if: (a) participation is voluntary, (b) data is anonymized at aggregation level (minimum 10 respondents), (c) it is not used for targeted caste-based campaigning (Model Code of Conduct violation). The V2 prompt correctly identifies this as requiring legal consultation and suggests deferral.

### Weather Data

**India Meteorological Department (IMD)**: Publishes forecasts and historical weather data. API access is available but documentation is limited and registration may be required. District-level rainfall data is published monthly.

**OpenWeatherMap**: Free tier provides 1000 API calls/day, current weather and 5-day forecast. Sufficient for constituency-level weather lookups during the final week before elections. Historical weather data requires a paid plan ($10/month).

**Assessment**: Weather data is freely available and trivially mappable to constituencies via district names. However, the predictive value is modest (weather affects turnout by ~1–3% in normal conditions, up to 10–15% in extreme events like cyclones). This is a low-priority enhancement.

---

## 10. Performance Architecture

### Database Growth Projections

**Survey submission storage**:
- One submission: ~1–2KB (JSONB observations + confidence scores + metadata)
- One campaign (1000 booths × 5 submissions average): ~5–10MB
- Multiple campaigns per election cycle: 3–5 campaigns × 10MB = 30–50MB
- Annual across multiple states: 10–20 campaigns × 10MB = 100–200MB per year

**Photo storage**:
- One photo (compressed to ≤500KB): 0.5MB
- One campaign (1000 booths × 1 photo average): ~500MB
- Annual: 5–10GB in object storage

**Booth-level prediction data** (if stored):
- UP has ~150,000+ booths. Storing predictions per booth: ~500 bytes × 150,000 = ~75MB per prediction run
- If predictions are stored for multiple slider configurations (scenario comparison): grows proportionally
- If predictions are computed on-demand and not stored, database impact is zero

**Total database growth**:
- Survey submissions: 100–200MB/year
- Existing TCPD data: ~50–100MB (one-time, grows slowly with new elections)
- Model metadata, bookmarks, users: <10MB
- Total PostgreSQL: ~200–400MB after first year of V2 usage

Railway's free PostgreSQL tier has a **500MB** limit (recently increased from 1GB to 500MB data, subject to change). This is tight for V2 data volumes. A paid plan ($5/month for 5GB) would be needed if survey campaigns generate significant data.

### Query Performance Strategies

**Survey dashboard queries**: The dashboard endpoint aggregates data across three tables (campaigns, booths, submissions). Key queries:
1. Completion rate: `SELECT COUNT(DISTINCT booth_id) FROM survey_submissions WHERE campaign_id = X` — requires index on `(campaign_id, booth_id)`.
2. Per-constituency completion: `SELECT sb.constituency_no, COUNT(DISTINCT ss.booth_id) FROM survey_booths sb LEFT JOIN survey_submissions ss ON sb.booth_id = ss.booth_id WHERE sb.campaign_id = X GROUP BY sb.constituency_no` — requires indexes on both tables.
3. Surveyor leaderboard: `SELECT surveyor_user_id, COUNT(*), AVG(quality_score) FROM survey_submissions WHERE campaign_id = X GROUP BY surveyor_user_id` — requires index on `(campaign_id, surveyor_user_id)`.
4. Recent activity: `SELECT * FROM survey_submissions WHERE campaign_id = X ORDER BY created_at DESC LIMIT 5` — requires index on `(campaign_id, created_at)`.

With proper indexing, all dashboard queries should complete in <50ms for a 1000-booth campaign with 10,000 submissions. The PostgreSQL query planner handles these aggregation patterns efficiently.

**Booth-level prediction queries**: If booth-level predictions are computed on-demand:
- Formula mode: 300 booths × 12 factors = 3600 arithmetic operations = <1ms client-side
- ML mode: 300 booths × 12 features → 300 ONNX inferences = ~10–50ms server-side
- Database query to fetch booth data: one query per constituency = <10ms

The 3-second target for the booth-level prediction endpoint is easily achievable.

### Caching Strategies

**Dashboard caching**: Cache dashboard responses per campaign with 30-second TTL (matching the polling interval). Invalidate on new submission. This ensures the dashboard endpoint serves cached responses for the majority of requests.

**Prediction caching**: The existing bucketed caching (slider values rounded to nearest 5) works for booth-level predictions too. Cache key: `booth_pred:{constituency_no}:{bucketed_factors}`. TTL: 5 minutes (same as current ML prediction cache).

**Static data caching**: Factor catalog, coefficients, and alliance data are static — cache with 24-hour TTL (already implemented). GeoJSON constituency boundaries should be served with long-lived cache headers (`Cache-Control: max-age=86400, immutable`) since boundaries don't change between delimitations.

### Write Load Assessment

Under peak survey activity (50 surveyors × 1 submission/minute = 50 writes/minute):
- PostgreSQL: 50 INSERT/minute is trivial for any PostgreSQL configuration
- Connection pool: The default asyncpg pool (2–10 connections) handles 50 writes/minute without contention
- Redis: 50 cache invalidation/minute is negligible
- Object storage: 0–1 photo upload/minute (not all submissions include photos)

The write load from V2 survey features is far below the threshold where database scaling becomes a concern. The existing asyncpg pool configuration (`DB_POOL_MIN_SIZE=2`, `DB_POOL_MAX_SIZE=10`) is adequate.

---

## Architectural Constraints

### Backend Patterns to Preserve

1. **Dual route registration**: All new route files must register under both the `v1` APIRouter and app-level router, following the pattern in `main.py` lines 549–569.
2. **Cache abstraction**: Use `get_cached()`/`set_cached()` from `cache.py`, not direct Redis calls.
3. **Auth dependency injection**: Use `require_user`, `get_current_user`, `require_tier` from `auth.py`.
4. **Pydantic validation**: All request models use `Field(ge=..., le=...)` constraints. Response models use `type | None = None` for optional fields.
5. **ORJSONResponse**: All endpoints return `ORJSONResponse` for performance.
6. **Parameterized queries**: All SQL uses `$1`, `$2` via asyncpg — no f-strings or string interpolation in queries.

### Frontend Patterns to Preserve

1. **Radix UI primitives**: All interactive components use Radix UI (Collapsible, Dialog, Slider, Select, Tabs, Tooltip, ToggleGroup).
2. **Tailwind CSS**: Styling via utility classes, no CSS modules or styled-components.
3. **React 19**: Using modern React features (no class components).
4. **Vite build**: Manual chunks configured for Firebase, Recharts, Radix, Motion, and vendor bundles.
5. **Vitest testing**: Test infrastructure is configured with jsdom environment and globals.

### Database Migration Pattern

Alembic migrations follow the sequential numbering pattern (`0001_initial`, `0002_subscriptions`, ..., `0006_model_metadata`). New survey tables should be added as `0007_survey_tables`. The migration should be backward-compatible (CREATE TABLE IF NOT EXISTS, no ALTER existing tables destructively).

---

## Security Findings

### Authentication and Authorization

The existing auth system provides a solid foundation for V2. JWT tokens include `sub` (user_id), `role`, `aud` (audience), `exp`, and `iat` claims. The `role` field currently supports `user` and `admin`. Adding `surveyor` and `coordinator` roles requires modifying the CHECK constraint on `users.role`.

**New security requirements for V2**:

1. **Campaign-level authorization**: Survey endpoints must verify that the requesting user has access to the specific campaign. This is a row-level security check, not a role check — a surveyor for Campaign A should not access Campaign B's data. Implementation: verify `user.id IN campaign.assigned_surveyors OR user.id == campaign.creator_user_id OR user.role == 'admin'`.

2. **File upload security**: Photo uploads must be validated (MIME type, file size, magic bytes). Filenames must be sanitized (UUID-based naming). Uploaded files must not be executable. Storage paths must prevent directory traversal.

3. **Survey data privacy**: When campaigns are marked `private`, survey submissions and raw observations must not be accessible to non-assigned users. Aggregated predictions derived from survey data may be visible, but raw surveyor responses must be redacted.

4. **Rate limiting for survey submission**: The V2 prompt suggests 100 submissions per surveyor per day. This should be enforced server-side to prevent automated bulk submission attacks. A dedicated rate limit for `POST /v1/surveys/booths/{booth_id}/submit` is appropriate (e.g., 10 submissions per minute per user, 100 per day per user).

5. **CSRF protection**: Survey submission from mobile browsers requires CSRF token validation (already implemented via the `csrf_token` cookie and header check pattern). The existing httpOnly JWT cookie + non-httpOnly CSRF cookie pattern works for survey forms without modification.

### Data Sensitivity

Survey data may include sensitive voter sentiment observations, geographic location of surveyors (GPS coordinates), and potentially caste/community information. The database should store GPS coordinates with limited precision (5 decimal places = ~1.1m accuracy, sufficient for booth verification without precise surveyor tracking). Caste data, if collected, must be stored only in aggregate form (never individual responses). Audit logs for survey submissions should not include raw observation values — only submission_id, user_id, timestamp, and review actions.

---

## Performance Findings

### Current System Performance Characteristics

The existing API serves election data efficiently: single SQL queries with proper indexing, 24-hour cache TTL, ORJSONResponse for fast serialization, GZip middleware for compression. The frontend prediction engine completes 200-constituency × 12-factor computations in <10ms. The 200ms debounce prevents excessive recomputation during slider dragging.

### V2 Performance Implications

1. **Survey submission endpoint**: Target <500ms at p95. The handler writes one row to `survey_submissions`, optionally uploads a photo, and triggers a quality score computation. With proper indexing, the database write is <5ms. Photo upload to R2 adds 100–500ms depending on image size and network. Quality scoring is pure arithmetic, <1ms. Total: 100–500ms, meeting the target.

2. **Dashboard endpoint**: Target <2 seconds. Aggregation queries across 10,000 submissions with proper indexes: <50ms. JSON serialization of dashboard response: <5ms. Cached responses: <1ms. Total: <100ms with warm cache, <500ms cold.

3. **Booth-level prediction endpoint**: Target <3 seconds for 200–300 booths. Formula mode: <1ms (client-side computation). ML mode: ONNX inference for 300 predictions = ~10–50ms. Database query for constituency historical data: <10ms (already cached by existing endpoint). Feature assembly: <5ms. Total: <100ms, well within target.

4. **Report generation**: Target <10 seconds. ReportLab rendering of a 15-page PDF with tables and charts: 2–5 seconds. Database queries for report data: <100ms (uses cached prediction results). Total: 2–6 seconds, within target.

5. **Heat map rendering**: Target <500ms for 234 constituencies (Tamil Nadu). SVG rendering via react-simple-maps: ~50–100ms for 234 `<path>` elements. GeoJSON parsing and projection: ~20–50ms (cached after first render). Color mapping: <1ms. Total: <200ms, well within target.

### N+1 Query Prevention

The survey dashboard must avoid N+1 patterns when computing per-constituency metrics. The dashboard endpoint should use batch queries:
- One query for campaign metadata
- One query with `GROUP BY constituency_no` for per-constituency completion
- One query with `GROUP BY surveyor_user_id` for leaderboard
- One query with `ORDER BY created_at DESC LIMIT N` for activity feed
- Total: 4 queries, regardless of campaign size

---

## Edge Cases and Risks

### Survey Data Quality

1. **GPS spoofing**: Surveyors can fake GPS coordinates using developer tools or GPS spoofing apps. Mitigation: cross-reference submission GPS with booth location (flag if >5km), but do not block submission (legitimate use cases exist — poor GPS signal indoors, surveyor entering data at a nearby cafe).

2. **Duplicate submissions**: Multiple surveyors submitting for the same booth-factor combination. Mitigation: the conflict detection system described in V2 (weighted average based on quality scores, with admin review for large discrepancies).

3. **Offline clock skew**: If a surveyor's device clock is incorrect, submission timestamps may be inaccurate, affecting timeliness scoring. Mitigation: record both client-side timestamp and server-side `created_at` — use server timestamp for ordering, client timestamp for timeliness scoring only when the difference is <1 hour.

4. **Surveyor churn**: If a surveyor is removed from a campaign mid-survey, their pending offline submissions should still be accepted (the assignments existed when submissions were created). The API should accept submissions from previously-assigned surveyors within a 48-hour grace period.

### Booth-Level Prediction Edge Cases

1. **Zero historical data**: New constituencies (post-delimitation or new states like Telangana) have no previous election data for that constituency number. Synthetic disaggregation has no baseline. Mitigation: use state-average baseline for new constituencies.

2. **Booth count mismatch**: The number of booths per constituency changes between elections (population growth, voter roll cleanup). Historical booth-level data (if acquired) may have different booth counts than current voter rolls. Mitigation: map by booth number and handle additions/deletions gracefully.

3. **Partial survey coverage**: When only 10% of booths are surveyed, booth-level predictions are a mix of survey-anchored and synthetic-disaggregated values. The aggregation to constituency level should weight surveyed booths more heavily, but the error margins should reflect the incomplete coverage.

### Deployment Edge Cases

1. **Railway resource limits**: Railway's free tier has CPU/memory limits that may constrain concurrent report generation or ML inference under load. A single ReportLab render + ONNX inference running simultaneously could spike memory usage briefly. Mitigation: sequential processing (no concurrent report generation — use a queue or semaphore).

2. **PostgreSQL storage on Railway**: Railway's PostgreSQL plugin has storage limits. Survey data (submissions + photos URLs) grows linearly with campaign activity. Implement data archival for campaigns older than 1 year (move to CSV export, delete from database).

3. **Service worker cache invalidation**: When the frontend is updated (new build deployed), the service worker cache may serve stale JavaScript. vite-plugin-pwa's `registerType: 'autoUpdate'` handles this by automatically activating new service workers, but users may need to reload the page. In the surveyor workflow, a stale form definition could cause submission failures. Mitigation: version the questionnaire_config and validate client version against server version before submission.

---

## Quantitative & Statistical Findings

This section is skipped as the research topic concerns system architecture, API design, and infrastructure rather than numerical analysis of election data.

---

## Frontend Visual & UX Findings

This section is skipped as the research topic concerns backend architecture, data feasibility, and technology evaluation rather than visual or interactive frontend inspection.
