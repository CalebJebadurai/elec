# Prediction Platform V2 — Detailed Implementation Report

**Source Plan:** `_architect/analysis/2026-04-30-prediction-v2.md`
**Date:** 2026-04-30
**Technology Stack:** Python 3.11+ / FastAPI / asyncpg / PostgreSQL / Redis / React 18 / TypeScript / Vite / Radix UI / Tailwind CSS / Docker / Railway

---

## Phase 1: Survey Questionnaire and Backend Infrastructure

This phase builds the foundation for the entire V2 system. It is the largest phase and should be split into two pull requests: PR 1A for the database schema and API endpoints, and PR 1B for the frontend questionnaire and prediction engine integration.

### Step 1.1: Survey Database Schema

Create a new Alembic migration file at `api/alembic/versions/0007_survey_tables.py`. The migration creates four new tables following the existing CREATE TABLE IF NOT EXISTS pattern used in `api/main.py` lifespan. In addition to the Alembic migration, add the same CREATE TABLE IF NOT EXISTS statements to the lifespan function in `api/main.py` (after the existing `model_metadata` table creation block around line 490) to maintain the auto-create behavior for Railway deployments.

The `campaigns` table has columns: `id SERIAL PRIMARY KEY`, `name TEXT NOT NULL`, `state_name TEXT NOT NULL`, `election_type TEXT NOT NULL DEFAULT 'AE'`, `election_year INTEGER NOT NULL`, `created_by INTEGER NOT NULL REFERENCES users(id)`, `status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived'))`, `question_subset JSONB`, `visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public'))`, `deleted_at TIMESTAMPTZ`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`.

The `survey_booths` table has columns: `id SERIAL PRIMARY KEY`, `campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE`, `constituency_no INTEGER NOT NULL`, `booth_number INTEGER NOT NULL`, `booth_name TEXT`, `latitude NUMERIC(8,5)`, `longitude NUMERIC(8,5)`, `estimated_electors INTEGER`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, with a unique constraint on `(campaign_id, constituency_no, booth_number)`.

The `survey_submissions` table has columns: `id SERIAL PRIMARY KEY`, `campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE`, `constituency_no INTEGER NOT NULL`, `booth_number INTEGER`, `surveyor_user_id INTEGER NOT NULL REFERENCES users(id)`, `submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `synced_at TIMESTAMPTZ`, `gps_latitude NUMERIC(8,5)`, `gps_longitude NUMERIC(8,5)`, `confidence_rating INTEGER CHECK (confidence_rating BETWEEN 1 AND 5)`, `quality_score NUMERIC(4,2)`, `raw_responses JSONB NOT NULL`, `computed_factors JSONB NOT NULL`, `question_order JSONB`, `status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'reviewed', 'flagged'))`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.

