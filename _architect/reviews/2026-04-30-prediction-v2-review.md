# Critic Review: Prediction Platform V2 — Surveyor-Centric Intelligence System

**Date:** 2026-04-30
**Iteration:** 1
**Reviewer:** Critic Subagent
**Document Under Review:** `_architect/analysis/2026-04-30-prediction-v2.md`
**Supporting Research:** `_architect/research/2026-04-30-prediction-v2-research.md`

---

## Strengths

The plan demonstrates exceptional depth and honesty for a solo-developer project of this ambition. Several aspects deserve commendation before diving into criticism.

First, the three-approach analysis is genuinely rigorous. Approach B (Full Booth-Level Bayesian Engine) is not straw-manned — the plan clearly acknowledges its theoretical superiority and explains why it is infeasible specifically because of the absence of booth-level historical data in TCPD, not because Bayesian methods are bad. This is the kind of honest comparative analysis that builds trust in the recommendation.

Second, the plan's treatment of booth-level "predictions" as proportional allocations rather than true predictions is intellectually honest. The explicit labeling recommendation ("Estimated booth distribution based on survey indicators") prevents users from over-trusting outputs that have wide error margins. Few plans would voluntarily downgrade their own feature's marketing language.

Third, the phased implementation with independent shippability per phase is well-structured. The critical path (Phase 1 → Phase 3 → Phase 2 → Phase 4 → ship V2.0) makes sense for delivering incremental value, and the identification of Phase 1 as highest effort/highest risk is accurate.

Fourth, the research document is thorough and data-driven — particularly the database growth projections (200–400MB/year), the booth count estimation from TCPD data, the browser compatibility matrix for offline features, and the honest assessment that Railway's free PostgreSQL tier (500MB) is tight for V2 data volumes.

Fifth, the plan correctly identifies and documents all six V1 implementation gaps (ONNX model not deployed, SHAP not integrated, circuit breaker using failure count not accuracy, model_metadata table unused, quantile regression not implemented, no dedicated ML rate limiting). Building V2 on an honest accounting of V1's actual state is much better than assuming V1 is complete.

---

## Security

### Critical Issues

The plan introduces file upload capability (photo evidence for survey submissions) but the security treatment is thin. The research document mentions validating MIME types, rejecting executable headers, UUID-based naming, and preventing directory traversal — all correct — but the plan itself (Section 7, Phases 1-8) never specifies these security controls in any implementation step. Photo uploads are mentioned in passing (Step 5.2 mentions "evidence_urls" in the research schema) but no dedicated step covers file upload validation, storage security, or access control for uploaded files. This is a gap: a developer following only the plan would implement file uploads without the security controls described only in the research.

The campaign-level authorization model deserves scrutiny. The plan specifies that "coordinators can create campaigns and view all data, surveyors can only submit to their assigned campaigns and view their own submissions." However, the `require_campaign_access` dependency described in the research is never formalized in the plan's implementation steps. Step 1.5 says "All endpoints require authentication with role-based access control" but does not specify a concrete implementation pattern for row-level campaign authorization. The existing codebase has `require_user` and `require_tier` but no pattern for resource-level authorization checks — this is a new pattern that needs explicit design.

The plan proposes storing GPS coordinates of surveyors with survey submissions. The research correctly notes that GPS should be stored with limited precision (5 decimal places ≈ 1.1m), but the plan's database schema (Step 1.1) specifies `gps_latitude, gps_longitude` without precision constraints. GPS data combined with user IDs creates a surveillance vector — if the database is compromised, an attacker would have timestamped location history for all surveyors. The plan should specify data minimization: store GPS only if the surveyor opts in, and delete GPS data after quality validation is complete (e.g., 30 days post-submission).

The JSONB fields (`raw_responses`, `computed_factors`, `observations`) in the survey submission tables accept arbitrary JSON from the client. The plan does not specify server-side JSON schema validation beyond "validate all responses against the questionnaire schema (range checks, required fields)" in Step 1.6. Without strict schema validation, malformed JSONB payloads could cause downstream errors or, in edge cases, allow data injection into aggregation queries that read these fields.

### Minor Issues

The plan extends the `role` CHECK constraint to include `surveyor` and `coordinator`. The existing role is a single-value column — a user can be either a coordinator or a surveyor, but not both. If a coordinator also needs to submit survey data (e.g., for testing or as a surveyor-coordinator hybrid), they cannot do so under the current single-role model. The research acknowledges this but the plan does not address it. Suggestion: either use the research's suggestion of campaign-scoped assignment (where any authenticated user can be assigned to a campaign as a surveyor, regardless of their global role) or use a permissions array instead of a single role.

The plan specifies rate limiting for survey submissions (100 per day per surveyor, mentioned in research but not in the plan itself). This should be an explicit step in Phase 1.

**Security Score: 2/5**

---

## Performance

The research provides solid performance analysis with concrete targets (p95 <500ms for submissions, <2s for dashboard, <3s for booth predictions, <10s for PDF reports) and validates each against the existing stack's capabilities. The analysis is convincing that the write load (50 writes/minute peak) is trivial for PostgreSQL + asyncpg.

### Issues

The dashboard polling strategy (30-second intervals) is well-justified but the plan does not specify cache invalidation for the dashboard endpoint. The research mentions "cache dashboard responses per campaign with 30-second TTL, invalidate on new submission" — but if cache invalidation is implemented (invalidate on every submission), the 30-second TTL is redundant. If invalidation is not implemented, coordinators see stale data. The plan should specify one strategy clearly: either TTL-only (simpler, acceptable for 30-second polling) or invalidation-based (more complex, needed only for real-time use cases).

The plan proposes eight new qualitative factors, bringing the total to twenty. The prediction engine uses multiplicative modifiers clamped to [0.5, 2.0]. With twenty independent multiplicative factors, the theoretical range of combined modifiers is $0.5^{20}$ to $2.0^{20}$ — effectively zero to over a million — before renormalization. While renormalization ensures vote shares sum to one, the intermediate calculations could produce floating-point overflow or underflow with extreme slider combinations. The plan does not address numerical stability with twenty multiplicative factors. The existing twelve-factor engine works because users rarely set all twelve to extremes simultaneously, but with twenty factors (some survey-derived, potentially all non-zero), the risk of numerical instability increases. Suggestion: add an intermediate clamping step after every five factors, or switch to additive log-space computation.

