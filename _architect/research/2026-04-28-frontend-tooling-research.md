# Frontend Tooling and Developer Experience: Deep Research Report

**Date:** 2026-04-28  
**Analyst:** GitHub Copilot (Senior Technical Analyst)  
**Subject:** Frontend tooling evaluation for the Indian election analytics platform  
**Refined Prompt:** [2026-04-28-frontend-tooling-refined-prompt.md](2026-04-28-frontend-tooling-refined-prompt.md)  
**Related Research:** [2026-04-28-tech-stack-evaluation-research.md](2026-04-28-tech-stack-evaluation-research.md)

---

## Codebase Findings

### Package Management: The Dual-Lockfile Situation

The project currently maintains two lockfiles in the frontend directory: [frontend/package-lock.json](../../frontend/package-lock.json) and [frontend/bun.lock](../../frontend/bun.lock). This is not an indecisive state — it is a partially completed migration. The evidence is clear: the [frontend/Dockerfile](../../frontend/Dockerfile) uses `oven/bun:1-alpine` for both dev and build stages, running `bun install --frozen-lockfile 2>/dev/null || bun install` and `bun run build`. The [frontend/vercel.json](../../frontend/vercel.json) specifies `"buildCommand": "bun run build"`, meaning Vercel production deploys already use Bun. The [infra/cloudbuild/frontend-deploy.yaml](../../infra/cloudbuild/frontend-deploy.yaml) GCP Cloud Build config also uses `oven/bun:1-alpine` for both install and build steps.

However, the [.github/workflows/ci.yml](../../.github/workflows/ci.yml) CI pipeline uses Node.js 20 with `npm ci --legacy-peer-deps` for the frontend job. This means CI tests run with npm while all three deployment paths (Docker, Vercel, Cloud Build) use Bun. The `--legacy-peer-deps` flag in CI suggests there were peer dependency resolution differences between npm and the dependency tree.

The [frontend/package.json](../../frontend/package.json) scripts use generic commands (`vite`, `vitest`, `eslint`) not prefixed with any specific package manager, meaning they work with both `npm run` and `bun run` identically. There are six production dependencies and twelve devDependencies — a small dependency tree. None of the dependencies require postinstall scripts that would trigger Bun's `trustedDependencies` requirement (Firebase, React, Recharts, react-simple-maps, and Sentry are all pure JavaScript packages with no native compilation steps).

### Component Architecture and Code Patterns

The frontend at [frontend/src/](../../frontend/src/) contains 24 components in [frontend/src/components/](../../frontend/src/components/), 2 widget components in [frontend/src/widgets/](../../frontend/src/widgets/), 2 context providers in [frontend/src/contexts/](../../frontend/src/contexts/), 1 custom hook in [frontend/src/hooks/](../../frontend/src/hooks/), 1 prediction engine module in [frontend/src/engine/](../../frontend/src/engine/), 1 API client in [frontend/src/api.js](../../frontend/src/api.js), 1 constants/config module in [frontend/src/constants.js](../../frontend/src/constants.js), and 1 Firebase config in [frontend/src/firebase.js](../../frontend/src/firebase.js).

All component files follow a consistent pattern: functional components with hooks (useState, useEffect, useMemo, useCallback), no class components except [frontend/src/components/ErrorBoundary.jsx](../../frontend/src/components/ErrorBoundary.jsx) which uses React class component syntax as required by the Error Boundary API. Components receive props without any type annotations or PropTypes validation. The only runtime safety is defensive optional chaining (`?.`) used pervasively — observed in at least 20 locations across App.jsx, ConstituencyList.jsx, ConstituencyDetail.jsx, CommunityFeed.jsx, ElectionTimeline.jsx, and the prediction engine.

The [frontend/src/App.jsx](../../frontend/src/App.jsx) file is the largest component at approximately 450 lines, serving as both the router configuration and the primary state orchestrator for prediction data. It imports the prediction engine functions directly, manages prediction parameters as local state, computes baseline and new-party predictions via useMemo chains, and passes results down through the component tree. This is the most complex data flow in the application and the most likely location for type-related bugs.

### API Client Analysis

The [frontend/src/api.js](../../frontend/src/api.js) module (~200 lines) exports a single `api` object with approximately 30 methods. The client implements in-memory caching via a Map with 5-minute TTL, request deduplication for inflight requests, CSRF token extraction from cookies, and Bearer token management via localStorage. Error handling is uniform: all HTTP methods throw `new Error()` on non-ok responses, with the POST handler attempting to parse error detail from the response body.

Critically, the API client performs zero validation on response data. Every `get()` call returns `res.json()` directly, and consumers like StateOverview, ConstituencyDetail, and NationalDashboard destructure and render the response data without any shape validation. The `api.states()` call returns an array that components assume contains `{state_name, display_name}` objects. The `api.stateSwing()` call returns rows that components assume contain `{year, party, seats_won, avg_vote_share, swing_from_prev}` fields. If the backend changes a field name or returns null where a number is expected, the frontend will render `undefined` or throw at runtime.