The `surveyor_assignments` table has columns: `id SERIAL PRIMARY KEY`, `campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE`, `user_id INTEGER NOT NULL REFERENCES users(id)`, `constituency_no INTEGER NOT NULL`, `booth_numbers INTEGER[]`, `assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `deadline TIMESTAMPTZ`, with a unique constraint on `(campaign_id, user_id, constituency_no)`.

Create indexes: `idx_campaigns_created_by ON campaigns(created_by)`, `idx_campaigns_state ON campaigns(state_name)`, `idx_campaigns_status ON campaigns(status) WHERE deleted_at IS NULL`, `idx_submissions_campaign ON survey_submissions(campaign_id)`, `idx_submissions_surveyor ON survey_submissions(surveyor_user_id)`, `idx_submissions_constituency ON survey_submissions(campaign_id, constituency_no)`, `idx_assignments_campaign ON surveyor_assignments(campaign_id)`, `idx_assignments_user ON surveyor_assignments(user_id)`, `idx_booths_campaign ON survey_booths(campaign_id)`.

### Step 1.2: Campaign-Scoped Role Model

The existing `users` table has a role CHECK constraint limited to `'user'` and `'admin'` (visible in `api/main.py` around line 438). Do not alter this constraint. Instead, campaign-level roles are determined entirely from the `surveyor_assignments` table and the `campaigns.created_by` column:

- A user whose `id` matches `campaigns.created_by` is that campaign's coordinator.
- A user who has rows in `surveyor_assignments` for a campaign is that campaign's surveyor.
- A user with global role `'admin'` has access to all campaigns.

This means no schema changes to the users table. Role resolution is done at query time in the authorization dependency (Step 1.5b).

### Step 1.3: Questionnaire Configuration

Create the file `api/factor_data/questionnaire.json`. This file follows the same static JSON pattern as the existing `factor_catalog.json`, `coefficients.json`, and `alliance_data.json` files in `api/factor_data/`. The questionnaire JSON is an array of question objects, each with fields: `id` (string, unique identifier like `"q_turnout_change"`), `text` (string, the question text), `response_type` (one of `"five_point_scale"`, `"numeric"`, `"multiple_choice"`, `"yes_no"`), `factor_mapping` (string, the prediction factor name this maps to, e.g. `"turnoutChange"`), `translation_function` (object describing how to convert the response to a factor value — for five-point scales: `{ "type": "linear_map", "input_range": [1, 5], "output_range": [-30, 30] }`), `help_text` (string, guidance for surveyors), `required` (boolean), `section` (either `"quantitative"` or `"qualitative"`), and `translations` (object with language keys mapping to localized text, e.g. `{ "ta": "...", "hi": "..." }`).

The questionnaire includes twelve questions mapping to the twelve existing V1 factors (turnoutChange, incumbencyFatigue, turncoatPenalty, recontestBonus, sameConstituencyBonus, previousMarginFactor, enopFactor, nCandFactor, constituencyTypeFactor, genderFactor, partyStrengthFactor, partyVoteShareFactor) and eight questions for the new qualitative factors (localIssueSalience, candidatePersonalAppeal, communityConsolidation, welfareSchemeImpact, developmentSatisfaction, mediaInfluence, moneyDistributionPerception, partyWorkerActivity).

Load this JSON in `api/factor_routes.py` alongside the existing factor data, using the same `_load_json` helper. Add a new endpoint `GET /questionnaire` on the `factor_router` that returns the full questionnaire template. Add `GET /questionnaire/{campaign_id}` that returns the questionnaire filtered to the campaign's `question_subset` (or the full template if no subset is defined).

On the frontend, create a corresponding data file at `frontend/src/engine/data/questionnaire.json` (following the pattern of `factor_catalog.json` which is imported directly by `factorConfig.ts`), or fetch it from the API at campaign load time. API fetch is preferred since the questionnaire may be campaign-specific.

### Step 1.4: New Qualitative Factors and Orthogonality Groupings

Update `api/factor_data/factor_catalog.json` to add eight new entries. Each entry follows the same schema as existing entries (visible in `factorConfig.ts` — `FactorCatalogEntry` interface with name, displayName, category, level, sliderType, range, step, defaultValue, defaultType, direction, tooltip). Add a new category value `"qualitative_survey"` to the FactorCategory type in `factorConfig.ts`.

The eight new factors:

1. `welfareSchemeImpact` — category: `"qualitative_survey"`, level: `"constituency"`, range: `{ min: -50, max: 50 }`, step: 5, defaultValue: 0, direction: `"bidirectional"`, composite group: `"governance_satisfaction"`
2. `developmentSatisfaction` — same structure, composite group: `"governance_satisfaction"`
3. `candidatePersonalAppeal` — composite group: `"campaign_strength"`
4. `partyWorkerActivity` — composite group: `"campaign_strength"`
5. `localIssueSalience` — independent (no composite)
6. `communityConsolidation` — independent
7. `mediaInfluence` — independent
8. `moneyDistributionPerception` — independent

Add a `compositeGroup` field (optional string) to the `FactorCatalogEntry` interface in `factorConfig.ts` and to each entry in the JSON. Existing twelve factors have `compositeGroup: null`.

Update `api/factor_data/coefficients.json` to add initial coefficients for the eight new factors under both `_national` and state-specific keys (e.g., `Tamil_Nadu`). Initial coefficients are expert-derived starting points:
- `welfareSchemeImpact`: 0.06 (pro-incumbent)
- `developmentSatisfaction`: 0.05 (pro-incumbent)
- `candidatePersonalAppeal`: 0.07 (boosts candidate's party)
- `partyWorkerActivity`: 0.04 (boosts party)
- `localIssueSalience`: -0.06 (anti-incumbent)
- `communityConsolidation`: 0.08 (boosts dominant party)
- `mediaInfluence`: 0.05 (directional)
- `moneyDistributionPerception`: 0.04 (pro-incumbent)

Update the `AppPredictionParams` interface in `frontend/src/types.ts` to add the eight new factor fields (all defaulting to 0). Update the `FactorParams` interface and `ZERO_FACTORS` constant in `frontend/src/engine/predictionEngine.ts` to include the eight new factors.

### Step 1.5: Survey API Endpoints

Create a new file `api/survey_routes.py` following the pattern of existing route files (`bookmark_routes.py`, `factor_routes.py`). Define a `survey_router = APIRouter(prefix="/surveys", tags=["surveys"])`.

Register it in `api/main.py` following the dual-registration pattern:

In the v1 router block (around line 570): `v1.include_router(survey_router)`.
In the legacy block (around line 580): `app.include_router(survey_router)`.
Add the import at the top: `from survey_routes import survey_router`.

Define Pydantic request/response models in `api/survey_routes.py` (following the pattern in `prediction_routes.py` which defines `FactorInput`, `MLPredictRequest`, etc. inline):

- `CampaignCreate(BaseModel)`: name (str), state_name (str), election_type (str, default "AE"), election_year (int), question_subset (list of str, optional), visibility (str, default "private")
- `CampaignOut(BaseModel)`: id, name, state_name, election_type, election_year, status, visibility, created_by, question_subset, created_at, updated_at
- `BoothCreate(BaseModel)`: constituency_no (int), booth_number (int), booth_name (str, optional), latitude (float, optional), longitude (float, optional), estimated_electors (int, optional)
- `AssignmentCreate(BaseModel)`: user_id (int), constituency_no (int), booth_numbers (list of int)
- `SubmissionCreate(BaseModel)`: constituency_no (int), booth_number (int, optional), raw_responses (dict), confidence_rating (int, ge=1, le=5), gps_latitude (float, optional), gps_longitude (float, optional)
- `SubmissionOut(BaseModel)`: id, campaign_id, constituency_no, booth_number, surveyor_user_id, submitted_at, confidence_rating, quality_score, raw_responses, computed_factors, status
- `AggregatedFactors(BaseModel)`: constituency_no (int), factor_values (dict of str to float), submission_count (int), avg_quality_score (float), coverage_pct (float)

Endpoints:

`POST /surveys/campaigns` — accepts `CampaignCreate`, inserts into campaigns table with `created_by` from the authenticated user (`require_user` dependency from `api/auth.py`). Returns `CampaignOut`. Validates that `state_name` exists in tcpd_ae by checking `SELECT DISTINCT state_name FROM tcpd_ae WHERE state_name = $1`, returning 404 if not found. If `question_subset` is provided, validates that all IDs exist in the questionnaire JSON.

`GET /surveys/campaigns` — lists campaigns where the user is coordinator or has assignments. Uses `require_user`. Query: `SELECT * FROM campaigns WHERE deleted_at IS NULL AND (created_by = $1 OR id IN (SELECT campaign_id FROM surveyor_assignments WHERE user_id = $1)) ORDER BY created_at DESC`.

`GET /surveys/campaigns/{id}` — returns campaign with summary stats (submission count, surveyor count, completion percentage). Protected by `require_campaign_access`.

`POST /surveys/campaigns/{id}/booths` — accepts list of `BoothCreate`. Bulk inserts. Protected by `require_campaign_access(coordinator)`.

`POST /surveys/campaigns/{id}/assign` — accepts `AssignmentCreate`. Inserts into surveyor_assignments. Protected by `require_campaign_access(coordinator)`.

`POST /surveys/campaigns/{id}/submissions` — accepts `SubmissionCreate` or list thereof. This is the most complex endpoint — see Steps 1.6 and 1.7 for validation and quality scoring. Protected by `require_campaign_access(surveyor)`. Validates that the surveyor is assigned to the specified constituency. Apply rate limiting: 10 submissions per minute per user via Redis counter with key `survey_rate:{user_id}` and 60-second TTL (using the same `_get_redis` helper from `api/cache.py`).

`GET /surveys/campaigns/{id}/submissions` — lists submissions with optional filters (constituency_no, surveyor_user_id, status). Protected by `require_campaign_access`. Coordinators see all, surveyors see only their own.

`GET /surveys/campaigns/{id}/aggregated` — returns per-constituency aggregated factor profiles. Computes quality-weighted averages of computed_factors across all submissions for each constituency. Protected by `require_campaign_access`.

`GET /surveys/campaigns/{id}/export` — returns raw submission data as CSV. Uses `StreamingResponse` (following the pattern in `export_routes.py`). Protected by `require_campaign_access(coordinator)`.

### Step 1.5b: Campaign-Level Authorization Dependency

Create a `require_campaign_access` function in `api/auth.py`, placed after the existing `require_tier` function (around line 155). This follows the same dependency factory pattern as `require_tier`:

The function takes `campaign_id` (path parameter) and `allowed_roles` (tuple of strings: `"coordinator"`, `"surveyor"`, `"admin"`). It returns a FastAPI dependency that:

1. Calls `require_user` to get the authenticated user dict.
2. Queries the campaigns table for the campaign (with `deleted_at IS NULL`). Returns 404 if not found.
3. Checks: (a) if user role is `"admin"` in the JWT payload, access is granted with campaign_role `"admin"`; (b) if `campaign.created_by` equals `int(user["sub"])`, access is granted with campaign_role `"coordinator"`; (c) if a row exists in `surveyor_assignments` for this campaign and user, access is granted with campaign_role `"surveyor"`.
4. If the user's campaign_role is not in `allowed_roles`, returns 403.
5. Returns a dict combining the user dict with `campaign_role` and `campaign_id`.

Usage in endpoints: `user = Depends(require_campaign_access("coordinator", "admin"))` for coordinator-only endpoints, or `user = Depends(require_campaign_access("coordinator", "surveyor", "admin"))` for any participant.

Since `campaign_id` comes from the path, the dependency reads it from the request path parameters. This mirrors how `require_tier` reads tier from the JWT but adds a database query for row-level access control.

### Step 1.6: Submission Validation and Quality Scoring

Within the `POST /surveys/campaigns/{id}/submissions` endpoint handler, implement the following validation pipeline before database insertion:

First, load the campaign's question subset (or the full questionnaire if no subset). For each key in the submitted `raw_responses` dict, validate:
- The key matches a question ID in the campaign's active questionnaire.
- The value type matches the question's `response_type`: for `five_point_scale`, must be int 1-5; for `numeric`, must be a number within the factor's defined range (from factor_catalog.json); for `multiple_choice`, must be a valid option string; for `yes_no`, must be boolean.
- No unrecognized keys exist.

Reject with 422 and specific error messages if validation fails. Use Pydantic's `model_validator` with dynamic field constraints derived from the questionnaire JSON.

Compute the `computed_factors` dict by applying each question's `translation_function` to the corresponding response value. For composite groups (governance_satisfaction, campaign_strength), average the component factor values to produce the composite value. Store both the individual factor values and the composite values.

Compute `quality_score` as a weighted combination:
- Completeness (40% weight): fraction of required questions answered.
- Internal consistency (30% weight): check for contradictory responses within composite groups (e.g., high welfareSchemeImpact but low developmentSatisfaction reduces score). Use Pearson correlation within composite groups — positive correlation expected, negative correlation flags inconsistency.
- Time spent (15% weight): calculated from `submitted_at - assigned_at` for the booth. If under 30 seconds, score is 0 for this component (flagged suspicious). If over 2 minutes, full score.
- GPS proximity (15% weight): if GPS is provided and the booth has coordinates, compute Haversine distance. Within 5km: full score. Outside 5km: reduced score. GPS not provided (opt-in): full score (no penalty for not providing GPS).

### Step 1.7: Conflict Detection

Create a background function `check_constituency_conflicts(campaign_id, constituency_no)` called after each submission. Query all submissions for the given constituency within the campaign. For each factor in `computed_factors`, compute the mean and standard deviation across submissions. If any submission's factor value differs from the mean by more than 2 standard deviations, mark the constituency as conflicted by setting the anomalous submissions' status to `"flagged"`.

The coordinator can resolve conflicts via `PUT /surveys/campaigns/{id}/submissions/{submission_id}/resolve` with a body specifying the resolution action: `"accept"` (keep as-is), `"reject"` (exclude from aggregation), or `"override"` (coordinator provides a manual factor value).

### Step 1.8: Frontend Questionnaire Component

Create `frontend/src/components/SurveyQuestionnaireForm.tsx`. This component:

- Fetches the questionnaire config from `GET /v1/factors/questionnaire/{campaign_id}` on mount.
- Renders questions dynamically based on `response_type`:
  - `five_point_scale`: Five large radio buttons arranged horizontally (1-5 with labels "Strongly Disagree" to "Strongly Agree"), using Radix UI RadioGroup. Touch targets minimum 44px per WCAG guidelines.
  - `numeric`: Number input with min/max from the factor range, using the existing Radix UI Slider component (same pattern as PredictionPanel.tsx uses for factor sliders).
  - `multiple_choice`: Radix UI Select or RadioGroup depending on single/multi select.
  - `yes_no`: Two large toggle buttons using Radix UI ToggleGroup.
- Renders questions in randomized order within each section (quantitative, then qualitative). Stores the randomization seed (use `Math.random()` seeded with the submission timestamp) in form state for submission metadata.
- Shows a progress indicator at the top (e.g., "Question 5 of 12") using a simple div with Tailwind width percentage.
- Supports swipeable navigation: Next/Previous buttons at the bottom (one question per screen on mobile, all questions visible on desktop).
- At the end, shows a confidence rating (1-5 stars or radio) and a Submit button.
- On submit, validates all required fields, constructs a `SubmissionCreate` payload, and posts to `POST /v1/surveys/campaigns/{campaign_id}/submissions`.

Style with Tailwind CSS following existing component patterns. Use single-column layout for mobile compatibility. The component is used within the surveyor mobile landing page (Phase 2).

### Step 1.9: Survey Data Integration with Prediction Engine

Modify `frontend/src/components/PredictionPanel.tsx` to add survey data loading. When a campaign is selected (via a new Campaign Selector dropdown at the top of PredictionPanel), fetch `GET /v1/surveys/campaigns/{id}/aggregated`. For each constituency that has survey data, set the corresponding factor slider values to the survey-derived values instead of the default 0.

Add a visual indicator next to each factor slider: a small badge showing "Survey" (green) if the value comes from survey data, or "Default" (gray) if using the model default. This uses Radix UI Badge or a simple styled span.

In `frontend/src/engine/predictionEngine.ts`, the survey data integration requires no engine changes for formula mode — the survey values simply become the slider values passed to `generateBaseline`. The engine already applies factors as multiplicative modifiers. The key change is in how default values are populated, not in how the engine computes.

For consistent Bayesian-style behavior in formula mode: when survey data is present for a constituency, narrow the error margin. In the `generateBaseline` function, after computing `adjustedError`, check if the constituency has survey coverage. If survey coverage exceeds 50% of booths in that constituency, reduce the error by 20%: `adjustedError *= 0.8`. This requires passing a survey coverage map as an optional parameter to `generateBaseline`.

### Step 1.10: File Upload Security

Create a new file `api/upload_routes.py` with an `upload_router = APIRouter(prefix="/uploads", tags=["uploads"])`. Register it in `api/main.py` following the dual-registration pattern.

The `POST /uploads/survey-photo` endpoint:

- Accepts `multipart/form-data` with a `file` field (using FastAPI's `UploadFile`) and a `campaign_id` field.
- Validates the user has campaign access via `require_campaign_access`.
- Reads the first 8 bytes to check magic bytes: JPEG starts with `FF D8 FF`, PNG starts with `89 50 4E 47`. Reject if magic bytes don't match the declared content type with 422.
- Checks file size: if `Content-Length` exceeds 5MB, reject with 413 (already partially handled by the existing `RateLimitMiddleware` body size check in `api/main.py`, but the 5MB limit for uploads is stricter than the 10MB global limit).
- Generates a UUID filename: `f"{uuid4()}.{extension}"`.
- Compresses using Pillow: open the image, resize if either dimension exceeds 2048px (preserving aspect ratio), save as JPEG at quality=75 (targeting approximately 500KB).
- Stores to `api/uploads/{campaign_id}/` in development, or to Cloudflare R2 in production (controlled by `STORAGE_BACKEND` env var).
- Returns the file URL. For local storage, return the relative path. For R2, return a signed URL with 24-hour expiry generated via boto3's S3 `generate_presigned_url`.

Add `Pillow` and `boto3` to `api/requirements.txt`.

### Step 1.11: Survey Methodology Controls

Question order randomization is implemented in the frontend `SurveyQuestionnaireForm.tsx` (Step 1.8). The randomization seed is derived from the current timestamp when the form loads. Store the seed and the resulting question order array in the submission metadata (`question_order` field in `survey_submissions`).

The optional surveyor calibration exercise is a deferred feature for V2 — add the database column `calibration_responses JSONB` to `survey_submissions` and the `calibration_bias NUMERIC(4,3)` column to `surveyor_assignments` to support it structurally, but do not build the calibration UI or scoring logic in V2.0.

---

## Phase 2: Campaign Management and Surveyor Dashboard

### Step 2.1: Campaign Creation UI

Create `frontend/src/components/CampaignCreateForm.tsx`. This is a modal form (using Radix UI Dialog, following the pattern of `SurveyImportModal.tsx`) with:

- State selector: a Radix UI Select dropdown populated from the existing `GET /v1/states` endpoint (which returns `StateInfo[]` from `api/routes.py`).
- Election type: Radix UI RadioGroup with options "Assembly (AE)" and "General (GE)".
- Election year: numeric input.
- Campaign name: text input.
- Question subset selector: checkboxes for each question in the questionnaire, defaulting to all checked. Uses the questionnaire JSON loaded from `GET /v1/factors/questionnaire`.
- Visibility toggle: "Private" or "Public" (Radix UI Switch).
- Submit button calls `POST /v1/surveys/campaigns`.

### Step 2.2: Surveyor Assignment Interface

Create `frontend/src/components/SurveyorAssignment.tsx`. This component:

- Shows a table of constituencies for the campaign's state (fetched from `GET /v1/data/{state}` or similar).
- Each row has a "Surveyors" column with a multi-select dropdown (Radix UI Popover with checkboxes) showing available users (fetched from a new `GET /v1/surveys/campaigns/{id}/users` endpoint that lists all users assigned to this campaign plus unassigned users).
- Bulk assignment: a button "Auto-Assign" that evenly distributes unassigned constituencies among available surveyors.
- Each assignment calls `POST /v1/surveys/campaigns/{id}/assign`.

### Step 2.3: Campaign Dashboard

Create `frontend/src/components/CampaignDashboard.tsx`. This is the main campaign management view for coordinators.

Data fetching: uses `setInterval` with 30-second polling (following the existing pattern in the codebase where data is fetched periodically rather than via WebSocket). Each poll calls `GET /v1/surveys/campaigns/{id}` which returns the campaign with aggregate stats.

Dashboard sections:
- **Completion overview**: a progress bar showing overall completion (submitted constituencies / total constituencies). Color-coded: red (<25%), yellow (25-75%), green (>75%).
- **Constituency breakdown**: a table with columns: constituency name, booths total, booths surveyed, submissions, avg quality score, status (complete/partial/empty/conflicted). Color-coded rows. Sortable by each column.
- **Surveyor leaderboard**: a ranked list of surveyors by submission count and average quality score. Shows each surveyor's last active time.
- **Conflict alerts**: a section listing constituencies flagged as conflicted (from Step 1.7). Each alert links to the conflict resolution UI.
- **Activity feed**: last 20 submissions shown as a scrolling list with surveyor name, constituency, time, and quality score.

Cache the dashboard response with a 30-second TTL in Redis using `set_cached(f"dashboard:{campaign_id}", data, ttl=30)` on the backend. This aligns the cache TTL with the polling interval, meaning each poll gets fresh data.

### Step 2.4: Surveyor Mobile Landing Page

Create `frontend/src/components/SurveyorHome.tsx`. This component shows:

- A list of campaigns the surveyor is assigned to (from `GET /v1/surveys/campaigns`).
- For each campaign, the surveyor's pending assignments (constituencies/booths not yet submitted).
- A "Start Survey" button for each assignment that navigates to the `SurveyQuestionnaireForm`.
- A submission history showing past submissions with their quality scores and statuses.
- An offline status indicator (see Phase 5).

Responsive layout: full-width cards on mobile, grid on desktop. Uses Tailwind responsive classes (`sm:`, `md:`, `lg:`).

### Step 2.5: In-App Notification System

Create a simple notification system using polling. Add a `notifications` table: `id SERIAL PRIMARY KEY`, `user_id INTEGER NOT NULL REFERENCES users(id)`, `type TEXT NOT NULL`, `message TEXT NOT NULL`, `data JSONB`, `read BOOLEAN NOT NULL DEFAULT false`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`. Add this table to the migration in Step 1.1 and to the lifespan auto-create.