The PDF report generation target of "under ten seconds for a full state" is achievable per the research (2–5 seconds with ReportLab). However, the plan does not address concurrent report generation. If two coordinators simultaneously request reports for different states, do they share a thread pool? The existing FastAPI server uses asyncio with a thread pool for synchronous operations — ReportLab is synchronous. Without a semaphore or queue, two concurrent report requests could double memory usage. The research mentions this ("sequential processing — no concurrent report generation — use a queue or semaphore") but it does not appear in the plan's implementation steps.

The booth-level disaggregation for large states (Uttar Pradesh: 403 constituencies × ~350 booths = ~141,000 booths) is described as happening client-side in formula mode. Computing proportional allocation for 141,000 booths with twenty factors is ~2.8 million arithmetic operations — feasible in JavaScript but the plan should specify whether this computation happens per-constituency (on drill-down) or for the entire state at once. Per-constituency is <1ms; entire state could be 50–100ms on mobile, which is acceptable but should be documented.

**Performance Score: 3/5**

---

## Approach Validity

The hybrid survey-augmented approach (Approach C) is fundamentally sound. It correctly identifies the core insight: the value of V2 is not in mathematical sophistication but in providing a structured bridge between field observations and mathematical parameters. The questionnaire-to-factor translation is the key innovation, and wrapping it around the existing prediction engine preserves V1 investment while adding genuine new capability.

### Issues

The plan's treatment of the eight new qualitative factors is its weakest analytical element. Step 1.4 lists eight new factors (localIssueSalience, candidatePersonalAppeal, communityConsolidation, welfareSchemeImpact, developmentSatisfaction, mediaInfluence, moneyDistributionPerception, partyWorkerActivity) with brief descriptions of how each maps to an existing modifier type. However, the plan does not address a fundamental question: what is the expected predictive value of these factors, and how will the system avoid double-counting?

For example, `welfareSchemeImpact` maps to a "pro-incumbency modifier" and `developmentSatisfaction` also maps to a "pro-incumbency modifier." If a surveyor reports high welfare satisfaction and high development satisfaction, the incumbent gets a double boost from what may be a single underlying sentiment ("the government is doing well"). The plan does not discuss factor orthogonality or correlation management. Suggestion: either implement correlation-aware aggregation (reduce the weight of correlated factors) or combine related factors into composite indices before feeding them into the engine.

Additionally, the "calibrated translation function" for converting five-point survey responses to slider values is described as "derived from regression analysis of historical data where possible and expert judgment where not." Since these are new qualitative factors not present in TCPD data, there is no historical data to derive calibration from — all eight will use expert judgment. This is not necessarily wrong (expert judgment is a valid starting point), but the plan should be honest that "calibrated" overstates the initial precision. These are heuristic mappings that will need iterative refinement based on backtesting against known election outcomes.

The proportional booth-level disaggregation is acknowledged as "not a true booth-level prediction" — but the plan's Step 3.2 still describes a mechanism where "booths where surveyors reported stronger party support receive proportionally more of that party's predicted vote share." This creates a circular dependency: booth-level survey data shapes booth-level "predictions," which are then presented back to users as insights. A surveyor reporting "Party A is strong at booth 47" does not constitute a prediction — it is just the surveyor's observation reflected back. The plan should more clearly distinguish between survey reporting (what surveyors observed) and prediction (what the model infers). Otherwise the system risks creating a false sense of analytical rigor around what is essentially a survey dashboard.

**Approach Validity Score: 3/5**

---

## Pros and Cons Balance

The comparative assessment of the three approaches is one of the plan's strongest sections. Each approach receives genuine analysis rather than superficial dismissal.

### Issues

Approach A is dismissed somewhat hastily as "too thin — it adds a UI layer but no new analytical capability." This understates Approach A's value. Approach A plus the eight new qualitative factors (which are independent of booth-level disaggregation) would deliver most of the user's stated goals: surveyors filling in stats that the system translates into predictions, with campaign management and multi-surveyor aggregation. The booth-level disaggregation (which is the main feature that differentiates C from A) is acknowledged as proportional allocation, not true prediction. So the practical difference between A-enhanced and C is primarily the booth-level allocation view — which the plan itself describes as operationally useful but analytically shallow. A fairer comparison would acknowledge that Approach A with new factors covers 80% of the value at 60% of the effort.

The plan does not quantify the implementation effort difference between approaches. It says Approach B "would exceed six months for the engine alone" and Approach C is "four to six months" total, but provides no estimate for Approach A. Since Approach A preserves the prediction engine entirely and only adds survey backend + questionnaire frontend, a reasonable estimate might be two to three months — significantly less than C. This omission makes the comparison harder for stakeholders to evaluate.

Approach B's dismissal could be strengthened. The plan correctly notes that synthetic disaggregation produces "meaningless booth-level priors with ±15–25% error," but the same criticism partially applies to Approach C's proportional allocation — the booth-level output in C is also informed primarily by surveyor reports, not historical booth data. The key difference is computational cost and implementation complexity, not analytical superiority at booth level.

**Pros and Cons Balance Score: 3/5**

---

## Industry Standards and Best Practices

### Survey Tool Standards

The survey questionnaire design follows reasonable UX patterns (five-point scales, mobile-optimized, single-column layout, swipeable navigation). However, the plan does not reference established survey methodology standards. In psephological survey design, question ordering effects are well-documented — asking about anti-incumbency before asking about development satisfaction can prime negative responses. The plan does not address question ordering, randomization, or other survey methodology controls. For a platform that claims to translate "human observations into mathematical factor adjustments," the quality of those observations depends critically on survey design quality.

The plan also does not discuss surveyor training or calibration. In professional polling, surveyors undergo training to ensure consistent interpretation of scales (one surveyor's "Strong" anti-incumbency may be another's "Moderate"). Without inter-rater reliability calibration, the quality-weighted aggregation may be averaging systematically biased inputs. Suggestion: add an optional calibration exercise where surveyors rate a set of standardized scenarios, and their responses are compared to establish personal bias coefficients.

### ML Ops Patterns

Phase 6 describes training an ONNX model and deploying it, but the plan lacks standard ML ops practices: no model versioning strategy beyond the model_metadata table, no A/B testing between formula and ML predictions, no model monitoring for drift detection (the circuit breaker catches failures but not gradual accuracy degradation), and no automated retraining pipeline. The research mentions that the data science notebook has not been executed — the plan should include a step to validate that the notebook runs end-to-end before proceeding with model deployment.

The Bayesian survey integration (Step 6.3) uses a normal conjugate update, which is mathematically standard. However, the plan specifies this only for the ML endpoint, not for the formula engine. This creates an inconsistency: in formula mode, survey data overrides slider defaults (hard override); in ML mode, survey data updates priors (soft Bayesian update). Users switching between modes would see different behaviors from the same survey data. Suggestion: apply the Bayesian update consistently, or clearly document why the two modes treat survey data differently.