### Prediction Engine: The Most Type-Sensitive Code

The prediction engine at [frontend/src/engine/predictionEngine.js](../../frontend/src/engine/predictionEngine.js) (~280 lines) exports three functions: `generateBaseline`, `applyNewParty`, and `aggregateResults`. This is pure computational logic with no DOM or React dependencies — it takes data structures in and returns data structures out. The functions manipulate arrays of objects with specific shapes (constituencies with `electors_latest`, `candidates_latest`, `winner_party_latest`, etc.), perform arithmetic on vote shares, normalize party names, and produce result objects with fields like `predicted_winner`, `predicted_margin_pct`, `flipped`.

This module has the only test file in the project: [frontend/src/engine/__tests__/predictionEngine.test.js](../../frontend/src/engine/__tests__/predictionEngine.test.js) (~200 lines, approximately 15 test cases). The tests cover `generateBaseline` (9 tests: basic output, growth factor math, anti-incumbency, party normalization, edge cases for empty/single candidates, zero turnout, null vote shares) and `applyNewParty` (at least 4 tests: no-op cases, new party addition, vote conservation). The test file uses well-structured fixtures via a `makeConstituency()` helper function.

The prediction engine is the highest-risk code for type errors because: (1) it operates on deeply nested objects from the API (`c.candidates_latest[].vote_share_percentage`, `c.winner_party_latest`), (2) it performs arithmetic that will silently produce NaN if inputs are undefined, (3) the `emptyResult` function returns a specific object shape that must match what consuming components expect, and (4) the `applyNewParty` function clones and mutates objects, introducing opportunities for shape mismatches.

### CSS Architecture: Single File Analysis

The entire application's styles live in [frontend/src/index.css](../../frontend/src/index.css), a single file of approximately 1,210 lines. The file is organized into comment-delimited sections covering: root CSS variables and resets (lines 1–15), header and navigation (16–40), panels and headings (41–46), filters and forms (48–62), badges (64–72), constituency grid tables (75–100), constituency detail views (125–170), charts and Recharts customization (170–250), prediction panel controls (250–400), login modal and auth UI (400–500), community feed and bookmarks (500–600), national dashboard with map, rankings, party strength (600–900), pricing and payment UI (900–1000), responsive breakpoints (1000–1100), and utility/widget styles (1100–1210).

The CSS uses a flat class naming convention (`.pred-panel`, `.pred-label`, `.pred-slider`, `.affinity-grid`, `.affinity-row`) that effectively namespaces by component feature but is not formally scoped. CSS custom properties (`:root` variables for `--bg`, `--bg2`, `--text`, `--accent`, `--border`, `--sans`, `--mono`) provide a coherent dark theme. Several components also use inline styles via the `style` attribute (observed in ErrorBoundary.jsx, ApiKeyManager.jsx, IndiaMap.jsx), creating an inconsistent pattern where some styling is in CSS and some is inline.

The responsive design uses `@media` queries at the end of the file targeting common breakpoints. There is no evidence of CSS class name collisions, specificity conflicts, or cascade ordering issues in the current codebase.

### Testing Infrastructure State

Vitest is fully configured in [frontend/vite.config.js](../../frontend/vite.config.js) with `environment: 'jsdom'` and `globals: true`. The [frontend/package.json](../../frontend/package.json) includes `@testing-library/react`, `@testing-library/jest-dom`, `vitest`, and `@vitest/coverage-v8` as devDependencies. The `test` and `test:coverage` scripts are defined. The test runner works — the existing predictionEngine tests pass.

Coverage scope: 1 module tested (predictionEngine.js) out of approximately 32 modules (24 components + 2 widgets + 2 contexts + 1 hook + 1 API client + 1 constants + 1 firebase config). This represents approximately 3% module coverage. The following modules have zero test coverage: all 24 React components, the API client (api.js), both context providers (AuthContext.jsx, StateContext.jsx), the useDebounce hook, the constants module (normalizeParty, partyColor, buildAffinityPresets), and the firebase config.

### CI/CD Pipeline

The [.github/workflows/ci.yml](../../.github/workflows/ci.yml) runs on pull requests and pushes to main. The frontend job currently: (1) checks out code, (2) sets up Node.js 20 with npm cache, (3) runs `npm ci --legacy-peer-deps`, (4) runs `npx vitest run --coverage`, (5) runs `npx eslint src/`. There is no Prettier check, no type checking, no build verification (`vite build` is not run in CI), and no bundle size check.

---

## Architectural Constraints

The following constraints shape the viable options for tooling changes.

The project is maintained by a solo developer who is highly proficient in JavaScript and React but has not shipped production TypeScript. Tooling changes that require significant learning investment compete directly with feature development time. The codebase is small enough (~5K LOC) that the developer can hold the entire architecture in working memory, reducing the value of compiler-enforced constraints.

The deployment architecture is split: frontend deploys to Vercel (static SPA) and backend deploys to Railway (Python FastAPI). This separation means there is no shared runtime, no server-side rendering, and no monorepo-level deployment coordination needed. The frontend build output is a static bundle served by nginx (in Docker) or Vercel's CDN.