Create `GET /v1/notifications` (returns unread notifications for the current user) and `PUT /v1/notifications/{id}/read` (marks a notification as read). The frontend polls this endpoint alongside existing data fetches.

Notification triggers (server-side, created in the relevant endpoint handlers):
- When a coordinator creates an assignment: notify the assigned surveyor.
- When a submission is flagged as conflicted: notify the campaign coordinator.
- When a campaign status changes: notify all participants.

### Step 2.6: Campaign Lifecycle Management

Add lifecycle transitions to the campaign API. `PUT /v1/surveys/campaigns/{id}/status` accepts a body with `status` (one of the valid transitions: draft→active, active→completed, completed→archived, any→draft for reverting). Validate transitions server-side.

For campaign deletion: `DELETE /v1/surveys/campaigns/{id}` sets `deleted_at = now()` (soft delete). A background job (cron or a lifespan task similar to `_usage_flush_loop` in `api/main.py`) runs daily, permanently deleting campaigns where `deleted_at < now() - interval '48 hours'`. Permanent deletion cascades to survey_submissions, survey_booths, surveyor_assignments (via ON DELETE CASCADE), and purges associated photos from storage.

### Step 2.7: Multi-Language Questionnaire Support

The `translations` field in `questionnaire.json` (Step 1.3) already supports this. On the frontend, add a language selector to `SurveyQuestionnaireForm.tsx` — a Radix UI Select dropdown at the top of the form. The selected language filters question text through the translations object, falling back to the English `text` field if no translation exists.