### PWA Standards

The offline-first approach (Phase 5) follows reasonable PWA patterns. The plan correctly identifies iOS Safari's Background Sync limitation and proposes an application-level fallback. The service worker caching strategy (precache app shell, NetworkFirst for API calls, CacheFirst for static data) follows Workbox best practices.

However, the plan does not specify a web app manifest (manifest.json) with proper PWA metadata (name, short_name, icons, start_url, display: standalone, theme_color, background_color). Without a manifest, the application cannot be "installed" on mobile devices via Add to Home Screen. For a surveyor-centric mobile tool, installability is important — it provides a dedicated icon, full-screen experience, and avoids the browser chrome that wastes screen space on small devices.

**Industry Standards Score: 3/5**

---

## Completeness

### Missing Features

The plan does not address data export for survey campaigns. A coordinator should be able to export raw survey submissions as CSV/Excel for offline analysis, import into statistical software (SPSS, R, Stata), or sharing with stakeholders who do not use the platform. The PDF report covers predictions but not raw survey data.

The plan mentions "conflict resolution for submissions that arrive out of order or contradict each other" (Phase 5, Step 5.4) but the conflict resolution strategy is underspecified. What happens when a surveyor submits offline data for booth X, but by the time it syncs, another surveyor has already submitted for booth X and the campaign does not allow duplicates? The plan says "show the conflict to the surveyor and let them choose to resubmit with updated data or discard" — but this assumes the surveyor is still online and paying attention. If the sync happens via a service worker background task, there may be no UI context to show the conflict. Suggestion: auto-accept all submissions (allow duplicates by default), use the aggregation/conflict detection layer to handle disagreements, and notify the coordinator rather than the surveyor.

### Missing Edge Cases

The plan does not address multi-language support. Indian elections span states with different languages (Tamil in Tamil Nadu, Hindi in UP, Bengali in West Bengal). Surveyors filling in questionnaires in the field would benefit from localized question text. The questionnaire JSON configuration could include a `translations` field, but this is not mentioned.

The plan does not address what happens when a campaign is deleted or archived. Are survey submissions preserved? Are predictions based on deleted campaign data still valid? What is the data lifecycle?

The plan does not discuss backup and data recovery for survey data. For a platform processing field intelligence during election season, data loss would be catastrophic. The plan should specify database backup frequency and recovery procedures.

### Data Gaps

The plan acknowledges that constituency-level GeoJSON boundaries are not freely available and proposes a district-level aggregation fallback. This is pragmatic but the plan does not address how districts map to constituencies. A single district may contain constituencies from different parties, and averaging predictions across constituencies within a district loses the very granularity the visualization is meant to provide. The plan should either commit to sourcing constituency boundaries for the states most likely to be used first (Tamil Nadu, at minimum) or acknowledge that the district-level choropleth is a placeholder with limited analytical value.

**Completeness Score: 3/5**

---

## Feasibility

### Single Developer Timeline

The plan estimates four to six months for a single developer across eight phases. This is aggressive. Let me walk through the phases:

- Phase 1 (Survey backend + questionnaire): Four new database tables, seven new API endpoints, validation/quality scoring pipeline, conflict detection, frontend questionnaire component, prediction engine wiring. Realistic estimate: 4–6 weeks.
- Phase 2 (Campaign management): Campaign CRUD UI, surveyor assignment, dashboard with polling, mobile landing page, notification system. Realistic estimate: 2–3 weeks.
- Phase 3 (Booth disaggregation + new factors): Eight new factors in predictionEngine.ts, disaggregation algorithm, booth results view, error margin update. Realistic estimate: 2–3 weeks.
- Phase 4 (Scenario comparison + reports): Scenario save/load, comparison view, PDF generation with ReportLab, report request UI. Realistic estimate: 2–3 weeks.
- Phase 5 (Offline-first): Service worker setup, IndexedDB, background sync, iOS fallback, conflict handling. Realistic estimate: 2–3 weeks (high uncertainty — offline debugging is notoriously time-consuming).
- Phase 6 (ML completion): Train and export ONNX, activate ML endpoint, Bayesian integration, prediction mode toggle. Realistic estimate: 2–3 weeks (depends on data science notebook execution issues).
- Phase 7 (Visualization): District choropleth, constituency heat table, swing analysis, coverage map. Realistic estimate: 2–3 weeks.
- Phase 8 (Testing and polish): Comprehensive tests, performance benchmarks, accessibility, mobile testing, backward compatibility. Realistic estimate: 2–3 weeks.

Total: 18–27 weeks (4.5–6.75 months). The plan's "four to six months" estimate is plausible but only if the developer works on this full-time and encounters no significant blockers. The plan's critical path (ship V2.0 after Phase 4, ~10–15 weeks) is more realistic as a first delivery milestone.

### Infrastructure Costs

The plan correctly identifies Railway's 500MB PostgreSQL limit as a constraint. With 200–400MB/year of survey data, the free tier would be exceeded within one to two election cycles. The plan mentions paid tier ($5/month for 5GB) but does not include this in a cost analysis. Photo storage on Cloudflare R2 (10GB free, then $0.015/GB/month) could reach $0.75–$1.50/month with 50–100GB of photos across multiple campaigns. Total infrastructure cost: $5–10/month, which is reasonable for a personal project but should be explicitly budgeted.

### Skill Requirements

The plan requires the developer to implement: FastAPI API design, PostgreSQL schema design with JSONB, Alembic migrations, PDF generation with ReportLab, service worker configuration, IndexedDB via Dexie.js, GeoJSON visualization with react-simple-maps, ONNX model training and deployment, Bayesian statistics, and survey methodology. This is an unusually broad skill set. The plan does not flag any skills that might require learning time. Suggestion: identify which of these technologies are new to the developer and add time for learning curves.

**Feasibility Score: 3/5**

---

## Risk Assessment

The plan identifies four key risks in the summary: questionnaire-to-factor calibration, booth-level allocation vs. true prediction, database growth exceeding Railway free tier, and iOS Safari Background Sync limitation. These are real risks with reasonable mitigations.

### Missing Risks

