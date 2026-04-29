# Implementation Phases: Frontend Tooling Evaluation

**Date:** 2026-04-28
**Source:** [Full Analysis](../analysis/2026-04-28-frontend-tooling-evaluation.md)
**Decision:** Pragmatic Foundation (Approach 2) — Bun standardization, incremental TypeScript, testing, Prettier
**Total Effort:** ~27-37 developer-hours across 6 days

---

## Phase 1: Package Manager Standardization (Day 1, 2-4 hours)

- **Step 1.1:** Update CI to use Bun (oven-sh/setup-bun@v2, pin Bun version across CI/Docker/Vercel)
- **Step 1.2:** Delete package-lock.json
- **Step 1.3:** Verify all deployment paths (Docker build, Vercel preview, GCP Cloud Build)
- **Step 1.4:** Update developer documentation (README)

## Phase 2: Prettier and Formatting Infrastructure (Day 1, 1-2 hours)

- **Step 2.1:** Install Prettier, create .prettierrc matching existing code style
- **Step 2.2:** One-time reformat + .git-blame-ignore-revs for the reformat commit
- **Step 2.3:** Add format check to CI (bun run format:check)
- **Step 2.4:** Install Husky + lint-staged pre-commit hooks

## Phase 3: TypeScript Wave 1 — API Types and Client (Days 2-3, 10-14 hours)

- **Step 3.1:** Add tsconfig.json (strict: false, strictNullChecks: true, allowJs: true)
- **Step 3.1a:** Add tsc --noEmit as permanent CI blocking step
- **Step 3.1b:** Install @typescript-eslint and update ESLint config for .ts/.tsx
- **Step 3.2:** Define API response type interfaces in src/types.ts (match backend models.py)
- **Step 3.2a:** Evaluate pydantic-to-typescript; implement CI validation script for type sync
- **Step 3.3:** Convert api.js → api.ts with typed return values
- **Step 3.4:** Update all import sites
- **Step 3.5:** Convert constants.js → constants.ts
- **Proof-of-value milestone:** Type two API methods first to demonstrate value before full conversion

## Phase 4: TypeScript Wave 2 — Prediction Engine and Tests (Days 3-4, 6-8 hours)

- **Step 4.1:** Convert predictionEngine.js → predictionEngine.ts with typed interfaces
- **Step 4.2:** Convert existing tests to .test.ts (update Vitest config)
- **Step 4.3:** Expand prediction engine tests (golden-value numerical assertions, NaN tests, edge cases)
- **Step 4.3a:** Expand aggregateResults tests (already has 6, add edge cases)
- **Step 4.4:** Add API client unit tests (cache, deduplication, errors, CSRF, authHeaders edge cases)
- **Step 4.4a:** Add full-chain integration test (generateBaseline → applyNewParty → aggregateResults)

## Phase 5: TypeScript Wave 3 — Context Providers and App (Days 5-6, 6-8 hours)

- **Step 5.1:** Convert AuthContext.jsx → AuthContext.tsx (typed context value)
- **Step 5.2:** Convert StateContext.jsx → StateContext.tsx (literal union for electionType)
- **Step 5.3:** Add context provider tests
- **Step 5.4:** Convert App.jsx → App.tsx
- **Step 5.4a:** Convert ErrorBoundary to TypeScript (React.Component<Props, State>)
- **Step 5.5:** Establish "all new files in .tsx" rule with CI enforcement script

## Phase 6: Deferred Items Documentation (Day 6, 1 hour)

- **Step 6.1:** Document CSS architecture trigger (>2,000 lines or first collision → CSS Modules)
- **Step 6.2:** Document accessibility linting trigger (institutional users → eslint-plugin-jsx-a11y)
- **Step 6.3:** Document monorepo rejection rationale

---

## Explicitly Rejected

- **CSS Modules migration:** Not yet causing pain at 1,210 lines. Trigger documented.
- **Tailwind CSS:** Full paradigm rewrite, disproportionate effort.
- **Monorepo tooling:** No shared code between JS frontend and Python backend.
- **State management library:** Context API sufficient for current complexity.
- **Framework replacement:** React 19 not under evaluation.