No backend changes needed — the questionnaire JSON is the single source of truth for both English and translated text.

---

## Phase 3: Booth-Level Disaggregation and New Factor Integration

### Step 3.1: Integrate New Factors into the Prediction Engine

In `frontend/src/engine/predictionEngine.ts`, modify the `applyMultiFactorModifiers` function (currently around line 185) to handle the eight new factors with composite grouping and log-space computation.

First, update the `FactorParams` interface to include the eight new factor fields (already done in Step 1.4). Then refactor the modifier computation:

Currently, the function iterates over each party and applies multiplicative modifiers directly: `modifier *= 1 + coeff * (factor / 100)`, then clamps `modifier` to `[0.5, 2.0]`. For V2, switch to log-space:

1. For each party, compute the log of each factor modifier: `logModifier += Math.log(Math.max(0.01, 1 + coeff * (factor / 100)))`.
2. For composite groups, average the component factors before computing the modifier: for the governance satisfaction composite, compute `avgGovSat = (welfareSchemeImpact + developmentSatisfaction) / 2`, then compute one log modifier from that average. Similarly for campaign strength.
3. After summing all log modifiers (twelve original individual + two composite + four independent = eighteen log terms, but the composites each replace two individual factors, so the net is sixteen effective modifiers), clamp the sum to `[Math.log(0.1), Math.log(10.0)]`.
4. Exponentiate: `modifier = Math.exp(clampedLogSum)`.

This replaces the current per-factor clamping `[0.5, 2.0]` with a single global clamping in log-space `[0.1, 10.0]`.

Ensure backward compatibility: when all eight new factors are 0, their log modifiers are `Math.log(1) = 0`, so they contribute nothing. Existing V1 bookmarks with only twelve factors load with new factors defaulting to 0 — no behavioral change.

Update `frontend/src/engine/factorConfig.ts`: add `"qualitative_survey"` to the `FactorCategory` union type and to the `FACTOR_CATEGORIES` display info object:

```
qualitative_survey: {
  label: 'Survey-Based Qualitative Factors',
  description: 'Field observations from surveyor reports',
},
```

### Step 3.2: Booth-Level Proportional Disaggregation

Create a new function `disaggregateToBooths` in `frontend/src/engine/predictionEngine.ts`:

This function takes a `PredictionResult` for a constituency and an array of booth survey profiles (from `GET /v1/surveys/campaigns/{id}/submissions?constituency_no=X`), and returns an array of booth-level vote distributions.

Algorithm:
1. Start with the constituency-level predicted vote shares (already computed by `generateBaseline`).
2. For each booth with survey data, compute a booth-relative strength index per party. If a booth's survey indicates Party A has higher support than the constituency average (from the aggregated factor profile), that booth gets a proportionally larger share of Party A's predicted votes.
3. For booths without survey data, assign equal shares (uniform distribution).
4. Normalize so that the sum of booth-level votes for each party equals the constituency total.

The function is called on drill-down only (when a user clicks a constituency row to expand it), not for the entire state at once. This keeps computation under 1ms per constituency.