The plan does not identify the risk of survey data tampering or coordinated submission fraud. If a political party deploys its own operatives as "surveyors" who systematically inflate their party's reported support, the prediction model will produce biased results. The quality scoring mechanism (completeness, consistency, timeliness, GPS proximity) catches careless fraud but not coordinated sophisticated fraud where multiple operatives submit plausible-looking but biased data. Mitigation: cross-reference survey data against independent polls or media reports as a sanity check, and implement an anomaly detection layer (the research describes this but the plan does not include it as an implementation step).

The plan does not assess the risk of scope creep. With eight phases spanning the entire stack (database, backend, frontend, data science, infrastructure), there is high risk that mid-implementation discoveries lead to unplanned work. The plan should define explicit scope boundaries for V2 (what is out of scope) to prevent feature creep.

The plan does not address the risk that the questionnaire-to-factor translation may produce worse predictions than the existing slider-based approach. If surveyor reports are systematically biased (as is common in political surveys where respondents tell surveyors what they think they want to hear — "shy voter" effect), survey-derived predictions could be less accurate than model-only predictions. The plan should include a validation mechanism: compare survey-informed predictions against known historical outcomes for at least one past election to verify that survey data improves rather than degrades prediction accuracy.

The plan does not discuss the operational risk of deploying a surveyor network. Who recruits the surveyors? Who trains them? Who pays them? The platform assumes surveyors exist but does not address how they will be acquired and managed. This is not a software risk per se, but it affects whether V2's features will ever be used.

**Risk Assessment Score: 2/5**

---

## Codebase Alignment

The plan demonstrates strong awareness of existing codebase patterns. It correctly identifies the dual route registration pattern, cache abstraction (`get_cached`/`set_cached`), auth dependency injection (`require_user`, `require_tier`), Pydantic validation with Field constraints, ORJSONResponse, parameterized asyncpg queries, Radix UI components, Tailwind CSS, and the Alembic migration numbering convention (next migration would be `0007_survey_tables`).

### Issues

The plan proposes adding a `survey_team_id nullable foreign key` to the users table (Step 1.2). This would be the first time the users table is altered post-creation (all previous changes have been new tables, not ALTER existing ones). The existing migration pattern uses `CREATE TABLE IF NOT EXISTS` — altering an existing table with a new column and modified CHECK constraint is a different pattern that requires careful migration scripting (especially since the CHECK constraint change from `('user', 'admin')` to include `'surveyor', 'coordinator'` must be done atomically to avoid constraint violations). The plan should explicitly address the migration strategy for altering the users table.

The plan proposes storing the questionnaire configuration in `api/factor_data/questionnaire.json`, following the pattern of `factor_catalog.json` and `coefficients.json`. This is consistent with the existing approach of serving configuration from static files. However, the plan also specifies that the `survey_campaigns` table has a `questionnaire_config` JSONB column — implying that questionnaires can be customized per campaign. If the questionnaire is both a static file and a per-campaign database column, the system has two sources of truth. The plan should clarify: is the static file the default template and the database column an optional per-campaign override? This needs explicit specification.

The plan's frontend components (SurveyQuestionnaireForm, campaign dashboard, scenario comparison) follow the existing component pattern, but the plan does not specify where in the routing structure these new pages will live. The existing frontend appears to be a single-page application — adding surveyor-specific pages (campaign list, booth assignment, questionnaire form) suggests a need for route guards based on user role. The existing routing infrastructure is not described in the plan.

**Codebase Alignment Score: 4/5**

---

## Test Coverage

The test plan (Section 9) covers unit tests, integration tests, end-to-end tests, performance tests, and negative tests. The coverage is reasonably comprehensive.

### Issues