The application is read-heavy analytics rendering: tables, charts (Recharts), maps (react-simple-maps), and prediction simulators. There are no real-time features, no complex forms, no rich text editors, no drag-and-drop interactions. Performance sensitivity is limited to chart rendering responsiveness and initial bundle load time.

The user base is approximately 1K MAU with a India-focused audience, meaning the blast radius of production bugs is small and bugs can be fixed quickly. There is Sentry integration for error tracking at [frontend/src/main.jsx](../../frontend/src/main.jsx).

The CI pipeline must work with whatever package manager is chosen. Currently CI uses npm but deployment uses Bun, creating a testing-production mismatch risk.

---

## Industry Approaches

### 1. Bun vs npm vs pnpm: Package Manager Standardization

**Approach A: Standardize on Bun (complete the migration)**

Bun has reached production maturity, with the lockfile format (`bun.lock`) switching to text-based in Bun 1.2+ for better diffability and version control. Bun claims 25x faster installs than npm, using OS-level optimizations (clonefile on macOS, hardlink on Linux). For this project's dependency tree (18 packages with transitive dependencies), clean install times on a modern machine would be approximately: npm ~8-15s, pnpm ~4-8s, Bun ~1-3s. For warm installs (populated cache), all three converge to under 3 seconds.

Bun as a package manager is fully npm-compatible — it reads package.json, resolves from the npm registry, produces a standard node_modules directory (hoisted by default, isolated option available). It does not require Bun as a runtime; `bun install` produces the same node_modules that Node.js, Vite, and vitest consume. The project already uses Bun this way: the Dockerfile runs `bun install` then `bun run build` which invokes Vite (not Bun's bundler).

Bun's lifecycle script security model (not running postinstall by default, requiring `trustedDependencies`) is a security advantage for supply chain protection. None of this project's 18 dependencies require postinstall scripts, so this restriction has zero impact.

CI support: GitHub Actions has the official `oven-sh/setup-bun@v2` action. Bun supports `bun ci` (equivalent to `bun install --frozen-lockfile`) for reproducible CI builds. Vercel has native Bun support (the project's vercel.json already uses `bun run build`).

Known compatibility: Bun as a package manager works seamlessly with Vite 8, React 19, Firebase SDK, and Vitest because these tools use Node.js as their runtime, not Bun. The package manager's job is only to install packages, not execute them. `bun run <script>` invokes the script using Bun's runtime for .ts/.js files or the system shell for package.json scripts, but Vite's dev server and build process use their own internal module resolution.

**Approach B: Standardize on npm (revert Bun usage)**

npm is the default, zero-configuration package manager for Node.js projects. It requires no additional setup in CI (Node.js includes npm), has the largest community and longest track record, and every tutorial, documentation page, and Stack Overflow answer assumes npm. The `--legacy-peer-deps` flag currently used in CI suggests there may be peer dependency resolution strictness differences — npm v7+ is stricter about peer dependency conflicts than npm v6 or Bun.

Reverting to npm would require updating the Dockerfile to use a Node.js base image, updating vercel.json to remove the `buildCommand` override (Vercel defaults to npm for Vite projects), and updating the Cloud Build config to use a Node.js image. This is migration work in the wrong direction given the existing Bun adoption.

**Approach C: Switch to pnpm**

pnpm offers strict dependency isolation via content-addressable storage and symlinked node_modules, preventing phantom dependency access. Install speed is between npm and Bun (typically 2-3x faster than npm). pnpm has strong workspace/monorepo support. However, pnpm would be a new tool for a project that has already partially adopted a different alternative (Bun). It would require a new lockfile (pnpm-lock.yaml), a new base image in Docker, and learning a third package manager. There is no compelling reason to choose pnpm over Bun when Bun is already integrated.

**Approach D: Keep dual lockfiles (current state)**

The current state has npm in CI and Bun everywhere else. This creates a testing-production mismatch: if Bun resolves a transitive dependency to a different version than npm would (possible with different resolution algorithms), CI tests could pass against npm's resolution while production runs Bun's resolution. The `--legacy-peer-deps` flag in CI further increases divergence risk. Maintaining two lockfiles also means two files to commit, review, and keep in sync.

### 2. TypeScript Migration: ROI Analysis

**Approach A: Full TypeScript migration (strict mode)**

A full migration would rename all 32 .jsx/.js files to .tsx/.ts, add a tsconfig.json with strict settings, add type annotations to all function signatures and state declarations, create type definitions for API response shapes, and run `tsc --noEmit` in CI. Vite 8 supports TypeScript out of the box — it uses the Oxc Transformer to transpile .ts files to JavaScript without performing type checking (type checking is deferred to `tsc` or IDE). This means adding TypeScript would not slow down the dev server or HMR.

The realistic migration scope for this codebase:
- **api.js** (~200 lines): Define interfaces for each API response shape (Election, StateSummary, Constituency, Bookmark, etc.), type the api object methods with return types. This is where TypeScript provides the highest value — catching field name mismatches between frontend expectations and backend responses.
- **predictionEngine.js** (~280 lines): Define interfaces for Constituency input, PredictionResult output, PredictionParams config. This module already has tests; types would complement tests by catching shape errors at compile time.
- **constants.js** (~300 lines): Type the PARTY_COLORS record, normalizeParty function, GEO_TO_DB mapping, AFFINITY_PRESETS structure, DEFAULT_PREDICTION_PARAMS shape. Mostly straightforward.
- **AuthContext.jsx / StateContext.jsx**: Type the context values, provider props, and hook return types. Moderate complexity due to nullable state.
- **24 components + 2 widgets**: Type props interfaces for each component. Many components have implicit props (PredictionPanel receives `params`, `onChange`, `presets`, `topParties`). The App.jsx component would benefit most from typing due to its complex state management with predParams, predData, baseline, predictions, and summary.

Estimated effort: Creating the type system for API responses and shared data structures would take approximately 4-6 hours. Migrating the engine and utility modules would take 2-3 hours. Migrating components would take approximately 8-12 hours (averaging 30 minutes per component, with App.jsx taking 1-2 hours alone). Total: approximately 16-24 developer-hours for full migration.

**Approach B: Incremental TypeScript with allowJs**

Configure tsconfig.json with `allowJs: true` and `checkJs: false`, keeping all existing .jsx files unchanged. New files would be written as .tsx. Over time, individual files can be renamed to .tsx and annotated as the developer touches them. The `@types/react` and `@types/react-dom` packages already installed would provide React type definitions.

This approach allows TypeScript benefits in new code without the upfront cost of migrating existing code. The tsconfig.json would set `strict: false` initially and enable strict checks incrementally. Vite requires zero configuration to support mixed .js/.jsx/.ts/.tsx — it transpiles all of them identically.

The risk of this approach is that it can stall indefinitely — with no forcing function to migrate existing files, the codebase remains a JS/TS hybrid where the JS files get no type safety. The "migration momentum" problem is well-documented: incremental migrations that aren't actively pushed to completion often result in permanent hybrid states.

**Approach C: JSDoc type annotations (no TypeScript)**

TypeScript's type checker can validate JSDoc annotations in JavaScript files when `checkJs: true` is set in tsconfig.json. This provides many of the benefits of TypeScript (IDE autocomplete, type error detection, interface definitions) without renaming files or changing the build pipeline. Example: `/** @param {import('./types').Constituency[]} constituencies */` before function signatures.

JSDoc types are more verbose than TypeScript annotations, don't support all TypeScript features (conditional types, mapped types, template literal types), and are less readable in complex cases. However, they have zero migration cost for the build pipeline — the files remain .jsx and the existing ESLint, Vitest, and Vite configs work unchanged.

**Approach D: Keep JavaScript (current state)**

The codebase currently relies on IDE-powered type inference from @types/react for React-specific autocomplete. The defensive optional chaining (`?.`) used throughout the codebase suggests the developer is already aware of null/undefined risks and handles them manually. The existing test for predictionEngine validates the most type-sensitive code path. If the developer is not encountering type-related bugs in production (verifiable via Sentry error logs), the cost of TypeScript adoption may exceed its bug-prevention value at this scale.

### 3. Testing Strategy for Near-Zero Coverage

**Approach A: Unit-test business logic first, then expand**

The highest-ROI testing targets in this codebase, prioritized by bug impact and testability:

1. **predictionEngine.js** (partially tested): Expand coverage to include `aggregateResults` function (currently untested), edge cases for `applyNewParty` with extreme vote shares (>50%), and interaction between `generateBaseline` and `applyNewParty` chained together (as App.jsx does).

2. **constants.js — normalizeParty()**: This function maps party name variants to canonical names. It's called in every data rendering path. Incorrect normalization causes wrong party colors, wrong aggregation, and wrong prediction results. It's a pure function that's trivially testable.

3. **api.js — caching and deduplication logic**: The `_cachedGet` function implements request deduplication and TTL-based caching. Bugs here could cause stale data, duplicate requests, or cache pollution. Can be tested with mocked fetch.

4. **api.js — error handling**: The `get`, `post`, `put`, `del` functions throw on non-ok responses. Testing error paths ensures the app handles API failures gracefully.

5. **Component testing**: After business logic is covered, add component tests for the most complex data-rendering components: NationalDashboard (multiple API calls, sorting, computed summaries), PredictionPanel (complex form state, preset selection), ConstituencyList (filtering, sorting, pagination).

This approach uses Vitest (already configured) with @testing-library/react (already installed). No new dependencies needed.

**Approach B: Integration testing with MSW (Mock Service Worker)**

Add MSW to mock the API layer at the network level, then write integration tests that render full components with realistic API responses. This tests the entire data flow from API call to rendered output without a real backend. MSW intercepts fetch requests and returns predefined responses, testing both the API client and the components that consume its data.

This approach catches more bugs than unit testing (it tests the integration between api.js and component rendering logic) but is slower to write and run. MSW adds a dev dependency and requires maintaining mock response fixtures that must stay in sync with the actual API contract.

**Approach C: End-to-end testing with Playwright**

Skip unit and component tests entirely, add Playwright for browser-based end-to-end testing against a running dev server (with API mocked or running). This tests the full user experience: navigation, state selection, data loading, prediction simulation, authentication flow. E2E tests are the most realistic but also the slowest, most brittle, and hardest to maintain. For a solo developer, the maintenance burden of E2E tests often exceeds their value unless there are complex multi-step user flows that are critical to test.

**Approach D: Visual regression testing with Storybook**

Add Storybook to document and visually test components in isolation. This is particularly useful for data visualization components (charts, maps, timelines) where visual correctness is hard to assert with DOM queries. Storybook adds significant infrastructure (Storybook server, story files for each component, visual regression tooling like Chromatic or Percy).

For a solo developer with 24 components, the overhead of maintaining Storybook stories alongside components is substantial. The value proposition is stronger for component libraries or design systems than for application-specific components.

### 4. Prettier + Pre-commit Hooks

**Approach A: Prettier + Husky + lint-staged**

Install Prettier (`npm install -D prettier`), create `.prettierrc` with preferred config (e.g., `{ "singleQuote": true, "semi": true, "trailingComma": "all" }`), install `eslint-config-prettier` to disable ESLint formatting rules that conflict, install Husky and lint-staged, configure pre-commit hook to run `prettier --write` and `eslint --fix` on staged files.

Setup cost: approximately 30-60 minutes for initial configuration. Ongoing cost: near-zero — Prettier runs automatically on save (editor plugin) and on commit (pre-commit hook). The one-time reformatting commit will touch most files, creating a noisy git diff that makes `git blame` less useful for the reformatted lines. Running `prettier --write .` and committing the result resolves this in one commit.

For a solo developer, the primary value of Prettier is not enforcing consistency across team members (there's only one developer) — it's eliminating formatting decisions during coding. The developer never has to think about semicolons, trailing commas, line length, or quote style. This is a genuine cognitive load reduction even for solo work.

The primary value of pre-commit hooks for a solo developer is catching linting errors before they enter the commit history, avoiding the "fix lint errors" follow-up commit pattern. Since the CI already runs ESLint, pre-commit hooks move the lint check earlier in the feedback loop (seconds instead of minutes).

**Approach B: Prettier in editor only (no git hooks)**

Configure Prettier as the VS Code default formatter with format-on-save enabled. Add `.prettierrc` to the project root so the configuration is versioned. Do not install Husky or lint-staged. Add `prettier --check .` to CI to catch unformatted code.

This provides the same cognitive load reduction during development without the pre-commit hook infrastructure. The risk is that the developer might occasionally commit unformatted code (if they save without format-on-save, or edit outside VS Code), which CI would catch but not prevent.

**Approach C: Keep current setup (no Prettier)**

The existing ESLint config handles some formatting rules (via the recommended preset). The codebase currently has a reasonably consistent style — likely because one developer wrote it all. Adding Prettier would cause a large initial reformatting commit and add a dependency. If the current style is working and consistent, the incremental value of Prettier is marginal.

### 5. CSS Architecture

**Approach A: CSS Modules (minimal migration)**

Rename `index.css` and split it into per-component `.module.css` files. Each component imports its own styles: `import styles from './StateOverview.module.css'` and uses `className={styles.panel}` instead of `className="panel"`. Vite supports CSS Modules out of the box — any file ending in `.module.css` is automatically treated as a CSS module.

This provides component-scoped class names (generated as `StateOverview_panel_a1b2c` at build time), eliminating any risk of class name collisions. The CSS itself barely changes — just the class names become scoped. CSS custom properties (`:root` variables) would remain in a shared global CSS file.

Migration effort: Each of the 26 components would need its own `.module.css` file extracted from index.css, and its className strings would need to be updated to use the imported styles object. Estimated effort: 6-10 hours (15-25 minutes per component for CSS extraction + className updates).

**Approach B: Tailwind CSS (full rewrite)**

Replace all CSS classes with Tailwind utility classes inline in JSX. This would require installing Tailwind, configuring it, and rewriting every `className` prop in every component. For 1,210 lines of CSS across 26 components, this is a significant rewrite — estimated 15-25 hours.

Tailwind provides utility-first styling that eliminates dead CSS, provides responsive design primitives via breakpoint prefixes, and integrates a design system via its configuration. However, it changes the mental model from "write CSS selectors" to "compose utility classes in JSX" — a significant paradigm shift. The resulting JSX would have long className strings like `className="flex items-center gap-2 bg-gray-900 p-3 rounded-lg border border-gray-700"` which some developers find harder to read than semantic class names.

The dark theme currently implemented via CSS custom properties would need to be reimplemented via Tailwind's dark mode configuration. The custom colors (accent, bg2, border) would need to be added to the Tailwind config's theme extension.

**Approach C: Keep current plain CSS**

At 1,210 lines, the single CSS file is large but not unmanageable. The comment-delimited sections provide logical organization. There are no reported class name collisions. The CSS custom properties provide a clean theming system. The file can be navigated with editor search. For a solo developer who authored all the CSS, the mental model of "what class name does what" is already internalized.

The question is whether 1,210 lines is a tipping point. Industry experience suggests that single CSS files become painful at 2,000-3,000 lines (when searching for a class takes longer than writing a new one, when responsive breakpoint overrides become hard to track, when you start duplicating rules because you can't find the original). At 1,210 lines, the file is approaching but has not reached this threshold.

**Approach D: Split into component CSS files (no modules)**

A simpler alternative to CSS Modules: split index.css into separate CSS files per component or per feature area (e.g., `prediction.css`, `national.css`, `auth.css`), imported directly in the component files. This provides organizational separation without the scoping of CSS Modules. Vite bundles all imported CSS into the final build regardless of where it's imported. This reduces the single-file size problem without changing the className convention.

### 6. Monorepo Value Assessment

**Approach A: Turborepo or Nx monorepo tooling**

Install Turborepo or Nx at the repo root, configure workspaces for `frontend/`, `api/`, and `datascience/`, define pipeline tasks (`build`, `test`, `lint`) with dependency ordering, add shared configuration (ESLint base config, Prettier config, TypeScript base config).

For this project, the monorepo tools would provide: (1) single `turbo run test` command to test all services, (2) caching of build/test outputs to skip unchanged packages, (3) dependency graph visualization, (4) coordinated version management.

However, the three directories use different languages (JavaScript, Python, Python+Jupyter), different package managers (npm/bun for frontend, pip for Python), and different build systems (Vite for frontend, none for API, none for datascience). There is no shared code between frontend and API — the API contract is defined implicitly by HTTP endpoints, not by shared type definitions or protobuf schemas. Turborepo and Nx are designed for JavaScript/TypeScript monorepos and have limited Python support.

The CI workflow already runs frontend and backend jobs in parallel as separate GitHub Actions jobs. Monorepo tooling would not provide meaningful speedup because the two services are already independently tested and deployed.

**Approach B: npm/pnpm/Bun workspaces (lightweight)**

Add a root-level package.json with `"workspaces": ["frontend"]` (only frontend is a JS project). This provides little value since there's only one JavaScript package. Workspaces are designed for multi-package JavaScript projects.

**Approach C: Keep current structure (separate directories)**

The current structure with independent directories, independent CI jobs, and independent deployment pipelines works for a multi-language project maintained by a solo developer. The frontend deploys to Vercel, the API deploys to Railway, and the datascience directory is for ad-hoc analysis. There is no shared dependency management, no shared build pipeline, and no coordination needed between deployments.

The primary scenario where monorepo tooling would add value is if the project introduced shared TypeScript types between frontend and a Node.js backend — but the backend is Python, so this scenario doesn't apply.

### 7. Additional DX Improvements

**Bundle analysis (vite-bundle-analyzer or rollup-plugin-visualizer)**

Adding `rollup-plugin-visualizer` to the Vite config generates an HTML treemap of the production bundle showing which dependencies contribute the most bytes. This is a diagnostic tool — install it, run `vite build`, open the visualization, identify any unexpectedly large dependencies, then optionally remove the plugin.

The project's manual chunk splitting in [frontend/vite.config.js](../../frontend/vite.config.js) already separates Firebase, Recharts/d3, and React/React Router into dedicated vendor chunks. A bundle analysis would reveal whether additional splitting is needed and whether there are unexpected dependencies being included. Firebase is typically the largest frontend dependency (the full firebase/auth package is ~200KB gzipped); react-simple-maps includes TopoJSON data that can be large. This is a one-time diagnostic taking 15 minutes.

**Accessibility linting (eslint-plugin-jsx-a11y)**

This ESLint plugin adds rules for common accessibility issues in JSX: missing alt attributes on images, missing labels on form inputs, invalid ARIA attributes, non-interactive elements with click handlers missing keyboard event handlers. Install as a dev dependency, add to the ESLint flat config, run ESLint to see violations, fix them.

For an Indian election analytics platform that may need to comply with WCAG guidelines, and specifically for the data tables, forms (prediction panel sliders, login modal OTP inputs), and interactive map, accessibility linting would catch issues that are hard to notice during manual testing. The prediction panel in [frontend/src/components/PredictionPanel.jsx](../../frontend/src/components/PredictionPanel.jsx) uses range sliders and buttons without visible ARIA labels. The [frontend/src/components/LoginModal.jsx](../../frontend/src/components/LoginModal.jsx) OTP input implementation uses individual input elements that may not be screen-reader friendly. Installation and initial lint run: 30 minutes. Fixing violations: 1-3 hours depending on count.

**Import sorting (eslint-plugin-simple-import-sort or @trivago/prettier-plugin-sort-imports)**

Automatically sorts and groups import statements: React/Node builtins first, then third-party libraries, then local modules, with blank lines between groups. This is a cosmetic improvement that eliminates manual import ordering decisions. If Prettier is adopted, the Prettier import sort plugin handles this automatically on save. If not, the ESLint plugin can auto-fix on lint.

**Path aliases (Vite resolve.alias + tsconfig.json paths)**

Configure Vite with `resolve.alias: { '@': '/src' }` so imports can use `import { api } from '@/api'` instead of `import { api } from '../api'` or `import { api } from '../../api'`. This eliminates fragile relative path calculation, especially for deeply nested components. Vite supports this natively; if TypeScript is adopted, the paths must also be configured in tsconfig.json.

For this project, the directory structure is flat — all components are at `src/components/`, contexts at `src/contexts/`, etc. Most imports are only one or two levels deep (`../api`, `../constants`). Path aliases would have minimal impact at this directory depth. The benefit increases if the project grows to have deeper nesting.

---

## Approach Compatibility Assessment

### Bun Standardization (Approach A)

Highly compatible with the existing codebase. The migration is 80% complete — only CI needs to be updated from npm to Bun. The change is mechanical: replace `actions/setup-node` with `oven-sh/setup-bun`, replace `npm ci --legacy-peer-deps` with `bun ci`, replace `npx vitest` with `bun run test`, replace `npx eslint` with `bun run lint`. The `--legacy-peer-deps` workaround is eliminated because Bun resolves peer dependencies differently (more permissively by default, similar to Yarn). Risk is low because the same package manager would be used in CI, Docker, and Vercel, eliminating the current environment mismatch.

### TypeScript Incremental Migration (Approach B for TypeScript)

Compatible with Vite 8, which transpiles .ts/.tsx files out of the box via Oxc Transformer. The existing @types/react and @types/react-dom packages provide React type definitions. The migration can proceed file-by-file with `allowJs: true` in tsconfig.json. The main compatibility concern is that all existing tests are .js files — they would work unchanged with `allowJs: true` but would not benefit from type checking until migrated. Vitest supports TypeScript natively.

The highest-value first migration targets would be: (1) create a `types.ts` file with API response interfaces, (2) migrate `api.js` to `api.ts` with return type annotations, (3) migrate `predictionEngine.js` to `predictionEngine.ts` with input/output types. These three files contain the most type-sensitive code and have the highest bug-prevention ROI.

### Testing Expansion (Approach A for Testing)

Fully compatible. All infrastructure is already in place. No new dependencies needed for unit testing the business logic modules. MSW would be the first new dependency only if integration testing of API calls is desired.

### Prettier Addition

Fully compatible. Adding Prettier to this codebase requires: `npm install -D prettier eslint-config-prettier`, create `.prettierrc`, update ESLint config to extend `eslint-config-prettier`. No conflicts with Vite, Vitest, or the build pipeline.

### CSS Modules Migration

Compatible with Vite (native CSS Modules support). The migration is purely mechanical but time-consuming (splitting one file into ~26 files, updating all className references). No build configuration changes needed.

### Monorepo Tooling

Poorly compatible with this project's multi-language structure. The Python directories (api/, datascience/) do not participate in JavaScript tooling. The single JavaScript package (frontend/) does not benefit from workspace features designed for multi-package repos.

---

## Edge Cases and Risks

**Bun lockfile divergence from npm**: If the project standardizes on Bun and later encounters a Bun-specific bug (e.g., a dependency resolution edge case, a native module compatibility issue), the fallback path is to revert to npm. This requires regenerating package-lock.json from the installed node_modules, which npm does automatically. The risk is low given Bun's maturity but should be acknowledged.

**TypeScript migration stalling**: If TypeScript is adopted incrementally with `allowJs: true`, there is a risk of the migration stalling at a partial state where some files are typed and others are not. The untyped files would not benefit from type checking, and the typed files' interfaces with untyped code would have `any` at the boundaries. A forcing function (e.g., "all new files must be .tsx" as a project rule) mitigates this.

**API response shape changes**: The most likely category of type-related bugs in this codebase is API response shape mismatches. The Python backend has no shared type contract with the frontend. If a backend developer adds, removes, or renames a field, the frontend will discover this at runtime (undefined rendering, NaN calculations, or unhandled errors). TypeScript with defined API response interfaces would catch this at compile time only if the interfaces are manually kept in sync — there is no automated mechanism. A more robust solution would be a shared API schema (OpenAPI/Swagger generated types), but this requires backend changes that are out of scope for this evaluation.

**CSS split creating import ordering issues**: If the single CSS file is split into component-level files, the import order determines the cascade precedence. Currently, all styles are in one file with a predictable top-to-bottom cascade. Splitting into separate files imported in components could change cascade behavior if two components import CSS with conflicting selectors. CSS Modules eliminate this risk by scoping class names; plain CSS splits would need careful attention to specificity.

**Test infrastructure for auth-dependent components**: Several components (MyBookmarks, CommunityFeed, PredictionPanel, ApiKeyManager) require authentication to render. Testing these components requires mocking the AuthContext provider, which adds test setup complexity. The LoginModal component depends on Firebase Auth SDK (RecaptchaVerifier, signInWithPhoneNumber) which would need to be mocked at the module level.

**Vitest + Bun interaction**: If using `bun run test` (which is what the Dockerfile scripts would do), Bun executes the test script but Vitest itself runs in Node.js via the vite test server. This is the expected behavior and works correctly. However, if someone tries to run tests with `bun test` (Bun's native test runner), it would not work because the tests import from Vitest, not Bun's test API. This is a documentation/conventions issue, not a technical blocker.

---

## Security Findings

**Token storage in localStorage**: The [frontend/src/api.js](../../frontend/src/api.js) module stores the auth token in localStorage (`localStorage.setItem('auth_token', token)`). This is a common pattern but vulnerable to XSS attacks — if an attacker can execute JavaScript on the page (via a cross-site scripting vulnerability), they can read the token from localStorage. The alternative (httpOnly cookies) is partially implemented — the API uses `credentials: 'include'` for cookie-based sessions and has CSRF token handling (`_csrfHeaders()`). The dual auth mechanism (Bearer token + session cookie) suggests a migration path from token-based to cookie-based auth is in progress or was considered.

**CSRF protection**: The API client implements CSRF token extraction from cookies and includes it in mutation requests (POST, PUT, DELETE) via the `X-CSRF-Token` header. This is correctly implemented for cookie-based auth. For Bearer token auth, CSRF protection is not strictly necessary (Bearer tokens in Authorization headers are not automatically sent by the browser, unlike cookies), but the defense-in-depth approach is sound.

**Input validation**: The prediction panel input fields ([frontend/src/components/PredictionPanel.jsx](../../frontend/src/components/PredictionPanel.jsx)) use HTML input validation attributes (`type="range"`, `min`, `max`, `step`, `maxLength={30}` for party name). However, the prediction engine itself does not validate input ranges — it would accept negative percentages or >100% values if the UI constraints were bypassed. Since these calculations are client-side only (not sent to the backend as raw values), this is a data quality issue rather than a security vulnerability.

**Firebase configuration exposure**: The [frontend/src/firebase.js](../../frontend/src/firebase.js) file reads Firebase config from environment variables (`import.meta.env.VITE_FIREBASE_*`). These values are embedded in the production bundle (Vite inlines `import.meta.env.VITE_*` at build time), which is expected and acceptable — Firebase API keys are designed to be public (access is controlled by Firebase Security Rules, not by key secrecy).

**Dependency supply chain**: The project has 18 direct dependencies. Adding TypeScript, Prettier, ESLint plugins, and Husky would increase this to approximately 24-28. Each dependency is a potential supply chain attack vector. Bun's `minimumReleaseAge` feature (filtering out packages published within a configurable time window) provides a supply chain protection mechanism that npm does not offer natively.

---

## Performance Findings

**Bundle size**: The project's manual chunk splitting in vite.config.js separates Firebase, Recharts+d3, and React core into dedicated vendor chunks. Firebase is likely the single largest dependency by bundle size (firebase/auth alone is approximately 150-200KB gzipped). Recharts and its d3 sub-dependencies are the second largest. React 19 + React DOM is approximately 40KB gzipped. The actual bundle sizes are not measured in CI — there is no bundle size tracking or regression detection.

**Lazy loading**: App.jsx uses React.lazy() for 12 route components and eagerly loads 4 utility components (LoginModal, UserMenu, SaveBookmarkModal, ElectionTypeToggle, Disclaimer, ErrorBoundary). This is appropriate — eagerly loaded components are small and needed on nearly every page, while lazily loaded components (StateOverview, ConstituencyList, NationalDashboard, etc.) are larger and route-specific.

**Client-side computation**: The prediction engine runs synchronously on the main thread. For a state with many constituencies (e.g., Uttar Pradesh with 403 constituencies), `generateBaseline` iterates over all constituencies and performs arithmetic operations for each party in each constituency. The computation is O(constituencies × parties_per_constituency) which for worst case is approximately 403 × 10 = 4,030 iterations — negligible for modern JavaScript engines. The useMemo caching in App.jsx ensures this computation only re-runs when prediction parameters change.

**API request deduplication**: The `_cachedGet` function in api.js correctly deduplicates concurrent requests to the same endpoint. If two components request the same data simultaneously (e.g., during initial load), only one fetch is executed. This prevents redundant network requests. The 5-minute TTL cache means the same data is not re-fetched within 5 minutes of the first request.

**Re-render optimization**: The prediction computation in App.jsx uses three layered useMemo hooks: (1) baseline computed from predData + core params, (2) predictions computed from baseline + new party params, (3) summary computed from predictions. This memoization structure means changing a new-party slider only re-runs steps 2 and 3, not step 1. This is a well-designed optimization for the most computationally intensive part of the UI.

**No performance bottlenecks identified**: The current codebase shows no evidence of performance issues — no unnecessary re-renders, no synchronous blocking operations, no large list rendering without virtualization (the largest tables are constituency lists which are typically under 500 rows). The Recharts rendering performance for 8 parties × 20 years of data is well within acceptable bounds.

---

*Report saved to: `/Users/cnickson/projects/personal/elec/_architect/research/2026-04-28-frontend-tooling-research.md`*