Return type: `BoothPrediction[]` where `BoothPrediction = { booth_number: number, booth_name: string | null, parties: { party: string, estimatedVotes: number, estimatedShare: number }[], surveyBased: boolean }`.

### Step 3.3: Booth Results Drill-Down View

Add a collapsible section to the constituency detail view. When a user clicks a constituency row in the prediction results table (in `PredictionPanel.tsx` or the results component), show a sub-table with booth-level estimated distributions.

Use a Radix UI Collapsible (matching the existing pattern in PredictionPanel which uses Collapsible for factor categories). The sub-table has columns: booth number, booth name, predicted winner, margin, survey coverage indicator. Color-code by predicted outcome.

Show a disclaimer at the top: "Estimated distribution (survey-anchored) — not a booth-level prediction."

### Step 3.4: Error Margin Update

In `generateBaseline` in `predictionEngine.ts`, after computing `adjustedError`, apply the survey coverage bonus:

Add an optional `surveyCoverage` parameter to `generateBaseline` — a `Map<number, number>` mapping `constituency_no` to coverage percentage (0-1). If the coverage for the current constituency exceeds 0.5 (50% of booths surveyed), multiply `adjustedError` by 0.8 (20% reduction).

This parameter is populated from the `GET /v1/surveys/campaigns/{id}/aggregated` response which includes `coverage_pct` per constituency.

---

## Phase 4: Scenario Comparison and Report Generation

### Step 4.1: Scenario Save/Load

Add a `scenarios` table to the database: `id SERIAL PRIMARY KEY`, `user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `name TEXT NOT NULL`, `state_name TEXT NOT NULL`, `config JSONB NOT NULL`, `campaign_id INTEGER REFERENCES campaigns(id)`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`. Add to the lifespan auto-create block and create an Alembic migration.

The `config` JSONB stores the full `AppPredictionParams` object (all slider values, alliance config, new party config, prediction mode) plus a reference to any campaign survey data used.

Create endpoints in a new `api/scenario_routes.py`:
- `POST /v1/scenarios` — save a scenario (user_id from auth, name and config from body).
- `GET /v1/scenarios` — list user's scenarios, with optional `state_name` filter.
- `GET /v1/scenarios/{id}` — get a specific scenario.
- `DELETE /v1/scenarios/{id}` — delete (owner or admin only).

Register `scenario_router` in `api/main.py` with dual registration.

On the frontend, add a "Save Scenario" button in `PredictionPanel.tsx` that opens a Radix UI Dialog asking for a name, then calls `POST /v1/scenarios` with the current `AppPredictionParams`. Add a "Load Scenario" dropdown (Radix UI Select) that lists saved scenarios and populates the panel's state when selected.

### Step 4.2: Scenario Comparison View

Create `frontend/src/components/ScenarioComparison.tsx`. This component:

- Shows a multi-select to pick 2-3 saved scenarios.
- When scenarios are selected, runs each scenario's config through `generateBaseline` (and `aggregateResults`) to produce prediction results.
- Displays a side-by-side comparison table: party, seats (scenario 1), seats (scenario 2), seats (scenario 3), delta columns.
- Below the table, lists constituencies that change hands between scenarios (flipped in one but not another).
- Includes a simple bar chart comparing party seat counts across scenarios. Use a lightweight charting approach — either CSS-based bars (Tailwind width percentages in colored divs) or a minimal library. Given the existing stack has no charting library, CSS-based bars are simplest and avoid adding dependencies.

### Step 4.3: PDF Report Generator

Add `reportlab` to `api/requirements.txt`.

Create `api/report_routes.py` with `report_router = APIRouter(prefix="/reports", tags=["reports"])`. Register with dual registration in `api/main.py`.

`POST /v1/reports/generate` endpoint:
- Accepts: `state` (str), `config` (JSONB — the AppPredictionParams), `campaign_id` (optional int).
- Uses an `asyncio.Semaphore(2)` module-level variable to limit concurrent report generation. If the semaphore is full, return 429 with `Retry-After: 10`.
- Fetches prediction data from `GET /v1/predict/data?state={state}` (reusing the existing data endpoint from `api/routes.py`).
- Runs the prediction formula server-side. This requires porting the essential prediction logic from `predictionEngine.ts` to Python. Create a `api/prediction_engine.py` module with a simplified version of `generateBaseline` that takes the factor config, prediction params, and constituency data and returns predicted results. This server-side engine is used only for report generation — the primary prediction remains client-side.
- Generates the PDF using ReportLab:
  - Title page with state name, election year, generation timestamp.
  - Executive summary: key predictions (likely government formation, total seats per alliance).
  - Party-wise seat table with confidence intervals.
  - Constituency detail table: constituency name, predicted winner, margin, previous winner, swing, survey coverage.
  - Swing analysis section: table of largest swings.
  - Data provenance: which constituencies are survey-informed vs model-only.
  - Disclaimer footer on every page.
- Cache the generated PDF for 1 hour using `set_cached(f"report:{state}:{config_hash}", pdf_bytes, ttl=3600)` where `config_hash` is a SHA256 of the config JSON.
- Return the PDF as `StreamingResponse(content, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=prediction_report_{state}_{timestamp}.pdf"})`.

### Step 4.4: Report Request UI

Add a "Generate Report" button to the prediction results section in `PredictionPanel.tsx`. Clicking opens a Radix UI Dialog with:
- Checkboxes to include/exclude report sections.
- A "Generate" button that calls `POST /v1/reports/generate`.
- A loading spinner during generation.
- A download link when the PDF is ready.

---

## Phase 5: Offline-First Surveyor Experience

### Step 5.1: PWA Configuration

Install `vite-plugin-pwa` as a dev dependency: add it to `frontend/package.json` devDependencies.

Configure in `frontend/vite.config.js` (currently a minimal Vite config). Add the plugin:

Import `VitePWA` from `vite-plugin-pwa` and add to the plugins array. Configure:
- `registerType: 'autoUpdate'` — auto-updates the service worker when new content is available.
- `manifest`: name "Election Intelligence Platform", short_name "Elec", description, icons (need to create 192px and 512px PNG icons in `frontend/public/`), start_url "/", display "standalone", theme_color and background_color matching the app's Tailwind theme.
- `workbox.runtimeCaching`: cache API responses for `/v1/surveys/campaigns/*` and `/v1/factors/*` with a NetworkFirst strategy (try network, fall back to cache). Cache static assets with CacheFirst strategy.

Create icons at `frontend/public/icon-192.png` and `frontend/public/icon-512.png`.

### Step 5.2: IndexedDB Storage with Dexie.js

Install `dexie` as a dependency in `frontend/package.json`.

Create `frontend/src/db/surveyDb.ts`:

Define a Dexie database class with tables:
- `pendingSubmissions`: `++id, campaignId, constituencyNo, boothNumber, payload, status, createdAt, syncAttempts`. The `payload` field stores the full `SubmissionCreate` object. The `status` field is `"pending"` or `"failed"`.
- `cachedCampaigns`: `campaignId, data, cachedAt`. Stores campaign details for offline access.
- `cachedQuestionnaires`: `campaignId, data, cachedAt`. Stores questionnaire configs for offline rendering.

Export helper functions:
- `savePendingSubmission(submission)` — stores a submission in IndexedDB.
- `getPendingSubmissions()` — returns all pending submissions.
- `markSubmissionSynced(id)` — removes a synced submission.
- `markSubmissionFailed(id, reason)` — updates status to failed.
- `getPendingCount()` — returns count of pending submissions.

### Step 5.3: Background Sync