The test plan does not include security-specific test cases. There are no tests for: RBAC enforcement (a surveyor assigned to Campaign A cannot access Campaign B's data), file upload validation (rejected MIME types, oversized files, executable content), GPS data precision constraints, JSONB schema validation (malformed payloads rejected), or rate limiting for survey endpoints. These are security-critical paths that need explicit test coverage.

The test plan's performance tests specify thresholds (p95 <500ms for submissions, <2s for dashboard, <10s for reports) but do not specify the testing methodology. How will fifty concurrent surveyors be simulated? What tool — Locust, k6, Artillery? What database will be used — production-sized or test fixtures? Performance test results are highly sensitive to test environment configuration, and the plan should specify the setup.

The test plan does not include regression tests for the twenty-factor prediction engine. Adding eight new factors to `predictionEngine.ts` changes the `FactorParams` interface — every existing test that constructs a `FactorParams` object will need to be updated. The plan mentions "property-based tests with randomized inputs across all twenty factors" but does not address the mechanical work of updating existing test fixtures.

The offline sync test (Section 9, End-to-End Tests) says "disconnect network, submit a questionnaire, verify it is stored locally, reconnect, verify sync, verify dashboard update." This is hard to automate reliably. The plan should specify the testing approach — is this a manual test, a Playwright test with network interception, or a Vitest unit test mocking navigator.onLine? Playwright has `page.context().setOffline(true)` which could work, but the plan does not specify this.

The test plan does not include tests for the Bayesian survey integration math. The conjugate update formula is straightforward but the edge cases are important: what happens when prior variance is zero (model is certain — survey data should have no effect)? What happens when survey variance is zero (survey is certain — should override model entirely)? What happens when survey data contradicts the model by a large margin (posterior should move but not snap)?

**Test Coverage Score: 3/5**

---

## Logical Soundness

The plan's internal logic is generally consistent, with a clear dependency chain from Phase 1 through Phase 8. The critical path identification is correct: survey backend is the foundation, and all subsequent phases build on it.

### Issues

There is a logical inconsistency in how survey data flows through the system. In formula mode (Steps 1.9, 3.1), survey data replaces slider defaults — this is a hard override. In ML mode (Step 6.3), survey data performs a Bayesian update — this is a soft probabilistic adjustment. The plan does not justify this inconsistency. If survey data is informative enough to override formula-mode sliders, why is it only treated as soft evidence in ML mode? Conversely, if Bayesian updating is the correct way to integrate survey data, why does formula mode not use it? Suggestion: apply a consistent integration strategy across both modes. The simplest approach: in formula mode, use the survey data as slider defaults but allow the Bayesian error margin logic to narrow confidence intervals (mimicking the Bayesian approach without changing the computation).

The plan claims that "booth-level predictions must sum to constituency totals within one percentage point" (Step 3.2) as a mathematical consistency requirement. This is trivially guaranteed by the proportional allocation algorithm (which distributes constituency totals to booths by definition), so this "requirement" is not actually constraining anything. The real consistency question is whether the constituency-level prediction changes when booth-level survey data is available versus not available. If it does (because booth-level survey data feeds back into constituency-level factor values), then the system has a circular dependency: constituency predictions determine booth allocations, but booth data modifies constituency predictions. The plan should specify whether this is a one-pass or iterative computation and whether booth-level data feeds upward.

The plan's success criteria ("a surveyor can... answer a ten-question booth-level questionnaire in under three minutes") implies approximately ten questions. But the plan defines twenty factors (twelve quantitative + eight qualitative), each potentially mapped to a question. If the questionnaire covers all twenty factors, it would take substantially longer than three minutes. The plan does not specify which subset of factors each questionnaire covers, whether different campaigns can select different question subsets, or whether the "ten-question" target is realistic given the factor count. This needs reconciliation.

Phase 6 (ML Completion) has a hidden dependency on Phase 1 that the plan does not fully articulate. Step 6.3 (Bayesian survey integration) requires the survey aggregation API (Phase 1, Step 1.5, GET /campaigns/{id}/aggregated) to be complete. The plan's dependency diagram says "Depends on Phase 1 for survey data API" but the critical path places Phase 6 after the V2.0 ship (Phase 1 → 3 → 2 → 4 → ship → 5 → 6). This means the ML endpoint ships without survey integration in V2.0, and survey-augmented ML predictions only arrive in V2.1+. This is acceptable but the plan should state this explicitly rather than implying Phase 6 is part of V2.0.

**Logical Soundness Score: 3/5**

---

## Revised Recommendations

The plan is strong in its overall vision and approach selection but needs targeted fixes before implementation. My key recommendations:

1. **Formalize campaign-level authorization as a dedicated implementation step.** Add a Step 1.5b that creates a `require_campaign_access(campaign_id, min_role)` dependency following the existing `require_tier` pattern. This is a new authorization pattern not present in the codebase and should not be left implicit.

2. **Address file upload security in the plan, not just the research.** Add a Step 1.10 covering: MIME type validation, file size limits, magic byte validation, UUID naming, storage backend configuration, and access control for uploaded files.

3. **Resolve the survey data integration inconsistency.** Either apply Bayesian updating in both formula and ML modes, or clearly document and justify why the two modes treat survey data differently.

4. **Add factor orthogonality analysis for the eight new qualitative factors.** At minimum, group correlated factors (welfareSchemeImpact + developmentSatisfaction → governance satisfaction composite; candidatePersonalAppeal + partyWorkerActivity → campaign strength composite) to prevent double-counting.

5. **Reconcile the ten-question target with twenty factors.** Specify that questionnaires are configurable subsets of the factor catalog, not all-twenty-factors-every-time. The questionnaire JSON should support campaign-specific question selection.

6. **Add explicit risk mitigation for survey data bias.** Include a validation step comparing survey-informed predictions against known outcomes for at least one historical election.

7. **Specify security test cases in the test plan.** Add RBAC tests, file upload validation tests, JSONB schema validation tests, and rate limiting tests.

8. **Clarify the two sources of truth for questionnaire configuration.** The static JSON file and the per-campaign database column need explicit precedence rules.

9. **Add data export for survey campaigns.** Coordinators need to export raw survey data, not just PDF prediction reports.

10. **Address numerical stability with twenty multiplicative factors.** Add intermediate clamping or switch to log-space arithmetic to prevent floating-point issues with extreme inputs.

---

**Total Score: 29/55**

The plan's vision is sound and the approach selection is well-justified. The primary weaknesses are in security specificity (file uploads, authorization patterns), logical consistency (formula vs. ML survey integration), and risk coverage (survey data bias, scope creep, operational risks). These are all addressable with targeted revisions — the fundamental architecture does not need rethinking.

---

*Review saved to `_architect/reviews/2026-04-30-prediction-v2-review.md`*
*Current iteration: 1*

---

## Iteration 2 Review

**Date:** 2026-04-30
**Document version:** Draft — Refined (Iteration 1)
**Previous scores:** Security 2, Performance 3, Approach Validity 3, Pros/Cons 3, Industry Standards 3, Completeness 3, Feasibility 3, Risk Assessment 2, Codebase Alignment 4, Test Coverage 3, Logical Soundness 3. Total 29/55.

### Strengths

The Iteration 1 refinement demonstrates exceptional responsiveness to criticism. The Appendix documenting all thirty-eight changes, cross-referenced by dimension and criticism number, is a model of transparent plan iteration. Every critical weakness from the previous review has been directly addressed with a specific, traceable change. The plan has grown from a strong vision with significant gaps to a comprehensive, implementation-ready specification.

Several specific improvements deserve commendation:

The campaign-scoped authorization model (Step 1.5b) is a better design than the original ALTER TABLE approach. Keeping the global `role` column untouched and using campaign-level assignment records for surveyor/coordinator access is cleaner, avoids a risky migration, and naturally supports the case where a user is a coordinator on one campaign and a surveyor on another. The `require_campaign_access` dependency is well-specified and follows the existing `require_tier` pattern.

The factor orthogonality groupings (Step 1.4) are thoughtful. Grouping welfareSchemeImpact + developmentSatisfaction into a governance composite, and candidatePersonalAppeal + partyWorkerActivity into a campaign strength composite, is a principled approach to preventing double-counting. The honest relabeling from "calibrated" to "expert-derived heuristic mappings" is refreshingly transparent.

The consistent Bayesian integration across formula and ML modes (Steps 1.9 and 6.3) resolves the most significant logical inconsistency from the previous draft. The precision-weighted update formula $\mu_{post} = (\tau_{prior} \cdot \mu_{prior} + \tau_{survey} \cdot \mu_{survey}) / (\tau_{prior} + \tau_{survey})$ applied identically in both modes, differing only in the prior source, is clean and correct.

The explicit V2 scope boundaries (twelve items out of scope) and the infrastructure cost budget are exactly the kind of pragmatic framing a solo-developer project needs to avoid overcommitting.

---

### Security

The security posture has improved dramatically from Iteration 1. File upload security (Step 1.10), campaign-level authorization (Step 1.5b), GPS data minimization (Step 1.1), strict JSONB validation (Step 1.6), dedicated rate limiting (Step 1.5), and comprehensive security tests (Step 8.5) are all now formalized as explicit implementation steps with specific controls.

**Remaining minor issues:**

The soft-delete grace period in Step 2.6 specifies that deleted campaigns have a `deleted_at` timestamp that "filters the campaign from queries." However, the `require_campaign_access` dependency (Step 1.5b) is specified to verify campaign membership — it does not explicitly check `deleted_at IS NULL`. If a user has a cached campaign URL or memorized campaign ID, a direct API call to `/v1/campaigns/{deleted_campaign_id}/submissions` would pass the `require_campaign_access` check (the user was a member) but should be rejected because the campaign is soft-deleted. The access dependency should include a `deleted_at IS NULL` check, or the campaign lookup step that feeds into the dependency should filter on deletion status. This is a minor gap — the fix is trivial (one SQL WHERE clause) — but it should be explicit in Step 1.5b to prevent the implementation from missing it.

The rate limiting for survey submissions (ten per minute per user, one hundred per day per user) is appropriate for manual submission. However, the offline sync workflow (Phase 5) may submit queued items in rapid succession when connectivity is restored. If a surveyor accumulated fifteen pending submissions during a two-hour offline period, the sync process would hit the ten-per-minute rate limit on the eleventh submission. The plan should specify whether sync operations bypass the per-minute rate limit (using a header like `X-Sync-Batch: true` with backend-side verification that the submissions have valid offline timestamps) or whether the sync queue drains slowly to respect the limit. The current design risks legitimate submissions being rejected during sync bursts.

The questionnaire randomization seed stored with submission metadata (Step 1.11) is a reasonable survey methodology control. The seed itself is low-sensitivity data, but the plan should ensure it is not exposed in public campaign views — if an adversary could access submission metadata including randomization seeds, they could reconstruct question ordering patterns to analyze systematic surveyor biases by question position, which is a minor information leakage concern.

**Improvement from Iteration 1:** All five critical security gaps from the previous review have been closed. The remaining issues are minor implementation details, not architectural gaps.

**Security Score: 4/5**

---

### Performance

All four performance concerns from Iteration 1 have been addressed: dashboard caching uses TTL-only with thirty-second TTL (simpler and consistent with polling), numerical stability uses log-space computation with combined clamping to $[0.1, 10.0]$, concurrent PDF generation is limited by semaphore, and booth disaggregation is scoped per-constituency on drill-down.

**Remaining minor issue:**

The log-space clamping (Step 3.1) specifies computing $\exp(\sum_f \log(1 + \alpha_f \times x_{c,f}))$ with the sum clamped to $[\log(0.1), \log(10.0)]$. The existing prediction engine also applies per-factor clamping: `modifier = Math.max(0.5, Math.min(2.0, modifier))` at [predictionEngine.ts](frontend/src/engine/predictionEngine.ts#L293). The plan is ambiguous about whether the per-factor clamp is retained alongside the combined log-space clamp, or replaced by it. If only the combined clamp is used, a single extreme factor could theoretically produce a modifier of 0.1 or 10.0 for one party — more extreme than the current per-factor limit of 2.0. If both are retained, the combined clamp acts as a safety net for the compounding of individually-clamped factors. The plan should clarify the interaction: I recommend retaining per-factor clamping at [0.5, 2.0] as the primary control and adding the log-space combined clamp as a safety net, which is the least surprising behavior change from V1.

The performance targets are well-defined and the research validates they are achievable within the current stack. No new performance concerns are introduced by the refined plan.

**Performance Score: 4/5**

---

### Approach Validity

The composite factor groupings and honest calibration language address the two most significant approach validity concerns from Iteration 1. The one-pass, top-down booth disaggregation with no circular feedback is clearly specified and eliminates the circularity risk.

**Remaining minor issues:**

The four "independent" qualitative factors are claimed to be independent of each other and of the existing twelve factors. However, `communityConsolidation` (degree of bloc voting) and the existing `partyStrengthFactor` are likely correlated: strong community consolidation behind Party X would manifest as increased party strength for X. The plan addresses intra-group correlation for the new factors (governance composite, campaign strength composite) but not cross-correlation between new and existing factors. In practice, the multiplicative interaction between these correlated factors would amplify predictions for the dominant party beyond what either factor alone justifies. This is a methodological concern rather than an implementation bug — the fix would be a cross-correlation analysis during backtesting (which the plan already proposes). Flagging it here so the backtesting step (Step 1.4) explicitly includes cross-factor correlation checks between old and new factors, not just within the new factor groups.

The proportional booth-level disaggregation is now clearly labeled as "estimated distribution (survey-anchored)" rather than "prediction." This is the right call. The plan's acknowledgment that "the value is operational (knowing which booths to focus campaign resources on) rather than analytical (predicting exact booth-level vote counts)" is honest and well-articulated.

**Approach Validity Score: 4/5**

---

### Pros and Cons Balance

The comparative assessment has improved substantially. Approach A is now fairly evaluated ("approximately eighty percent of the value at roughly sixty percent of the effort"), effort estimates are provided for all three approaches (A: 2-3 months, B: 6+ months, C: 4-6 months), and a comparative table covers all relevant criteria. The plan explicitly positions Phases 1-2 of Approach C as delivering an "enhanced Approach A" if development stalls, which is a strong risk mitigation framing.

Approach B's dismissal is now stronger with the explicit note about synthetic Dirichlet priors having ±15-25% error margins — "no better than Approach C's proportional allocation" — making the cost-benefit comparison decisive. No issues identified for this dimension beyond what was already resolved.

**Pros and Cons Balance Score: 5/5**

---

### Industry Standards and Best Practices

The plan now addresses survey methodology (question randomization within sections, optional calibration exercise), PWA standards (manifest.json with proper metadata for installability), and basic ML ops (drift detection with rolling prediction distribution monitoring).

**Remaining minor issues:**

The surveyor calibration exercise (Step 1.11) is optional for V2.0, which is pragmatic. However, without calibration, the quality-weighted aggregation (Step 1.7) uses quality scores based only on completeness, consistency, time spent, and GPS proximity — not on the surveyor's demonstrated rating accuracy. This means two surveyors who are both "complete and consistent" but systematically biased in opposite directions would both receive high quality scores, and their average would be treated as ground truth. The plan acknowledges this is a V2.0 limitation, and the data structures support calibration from launch, which is the right approach. Flagging it as a known limitation rather than a flaw.

The drift detection in Step 6.2 specifies "log a warning if the mean prediction confidence drops below a threshold or the predicted seat distribution changes by more than ten percent between model versions." The plan does not specify where these warnings surface — log file, admin dashboard notification, or email alert. For a single-developer project, log-based monitoring with periodic manual review is sufficient, but this should be explicitly stated to prevent the warning from being implemented as a silent log line that nobody checks.

The plan does not reference WCAG accessibility standards beyond "Step 8.7: Accessibility audit for all new components." For a mobile-first surveyor tool used in the field, accessibility is important — large font sizes, sufficient color contrast for outdoor use, and screen reader compatibility for visually impaired users. The plan should specify a minimum WCAG conformance level (AA is standard) and note that outdoor visibility (high contrast mode) is particularly important for a field survey tool. This is a minor gap given that Step 8.7 exists as a dedicated audit step.

**Industry Standards Score: 4/5**

---

### Completeness

The plan now addresses survey data CSV export (Step 1.5), multi-language questionnaire support (Step 2.7), campaign lifecycle management with soft-delete (Step 2.6), and database backup configuration (Step 8.10). The conflict resolution strategy (auto-accept all submissions, coordinator-level handling) elegantly avoids the UI-less background sync conflict problem identified in Iteration 1.

**Remaining minor issues:**

The plan does not clarify the relationship between V1's `SurveyImportModal` (CSV/JSON import of factor values) and V2's questionnaire-based survey system. Both are paths into the prediction engine, but they serve different user personas: the import modal is for analysts who already have factor values, while the questionnaire is for surveyors who report observations. The plan should specify whether the import modal remains functional in V2 (coexisting as an analyst power-user feature) or is deprecated in favor of the questionnaire workflow. If both coexist, the prediction engine needs to handle two sources of factor overrides — survey-aggregated defaults and CSV-imported values — with a clear precedence rule.

The district-level choropleth (Step 7.1) assumes district-level GeoJSON is "freely available from datameet and similar open data projects." The research document confirms DataMeet has some district boundaries, but doesn't verify coverage for all states the platform supports. If the plan proceeds with district choropleth and discovers that district boundaries for, say, Uttar Pradesh or Bihar are unavailable or low-quality, the visualization falls back to... what? The plan should specify a fallback (state-level view with constituency heat table, which already exists as Step 7.2) and note that the heat table is the guaranteed visualization while the choropleth is best-effort.

The plan specifies seven languages for multi-language support (en, ta, hi, bn, te, kn, mr) but does not address how translations will be sourced. For twenty questions with help text in seven languages, that is approximately 280 translation strings. Will the developer translate these personally? Use a translation service? Crowdsource from users? For V2.0 with "partial coverage acceptable" and English fallback, this is manageable, but the plan should note the translation sourcing strategy.

**Completeness Score: 4/5**

---

### Feasibility

The plan now includes a skill assessment (familiar/moderate/steep learning curves), infrastructure cost budget ($5-12/month on paid tiers), and explicit scope boundaries. The timeline estimate of 4-6 months is supported by a per-phase breakdown that sums to 18-27 weeks (4.5-6.75 months), consistent with the stated range.

**Remaining minor issue:**

The learning curve estimate of "approximately two weeks distributed across phases" is slightly optimistic for the technologies listed as "steeper learning curve (3-5 days each)": GeoJSON visualization, ONNX model deployment and SHAP integration, and Playwright offline testing. Each of these has significant debugging overhead beyond initial learning. Service worker debugging in particular is notorious — cached resources that refuse to update, scope registration issues, and the developer tools workflow for testing offline behavior are consistently underestimated. A more conservative estimate of 3-4 weeks total would be prudent, but this does not change the overall feasibility assessment since it fits within the 4-6 month range.

The plan's graceful degradation model is well-conceived: "if development stalls after Phase 2, the delivered product is still a viable enhanced Approach A." This is a strong risk mitigation for a solo-developer project with ambitious scope.

**Feasibility Score: 4/5**

---

### Risk Assessment

The plan now identifies survey data fraud (with inter-surveyor consistency checks and temporal pattern analysis), scope creep (with explicit out-of-scope list), survey bias validation (backtesting against historical outcomes), and operational risks (acknowledged as out of scope). The risk coverage has improved substantially from Iteration 1.

**Remaining issues:**

The plan identifies the risk that "the questionnaire-to-factor translation may produce worse predictions" and specifies backtesting against historical outcomes. However, it does not specify a concrete decision rule for the negative outcome. If backtesting shows survey data degrades prediction accuracy, what happens? Does the system default to model-only predictions and surface a warning? Does the team adjust coefficients iteratively? Is there a threshold of accuracy degradation that triggers a fallback? Without a specific action plan for the negative case, the risk mitigation is incomplete — it identifies the risk and proposes detection (backtesting) but not remediation.

The plan recommends Railway's paid tier ($5/month for 5GB) "if survey data volume exceeds free tier limits." But the timing is important: if the 500MB limit is hit during an active survey campaign (the worst possible time), the production database would stop accepting writes. The plan should recommend proactive migration to the paid tier before deploying V2's survey features to production, not as a reactive measure. The infrastructure cost budget table already includes this cost — the plan just needs to specify that paid tier migration is a Phase 1 prerequisite, not a Phase 8 afterthought.

The database backup configuration is in Step 8.10 (Phase 8 — the last phase). But the first schema migration (0007_survey_tables) runs in Phase 1, and survey data begins accumulating immediately after Phase 1 deployment. If a Phase 2 or Phase 3 migration goes wrong and corrupts data, there is no backup to recover from. The backup configuration should be a Phase 1 prerequisite or at minimum completed before Phase 2 begins. This is a sequencing issue, not a missing feature.

**Risk Assessment Score: 4/5**

---

### Codebase Alignment

The plan demonstrates excellent awareness of codebase patterns. The campaign-scoped assignment model avoids altering the users table. The questionnaire configuration follows the existing static JSON file pattern. The authorization dependency follows the `require_tier` pattern. The migration follows the sequential numbering convention.

**Remaining minor issue:**

The questionnaire configuration in `api/factor_data/questionnaire.json` includes a `translation_function` field per question (Step 1.3: "how the response value maps to the factor value"). JSON cannot represent executable functions. The plan should clarify whether translation functions are implemented as named strategy strings (e.g., `"linear_5pt_to_0_100"`) that map to TypeScript/Python functions via a lookup table, or as mathematical expressions stored as strings (e.g., `"value * 20"`) that are evaluated at runtime. The former is safer (no eval) and more consistent with the existing pattern where `factor_catalog.json` stores data and the engine code contains the logic. The latter introduces code-as-data security and maintenance concerns. This needs explicit specification to prevent an implementer from choosing the unsafe path.

No other codebase alignment concerns. The plan respects all identified patterns.

**Codebase Alignment Score: 4/5**

---

### Test Coverage

The test plan has improved significantly with security tests (Step 8.5), performance test methodology (k6/Locust with realistic data seeding, Step 8.3), automated offline testing (Playwright with `setOffline`, Step 8.4), and Bayesian edge cases (Step 8.6). The coverage is now comprehensive across unit, integration, security, performance, and end-to-end categories.

**Remaining minor issues:**

The interaction between rate limiting and offline sync is not tested. The test plan includes rate limiting tests (Step 8.5: "submit twelve in one minute, expect eleventh and twelfth to return 429") but does not test the sync scenario where a surveyor reconnects and drains a queue of fifteen pending submissions. This is a realistic failure mode — a legitimate surveyor who worked offline for two hours would have their sync partially rejected by the rate limiter. The test plan should include a sync-burst test that validates the system's behavior when queued submissions exceed the per-minute rate limit.

The performance test pass/fail criteria are not specified. The plan defines targets (p95 <500ms for submissions, <2s for dashboard) and methodology (k6/Locust with realistic data) but does not state whether a missed target blocks the release or is documented as a known limitation. For a solo-developer project, I recommend specifying that performance targets are "goals, not gates" — a missed target is logged in the release notes with a remediation plan, not a release blocker. This prevents performance optimization from becoming an infinite time sink.

The plan specifies "property-based tests with randomized inputs across all sixteen effective modifiers must verify vote conservation across one thousand random configurations" (Section 9). This is excellent test engineering. However, the plan does not specify the property-based testing framework. The existing frontend uses Vitest — does the developer intend to use `fast-check` (the standard property-based testing library for TypeScript) or implement custom randomized loops? Specifying the tool prevents re-invention.

**Test Coverage Score: 4/5**

---

### Logical Soundness

The plan's internal logic has improved substantially. The Bayesian integration is now consistent across modes. The questionnaire source of truth is clarified (static JSON for definitions, database for campaign-level selection). The booth disaggregation is explicitly one-pass with no feedback. The ten-question vs. twenty-factor tension is reconciled with configurable subsets.

**Remaining minor issues:**

The Bayesian update is applied independently to each party's vote share, then the posteriors must be renormalized to sum to 100%. The plan acknowledges this constraint in the test plan (Step 8.6: "multi-party constraint — all party posteriors must sum to 100% after updating — verify renormalization") but does not specify the renormalization method. Independent updating followed by proportional renormalization introduces a distortion: if survey data boosts Party A by 10 percentage points, the remaining parties all lose share proportionally, regardless of whether the survey data said anything about those parties. An alternative is to apply the survey boost to Party A and subtract proportionally from parties the survey data specifically identified as weaker — but this requires more structured survey data. The proportional renormalization is the pragmatic choice, but the plan should acknowledge the distortion explicitly and note that it is acceptable because the error is bounded by the survey shift magnitude.

The plan specifies "prior precision is derived from historical model residual variance per state" (Step 6.3). This requires computing per-state residual variance from backtesting historical predictions. But the ONNX model has not been trained yet (Step 6.1 is the notebook execution step). For V2.0 (shipped after Phase 4, before Phase 6), the formula-mode Bayesian integration needs a prior precision value without a trained model. The plan should specify what provides the formula-mode prior precision in the absence of backtesting data — the slider-deviation heuristic from `computeSliderDistance()` is one option, or a fixed conservative value (e.g., prior variance = 0.1, representing ±10% uncertainty in formula predictions) could serve as a bootstrap. This is a small gap but it affects V2.0 behavior.

Step 1.9 specifies that "in both formula mode and ML mode, survey data is integrated consistently as soft evidence." But ML mode is not available until Phase 6 (the "coming soon" label is removed in Step 6.4). So in V2.0, the ML mode code path for survey integration exists but cannot be exercised or tested. This is acknowledged in the plan summary ("ships as V2.1, not V2.0") but creates dead code in Phase 1 that cannot be validated until Phase 6. The plan should either defer the ML survey integration code to Phase 6 (write it when it can be tested) or include mock-based unit tests in Phase 1 that validate the ML code path with a synthetic prior. The current plan has the code in Phase 1 and the tests in Phase 8 — a gap of potentially 3-4 months.

**Logical Soundness Score: 4/5**

---

### Revised Recommendations

The plan has matured significantly from Iteration 1. No critical weaknesses remain — all issues identified above are minor implementation details or clarification needs, not architectural flaws. The plan is ready for implementation with the following targeted fixes:

1. **Soft-delete access control (Security):** Add `deleted_at IS NULL` check to `require_campaign_access` or the campaign lookup query.

2. **Rate limit vs sync burst (Security/Test Coverage):** Specify whether offline sync operations bypass or respect the per-minute rate limit, and add a sync-burst test case.

3. **Per-factor vs combined clamping (Performance):** Clarify that per-factor clamping at [0.5, 2.0] is retained alongside the combined log-space clamp at [0.1, 10.0].

4. **Translation function representation (Codebase Alignment):** Specify that `translation_function` in questionnaire JSON is a named strategy string mapped to code, not an evaluable expression.

5. **Formula-mode prior precision bootstrap (Logical Soundness):** Specify a default prior precision value for V2.0 before backtesting data is available.

6. **Database backup sequencing (Risk):** Move backup configuration from Phase 8 to Phase 1 prerequisites.

7. **Paid tier migration timing (Risk):** Recommend proactive migration to Railway paid tier before V2 production deployment.

8. **V1 SurveyImportModal relationship (Completeness):** Clarify whether the CSV import modal coexists with or is replaced by the questionnaire system.

None of these require architectural changes. They are clarification and specification refinements that a developer would encounter and resolve during implementation. The plan's fundamental architecture — hybrid survey-augmented engine with campaign-scoped authorization, composite factor groupings, one-pass booth disaggregation, and consistent Bayesian integration — is sound and ready to build.

---

### Score Summary

| Dimension | Iteration 1 | Iteration 2 | Change |
|---|---|---|---|
| Security | 2 | 4 | +2 |
| Performance | 3 | 4 | +1 |
| Approach Validity | 3 | 4 | +1 |
| Pros and Cons Balance | 3 | 5 | +2 |
| Industry Standards | 3 | 4 | +1 |
| Completeness | 3 | 4 | +1 |
| Feasibility | 3 | 4 | +1 |
| Risk Assessment | 2 | 4 | +2 |
| Codebase Alignment | 4 | 4 | 0 |
| Test Coverage | 3 | 4 | +1 |
| Logical Soundness | 3 | 4 | +1 |

**Total Score: 45/55** (up from 29/55)

**Critical weaknesses remaining: None.** All remaining issues are minor (score 4) and addressable during implementation without plan revision. The plan is approved for implementation.

---

*Review updated at `_architect/reviews/2026-04-30-prediction-v2-review.md`*
*Current iteration: 2*