Create `frontend/src/services/syncService.ts`:

- `startSync()` — called on app initialization and on `online` event. Reads all pending submissions from IndexedDB, sends each to the API via `POST /v1/surveys/campaigns/{id}/submissions`. On success, removes from IndexedDB. On failure (network error), leaves in IndexedDB for next sync attempt. On rejection (400/403/422), moves to failed queue.
- Register event listeners: `window.addEventListener('online', startSync)`.
- For iOS Safari (no Background Sync API support): use `setInterval(startSync, 30000)` when the app is in foreground. Check `navigator.onLine` before attempting sync.
- Expose sync status via a React context or a simple event emitter that components can subscribe to.

Create `frontend/src/components/SyncStatusIndicator.tsx`:
- Shows "All synced" (green dot) when `getPendingCount() === 0`.
- Shows "Pending sync: N" (yellow dot) when there are pending submissions.
- Shows "Offline" (red dot) when `!navigator.onLine`.
- Display this indicator in the app header and in `SurveyorHome.tsx`.

### Step 5.4: Sync Conflict Resolution

The sync strategy is auto-accept: the backend accepts all submissions (even duplicates for the same booth). Multiple submissions for the same booth from different surveyors are all stored, and the aggregation layer (Step 1.7) handles disagreements.

If the backend rejects a synced submission (campaign completed, assignment revoked), the failed submission is stored in the "failed" queue in IndexedDB. Show a notification to the surveyor listing failed submissions with rejection reasons.

---

## Phase 6: ML Completion and Bayesian Survey Integration

### Step 6.1: Notebook Validation and ONNX Training

Execute `datascience/notebooks/08_factor_discovery.ipynb` end-to-end. Verify all cells produce output. Commit the executed notebook.

Execute `datascience/notebooks/06_predictive_model.ipynb`. This notebook should train an XGBoost classifier on TCPD assembly election data. The model predicts constituency-level outcomes (winning party) using features derived from the TCPD dataset (the same features that map to the twelve quantitative prediction factors).

Export the trained model:
- As ONNX to `api/models/election_predictor.onnx` using `skl2onnx` or XGBoost's built-in ONNX export.
- As joblib to `api/models/election_predictor.joblib` for SHAP computation (SHAP's TreeExplainer requires the native model, not ONNX).

Update `datascience/output/MODEL_CARD.md` with: model type, training data description, feature list, accuracy metrics (precision, recall, F1), training date, data date range, and feature importance rankings.

Create the `api/models/` directory if it doesn't exist.

### Step 6.2: Activate ML Prediction Endpoint

Update `api/prediction_routes.py`. The `POST /v1/predict/ml` endpoint skeleton already exists (around line 55 in the file). Currently it loads the ONNX model via `_get_model()` and has a circuit breaker. Update the endpoint body to:

1. Load constituency data for the requested state (same query as `GET /v1/predict/data` in `api/routes.py`).
2. For each constituency, construct a feature vector from the prediction data and the submitted factor values.
3. Run ONNX inference: `session.run(None, {"input": feature_array})`.
4. Parse outputs into `ConstituencyPrediction` objects.
5. Compute SHAP values: load the joblib model, create a `shap.TreeExplainer(model)`, compute `shap_values = explainer.shap_values(feature_array)`. Extract the top 5 contributing features per constituency. Add to the response as a `shap_attributions` field.
6. Update the circuit breaker: instead of counting failures, validate predictions against known historical outcomes for a recent election year. If predictions for a validation set diverge significantly (accuracy < 40%), trip the circuit breaker.

Add `shap` and `joblib` to `api/requirements.txt`.

### Step 6.3: Bayesian Survey Integration

Create `frontend/src/engine/bayesianUpdate.ts`:

This module implements the conjugate Normal-Normal Bayesian update for vote share predictions. It is the mechanism by which survey data acts as soft evidence that shifts predictions toward field observations, rather than hard-overriding slider defaults.

**Core function: `applyBayesianUpdate`**

The function accepts four parameters: `priorMean` (number, the predicted vote share percentage for a party from formula or ML), `priorVariance` (number, the uncertainty of the prediction), `surveyMean` (number, the survey-derived vote share estimate for that party), and `surveyVariance` (number, the uncertainty of the survey estimate). It returns an object `{ posteriorMean: number, posteriorVariance: number }`.

Implementation logic:

1. Apply division-by-zero guards: if `priorVariance` is less than `1e-10`, clamp it to `1e-10` (model is maximally confident — survey has minimal effect, posterior stays near prior). If `surveyVariance` is less than `1e-10`, clamp it to `1e-10` (survey is maximally confident — posterior snaps very close to survey mean).
2. Compute prior precision: `priorPrecision = 1 / priorVariance`.
3. Compute survey precision: `surveyPrecision = 1 / surveyVariance`.
4. Compute posterior precision: `posteriorPrecision = priorPrecision + surveyPrecision`.
5. Compute posterior mean: `posteriorMean = (priorPrecision * priorMean + surveyPrecision * surveyMean) / posteriorPrecision`.
6. Compute posterior variance: `posteriorVariance = 1 / posteriorPrecision`.
7. Clamp `posteriorMean` to `[0, 100]` to ensure valid vote share percentages.
8. Return `{ posteriorMean, posteriorVariance }`.

**Prior variance source:**

Add a `residualVariance` field to `api/factor_data/coefficients.json` under each state key and the `_national` key. This represents the historical squared residual of the model's predictions for that state, computed as the mean squared error of formula-predicted vote shares versus actual vote shares across all constituencies in the two most recent elections. Initial values: `_national: 25` (representing ±5% standard error), `Tamil_Nadu: 20` (the model performs slightly better in Tamil Nadu due to more stable party dynamics). These values are loaded by `getCoefficients` in `factorConfig.ts` and passed to the Bayesian update.

In `generateBaseline` in `predictionEngine.ts`, read `priorVariance` from `coefficients.residualVariance` (falling back to 25 if not present). This is the same per-state value for all parties and constituencies — a simplification appropriate for V2 since per-party residual variance would require a separate calibration dataset.

**Survey variance computation:**

The `surveyVariance` for a constituency is computed from the aggregated survey data returned by `GET /v1/surveys/campaigns/{id}/aggregated`. The aggregated response includes `submission_count` and `avg_quality_score` per constituency.

Formula: `surveyVariance = baseVariance / (submissionCount * avgQualityScore)`, where `baseVariance` is a calibration constant set to `100`. This means: one surveyor with perfect quality (1.0) produces `surveyVariance = 100`, which combined with a prior variance of 25 gives the posterior about 80% weight to the prior. Ten surveyors with average quality (0.7) produce `surveyVariance = 100 / (10 * 0.7) = 14.3`, giving the posterior roughly equal weight to prior and survey. This scaling ensures survey data has meaningful impact only when sufficient submissions have been collected.

The `baseVariance` constant is defined as a module-level constant in `bayesianUpdate.ts`: `const SURVEY_BASE_VARIANCE = 100`. It can be tuned after one election cycle by comparing survey-informed predictions against outcomes.

**Survey mean derivation:**

The `surveyMean` for each party in a constituency is derived from the aggregated survey factor profile. When survey data is available, the factors from the survey are applied to the constituency's historical vote shares using the same multiplicative modifier engine (Step 3.1), producing a survey-implied prediction. This survey-implied prediction is the `surveyMean` — it represents "what the model would predict if we used the surveyor's observations as factor values."

Concretely: take the constituency's latest actual vote shares, apply the survey-derived factor values through `applyMultiFactorModifiers`, normalize, and extract each party's resulting vote share. These are the `surveyMean` values per party.

**Multi-party renormalization:**

After applying `applyBayesianUpdate` independently to each party's vote share, the posteriors will not sum to exactly 100% (because each party is updated independently). Apply additive renormalization: compute `totalPosterior = sum of all party posteriorMean values`, then for each party: `normalizedPosterior = (posteriorMean / totalPosterior) * 100`. This preserves the relative ratios while ensuring the constraint holds. Update each party's posterior variance proportionally: `normalizedVariance = posteriorVariance * (100 / totalPosterior)^2` to maintain consistent confidence intervals after renormalization.

**Integration into `generateBaseline` in `predictionEngine.ts`:**

Add an optional parameter `surveyData` to `generateBaseline` with type `Map<number, { submissionCount: number, avgQualityScore: number, factorValues: Record<string, number> }> | null`, mapping `constituency_no` to survey aggregates. Default is `null`.

After the existing prediction computation (after multi-factor modifiers and normalization, before computing absolute votes), insert a Bayesian update block:

1. Check if `surveyData` is not null and has an entry for the current `constituency_no`.
2. If yes, compute the survey-implied prediction: clone the constituency's latest vote shares, apply the survey's factor values through `applyMultiFactorModifiers`, normalize. These are the `surveyMean` values.
3. Read `priorVariance` from `coefficients.residualVariance` (or default 25).
4. Compute `surveyVariance = SURVEY_BASE_VARIANCE / (surveyData.submissionCount * surveyData.avgQualityScore)`.
5. For each party, call `applyBayesianUpdate(predictedSharePct, priorVariance, surveyImpliedSharePct, surveyVariance)`.
6. Collect all posterior means, apply multi-party renormalization.
7. Replace the party vote shares with the renormalized posteriors.
8. Use the posterior variance to compute tighter error margins: `adjustedError = Math.sqrt(posteriorVariance)` replaces the slider-distance-based error when survey data is present.

**Consistent behavior across formula and ML modes:**

The Bayesian update function is mode-agnostic — it takes prior mean and variance and returns posterior mean and variance regardless of how the prior was produced. The key to consistency:

- In formula mode: the prior is the output of `generateBaseline` with factor modifiers. The survey data produces the survey mean via the same factor modifier pipeline. The Bayesian update combines them.
- In ML mode: the prior is the output of `POST /v1/predict/ml`. The survey mean is still produced client-side via the factor modifier pipeline (same as formula mode). The Bayesian update combines them. The ML endpoint returns predictions with a `confidence` field that maps to prior variance: `priorVariance = (100 - confidence) * (residualVariance / 100)` — higher confidence means tighter prior.

Both modes use the same `applyBayesianUpdate` function with the same survey variance computation. The only difference is the prior source. This ensures that switching between modes with the same survey data produces consistent directional shifts — the posterior always moves toward the survey observations, with magnitude determined by relative precision.

Create a wrapper function `applyBayesianSurveyIntegration(partyShares, priorVariance, surveyData)` that handles the full workflow (compute survey means, apply per-party updates, renormalize) and is called from both `generateBaseline` and the ML results processing path in `PredictionPanel.tsx`.

### Step 6.4: Enable Prediction Mode Toggle

In `frontend/src/components/PredictionPanel.tsx`, find the prediction mode toggle (a Radix UI RadioGroup or SegmentedControl that switches between "Formula" and "ML"). Remove the "coming soon" label from the ML option. When ML is selected:

1. Call `POST /v1/predict/ml` with the current state and factor values.
2. Display results in the same table as formula results.
3. Add a collapsible "SHAP Attributions" section per constituency showing the top 5 contributing factors with their SHAP values.

---

## Phase 7: Geographic Visualization and Advanced Analytics

### Step 7.1: District-Level Choropleth

The codebase already has `frontend/src/components/IndiaMap.jsx` for state-level visualization using react-simple-maps. Extend this pattern for district-level maps.

Create `frontend/src/components/DistrictMap.tsx`:
- Download district-level GeoJSON for Indian states from open data sources (datameet GitHub repository).
- Store GeoJSON files in `frontend/public/geo/` (e.g., `tamil_nadu_districts.json`).
- Use `react-simple-maps` (already a dependency) to render the district choropleth.
- Color districts by the dominant predicted party (majority of constituency predictions within that district).
- Hover tooltips show: district name, constituency count, dominant party, average confidence, survey coverage.
- Click a district to filter the prediction results table to that district's constituencies.

### Step 7.2: Constituency Heat Table

Create `frontend/src/components/ConstituencyHeatTable.tsx`:
- A sortable, filterable table using Tailwind CSS table styles.
- Columns: constituency name, predicted winner, margin (color-coded gradient: dark red → white → dark blue), previous winner, swing direction arrow, survey coverage badge, confidence level.
- The margin column uses a continuous color gradient via Tailwind's arbitrary values or inline style: `backgroundColor: marginToColor(marginPct)` where `marginToColor` maps negative margins to red, zero to white, positive to blue.
- Filterable by district, party, swing direction.
- Sortable by clicking column headers.

### Step 7.3: Swing Analysis Chart

Create `frontend/src/components/SwingAnalysis.tsx`:
- For each major party, compute the distribution of constituency-level swings (change in vote share from previous election to predicted).
- Display as a horizontal bar chart grouped by party. Each bar represents a constituency, width proportional to swing magnitude, color indicating direction (green for gain, red for loss).
- Alternative: use a box plot per party showing median, quartiles, and outliers. Implement using CSS/SVG (no charting library needed for simple box plots).
- Overlay the previous election's actual swing distribution for comparison.

### Step 7.4: Survey Coverage Map Overlay

Add a toggle to the `DistrictMap.tsx` that switches from "Party" coloring to "Survey Coverage" coloring. When toggled, districts are colored by the fraction of constituencies with survey data: gray (0%), yellow (1-50%), green (>50%). This helps coordinators identify data gaps.

---

## Phase 8: Testing, Performance, and Polish

### Steps 8.1-8.2: Survey and Engine Unit Tests

Create `frontend/src/engine/__tests__/predictionEngine.test.ts` (extend the existing test file) and `frontend/src/engine/__tests__/bayesianUpdate.test.ts`.

For the prediction engine:
- Test all eight new factors individually: verify each produces the expected directional effect.
- Test composite groups: verify that the averaged composite produces different results from applying factors individually (confirms double-counting prevention).
- Test log-space clamping: set all 20 factors to maximum simultaneously, verify the combined modifier stays within [0.1, 10.0].
- Property-based tests: generate 1000 random factor configurations, verify vote conservation (all party shares sum to 100% ± 0.1%).
- Backward compatibility: verify that zero-valued new factors produce identical results to V1 engine.

For Bayesian update:
- Test zero prior variance (posterior stays near prior).
- Test zero survey variance (posterior snaps to survey).
- Test renormalization (all party posteriors sum to 100%).

Create `api/tests/test_survey_routes.py`:
- Test campaign CRUD (create, list, get, delete).
- Test authorization (surveyor cannot access other campaigns).
- Test submission validation (invalid JSONB rejected with 422).
- Test quality scoring computation.
- Test rate limiting (11th submission in 1 minute returns 429).

### Step 8.3: Performance Testing

Create a k6 test script at `api/tests/performance/survey_load.js`:
- Simulate 50 concurrent surveyors each submitting 1 survey per minute for 20 minutes.
- Target: p95 submission latency < 500ms.
- Target: dashboard endpoint < 2s for 1000 booths.
- Seed the test database with 1 campaign, 1000 booths, 10000 existing submissions.

### Step 8.4: Offline Testing with Playwright

Add to `frontend/playwright.config.ts`. Create `frontend/tests/e2e/offline-survey.spec.ts`:
- Navigate to the surveyor form.
- Call `page.context().setOffline(true)`.
- Fill and submit the questionnaire.
- Verify data is in IndexedDB via `page.evaluate(() => db.pendingSubmissions.count())`.
- Call `page.context().setOffline(false)`.
- Wait for sync (poll for pending count to reach 0).
- Verify the submission appears in the dashboard.

### Step 8.5: Security Tests

Create `api/tests/test_security.py`:
- RBAC: create two campaigns, assign a surveyor to campaign A, attempt to read campaign B's submissions → expect 403.
- File upload: upload a file with .jpg extension but ELF magic bytes → expect 422.
- Upload a 10MB file → expect 413.
- JSONB validation: submit with unrecognized question ID → expect 422.
- Rate limiting: submit 12 times in 60 seconds → 11th and 12th return 429.
- GPS privacy: create a submission with GPS, advance time 31 days, run cleanup, verify GPS is null.

### Step 8.6: Bayesian Edge Case Tests

Create `frontend/src/engine/__tests__/bayesianUpdate.test.ts`:
- Prior variance approaching zero: posterior should stay very close to prior mean.
- Survey variance approaching zero: posterior should snap to survey mean.
- Large contradiction (prior=30%, survey=70%): posterior should be between 30% and 70%, weighted by relative precision.
- Multi-party renormalization: after updating 4 parties independently, verify sum is 100%.

### Step 8.7-8.8: Accessibility and Mobile Testing

Run a Lighthouse accessibility audit on all new pages. Ensure:
- All sliders are keyboard-operable (Tab, Arrow keys) — already handled by Radix UI primitives.
- Questionnaire navigable via keyboard.
- All interactive elements have ARIA labels.
- Dynamic updates use `aria-live="polite"` regions.

Test on physical devices: iOS Safari and Android Chrome for the surveyor workflow. Verify touch targets are ≥44px, forms are usable with on-screen keyboard, and offline sync works on both platforms.

### Step 8.9: Backward Compatibility

Create `frontend/src/engine/__tests__/backwardCompat.test.ts`:
- Load a V1 bookmark (AppPredictionParams with only 12 factors + allianceConfig + predictionMode).
- Verify all 8 new factors default to 0.
- Run `generateBaseline` with the loaded params.
- Verify results are identical to V1 engine output.
- Verify all V1 API endpoints return unchanged responses.

### Step 8.10: Database Backup

Configure a GitHub Actions workflow at `.github/workflows/backup.yml`:
- Schedule: `cron: '0 2 * * *'` (daily at 2 AM UTC).
- Uses `pg_dump` with the Railway DATABASE_URL.
- Compresses with gzip.
- Uploads to Cloudflare R2 using the `aws` CLI with R2-compatible endpoint.
- Retains 7 days of backups (delete backups older than 7 days).
- Document the restore procedure in a `BACKUP.md` file at the repository root.

---

## Pull Request Strategy

The implementation should be delivered in eight PRs matching the eight phases:

- **PR 1A**: Database schema + survey API endpoints + authorization dependency. Independently deployable.
- **PR 1B**: Frontend questionnaire component + prediction engine survey integration. Depends on PR 1A.
- **PR 2**: Campaign management UI + dashboard + surveyor landing page. Depends on PR 1A+1B.
- **PR 3**: New factors in engine + booth disaggregation + error margin updates. Can partially parallel PR 2.
- **PR 4**: Scenario comparison + PDF reports. Depends on PR 1A. Can parallel PR 2-3.
- **PR 5**: PWA + offline + sync. Depends on PRs 1-2.
- **PR 6**: ONNX training + ML endpoint + Bayesian integration. Depends on PR 1A.
- **PR 7**: Geographic visualization. Depends on PRs 1-3.
- **PR 8**: Testing + performance + polish + backup. Cross-cutting, follows all others.

**V2.0 ships after PR 4.** PRs 5-8 ship as V2.1-V2.3 iterations.

---

## New Dependencies Summary

### Backend (`api/requirements.txt`)
- `reportlab` — PDF generation (Phase 4)
- `Pillow` — image compression for uploads (Phase 1)
- `boto3` — Cloudflare R2 storage (Phase 1)
- `shap` — SHAP attributions for ML (Phase 6)
- `joblib` — model serialization for SHAP (Phase 6)

### Frontend (`frontend/package.json`)
- `dexie` — IndexedDB wrapper (Phase 5)
- `vite-plugin-pwa` (devDependency) — service worker + manifest (Phase 5)

### Infrastructure
- Cloudflare R2 bucket for photo storage and backups
- PWA icons (192px, 512px PNGs) in `frontend/public/`
- District GeoJSON files in `frontend/public/geo/`

---

## New Files Summary

### Backend
- `api/survey_routes.py` — survey campaign and submission endpoints
- `api/upload_routes.py` — file upload endpoint
- `api/scenario_routes.py` — scenario save/load endpoints
- `api/report_routes.py` — PDF report generation
- `api/prediction_engine.py` — server-side prediction engine (for reports)
- `api/factor_data/questionnaire.json` — questionnaire template
- `api/models/election_predictor.onnx` — trained ONNX model (Phase 6)
- `api/models/election_predictor.joblib` — native XGBoost model (Phase 6)
- `api/alembic/versions/0007_survey_tables.py` — migration
- `api/tests/test_survey_routes.py` — survey API tests
- `api/tests/test_security.py` — security tests
- `api/tests/performance/survey_load.js` — k6 performance tests

### Frontend
- `frontend/src/components/SurveyQuestionnaireForm.tsx`
- `frontend/src/components/CampaignCreateForm.tsx`
- `frontend/src/components/CampaignDashboard.tsx`
- `frontend/src/components/SurveyorAssignment.tsx`
- `frontend/src/components/SurveyorHome.tsx`
- `frontend/src/components/ScenarioComparison.tsx`
- `frontend/src/components/DistrictMap.tsx`
- `frontend/src/components/ConstituencyHeatTable.tsx`
- `frontend/src/components/SwingAnalysis.tsx`
- `frontend/src/components/SyncStatusIndicator.tsx`
- `frontend/src/engine/bayesianUpdate.ts`
- `frontend/src/db/surveyDb.ts`
- `frontend/src/services/syncService.ts`
- `frontend/src/engine/__tests__/bayesianUpdate.test.ts`
- `frontend/src/engine/__tests__/backwardCompat.test.ts`
- `frontend/tests/e2e/offline-survey.spec.ts`

### Infrastructure
- `.github/workflows/backup.yml`
- `BACKUP.md`

### Modified Files
- `api/main.py` — lifespan table creation, router registration
- `api/auth.py` — `require_campaign_access` dependency
- `api/requirements.txt` — new dependencies
- `api/factor_data/factor_catalog.json` — 8 new factor entries
- `api/factor_data/coefficients.json` — 8 new coefficients
- `api/prediction_routes.py` — ML endpoint activation
- `frontend/package.json` — new dependencies
- `frontend/vite.config.js` — PWA plugin
- `frontend/src/types.ts` — 8 new AppPredictionParams fields
- `frontend/src/engine/predictionEngine.ts` — new factors, log-space, booth disaggregation, survey coverage
- `frontend/src/engine/factorConfig.ts` — new category, compositeGroup field
- `frontend/src/components/PredictionPanel.tsx` — campaign selector, survey badges, report button, scenario buttons
- `datascience/output/MODEL_CARD.md` — training metadata
