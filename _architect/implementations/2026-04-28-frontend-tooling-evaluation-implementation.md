# Implementation Report: Frontend Tooling and Developer Experience Optimization

**Date:** 2026-04-28
**Source Plan:** `_architect/analysis/2026-04-28-frontend-tooling-evaluation.md`
**Approach:** Pragmatic Foundation (Approach 2)
**Estimated Effort:** 25–37 developer-hours across 6 phases

---

## 1. Implementation Overview

This report provides granular implementation guidance for optimizing the frontend tooling of the Indian election analytics platform. The work addresses four high-ROI improvements identified in the strategic plan: standardizing on Bun as the sole package manager, adding Prettier with pre-commit hooks, adopting TypeScript incrementally across the highest-value modules, and expanding test coverage for business logic and data flow. A sixth documentation phase records deferred decisions with explicit trigger criteria.

The frontend is a React 19 single-page application built with Vite 8, located entirely within the `frontend/` directory. It comprises twenty-four JSX components in `src/components/`, two widgets in `src/widgets/`, two context providers in `src/contexts/`, a prediction engine in `src/engine/`, a fetch-based API client at `src/api.js`, a constants module at `src/constants.js`, a debounce hook in `src/hooks/`, a Firebase configuration at `src/firebase.js`, and the root component at `src/App.jsx` with entry point `src/main.jsx`. Styling is a single `src/index.css` file. There is one test file at `src/engine/__tests__/predictionEngine.test.js` containing twenty-seven test cases.

The CI pipeline is defined in `.github/workflows/ci.yml` and currently uses Node.js 20 with `npm ci --legacy-peer-deps` for the frontend job, while the Dockerfile at `frontend/Dockerfile` uses `oven/bun:1-alpine`, the Vercel configuration at `frontend/vercel.json` specifies `bun run build`, and the GCP Cloud Build configuration at `infra/cloudbuild/frontend-deploy.yaml` uses `oven/bun:1-alpine`. This dual-lockfile situation is the first problem resolved.

The six phases are: Bun standardization (Phase 1), Prettier and formatting infrastructure (Phase 2), TypeScript Wave 1 covering API types and client (Phase 3), TypeScript Wave 2 covering the prediction engine and expanded testing (Phase 4), TypeScript Wave 3 covering context providers and high-complexity components (Phase 5), and deferred items documentation (Phase 6).

---

## 2. Technology Stack Summary

The frontend uses **React 19.2.4** with **react-dom 19.2.4** and **react-router-dom 7.14.1** for routing. The build tool is **Vite 8.0.4** with `@vitejs/plugin-react 6.0.1`, configured in `frontend/vite.config.js`. Vite 8 uses the Oxc Transformer for JSX and TypeScript transpilation, meaning `.ts` and `.tsx` files are supported out of the box with zero additional Vite configuration. The build target is ES2020 with manual chunk splitting for Firebase, Recharts, and React vendor bundles.

The test framework is **Vitest 3.0.0** with `@vitest/coverage-v8` for coverage, `jsdom 25.0.0` as the test environment, `@testing-library/react 16.0.0` and `@testing-library/jest-dom 6.0.0` for component testing. The test configuration is embedded in `vite.config.js` under the `test` key with `environment: 'jsdom'` and `globals: true`. Tests are run via the `test` script (`vitest`) and `test:coverage` script (`vitest run --coverage`).

The linter is **ESLint 9.39.4** using the flat config format in `frontend/eslint.config.js`. It uses `@eslint/js` recommended rules, `eslint-plugin-react-hooks` flat recommended config, and `eslint-plugin-react-refresh` Vite config. The file glob pattern is `**/*.{js,jsx}` — this must be extended to include `.ts` and `.tsx` during Phase 3. The single custom rule is `no-unused-vars` with `varsIgnorePattern: '^[A-Z_]'`.

The package manager situation is split: **Bun** is used in the Dockerfile (`oven/bun:1-alpine`), Vercel (`"buildCommand": "bun run build"`), and GCP Cloud Build (`oven/bun:1-alpine`). **npm** is used in CI (`npm ci --legacy-peer-deps` with `actions/setup-node@v4` and Node.js 20). The project has both `bun.lock` and `package-lock.json`.

TypeScript type declarations are already partially present as dev dependencies: `@types/react 19.2.14` and `@types/react-dom 19.2.3` are listed in `package.json`, indicating the IDE may already provide React type hints even without a `tsconfig.json`. No `tsconfig.json` exists yet.

The backend is a **Python FastAPI** application with **Pydantic** models defined in `api/models.py`. The backend defines twenty-seven Pydantic BaseModel classes including `Election` (48 fields), `StateInfo`, `StatsSummary`, `PaginatedElections`, `ConstituencyResult`, `PartySwing`, `ConstituencySwing`, `StateSwingSummary`, `ConstituencySwingRow`, `CandidateResult`, `ConstituencyPredictionData`, `PredictionDataResponse`, `NationalPartyStrength`, `NationalStateSummary`, `NationalTurnoutTrend`, `UpcomingElection`, `PartyMapEntry`, `SubscriptionOut`, `ApiKeyOut`, `ApiKeyCreated`, and `UsageSummaryOut`. Additional request/response models are defined inline in route files: `AuthResponse` and `UserProfile` in `api/auth_routes.py`, `CreateBookmarkRequest`, `UpdateBookmarkRequest`, and `VoteRequest` in `api/bookmark_routes.py`.

The frontend API client at `src/api.js` exports a single `api` object with approximately thirty methods covering states, election data, predictions, auth, bookmarks, national dashboard, subscriptions, API keys, CSV export, and DPDP compliance endpoints. It implements an in-memory cache (`Map` with 5-minute TTL), request deduplication for in-flight requests, Bearer token authorization, and CSRF token extraction from cookies.

The prediction engine at `src/engine/predictionEngine.js` exports three functions: `generateBaseline`, `applyNewParty`, and `aggregateResults`. These are consumed in `src/App.jsx` through `useMemo` chains that compute `baseline`, `predictions`, and `summary` from prediction data.

---

## 3. Phase-by-Phase Implementation

---

### Phase 1: Package Manager Standardization

**Purpose:** Eliminate the dual-lockfile mismatch between CI (npm) and all other environments (Bun) so that the dependency tree validated in CI is identical to what ships in Docker, Vercel, and GCP Cloud Build.

**Delivers:** A single package manager (Bun) used consistently across local development, CI, Docker, Vercel, and GCP Cloud Build, with version pinning to prevent cross-environment divergence.

**Dependencies:** None. This phase is fully independent.

**Prerequisites:** Access to the GitHub repository to modify the CI workflow. A working Bun installation locally to verify `bun.lock` is up to date.

---

#### Step 1.1: Update the CI workflow to use Bun

The file to modify is `.github/workflows/ci.yml`. The `frontend` job currently has four steps after `actions/checkout@v4`: it uses `actions/setup-node@v4` with `node-version: 20` and `cache: npm` pointing to `frontend/package-lock.json`, then runs `npm ci --legacy-peer-deps`, then `npx vitest run --coverage`, then `npx eslint src/`.

Replace the `actions/setup-node@v4` step with `oven-sh/setup-bun@v2`. The `bun-version` parameter must be pinned to a specific minor version — use `1.2.x` (or whatever minor version the local development environment is currently running; verify by running `bun --version` locally). This version pinning is critical: without it, CI might use a different Bun version than Docker and Vercel, reintroducing a variant of the dependency resolution divergence.

Replace `npm ci --legacy-peer-deps` with `bun install --frozen-lockfile`. The `--frozen-lockfile` flag is Bun's equivalent of `npm ci` — it fails if the lockfile is out of date rather than silently updating it.

Replace `npx vitest run --coverage` with `bun run test:coverage`. This uses the `test:coverage` script already defined in `package.json` as `vitest run --coverage`.

Replace `npx eslint src/` with `bun run lint`. This uses the `lint` script already defined in `package.json` as `eslint .` (which lints the entire project directory, including `src/`).

Remove the `cache: npm` and `cache-dependency-path: frontend/package-lock.json` parameters. Bun has its own caching mechanism; `oven-sh/setup-bun@v2` handles cache configuration automatically.

After this step, the CI frontend job should have these steps: checkout, setup-bun (with pinned version), `bun install --frozen-lockfile`, `bun run test:coverage`, `bun run lint`. Later phases will add `bun run format:check` and `tsc --noEmit` steps between lint and the end of the job.

**Verification:** Push a branch with only this CI change and verify the GitHub Actions workflow passes. Confirm that the Vitest test output shows all twenty-seven existing tests passing. Confirm that ESLint produces no errors.

---

#### Step 1.2: Pin the Bun version in the Dockerfile

The file to modify is `frontend/Dockerfile`. Both the `dev` and `build` stages currently use `FROM oven/bun:1-alpine`, which resolves to the latest Bun 1.x release. Change both lines to pin to the same minor version used in CI — for example, `FROM oven/bun:1.2-alpine`. The `prod` stage uses `FROM nginx:alpine` and does not need changes.

Verify that the pinned version tag exists on Docker Hub by checking the `oven/bun` image tags. If the exact minor version tag is not available, use the closest available tag that matches what CI uses.

**Verification:** Run `docker build --target build -f frontend/Dockerfile frontend/` locally and confirm the build completes successfully. The output should show Bun resolving dependencies from `bun.lock` and Vite producing the production bundle in `dist/`.

---

#### Step 1.3: Verify Vercel Bun version alignment

The file `frontend/vercel.json` specifies `"buildCommand": "bun run build"` but does not pin a Bun version — Vercel selects the Bun version based on its runtime environment. Check Vercel's documentation or the Vercel dashboard for the project to determine which Bun version is used. If Vercel provides a mechanism to pin the Bun version (typically via a `VERCEL_BUN_VERSION` environment variable or a `.bun-version` file), configure it to match the version used in CI and Docker.

If Vercel does not support version pinning, document this as a known divergence risk in the project README and note that Vercel's Bun version should be checked periodically.

**Verification:** Trigger a Vercel preview deployment from the branch and confirm the build log shows the expected Bun version. Confirm the deployed preview site loads correctly and API calls succeed.

---

#### Step 1.4: Verify GCP Cloud Build alignment

The file `infra/cloudbuild/frontend-deploy.yaml` uses `oven/bun:1-alpine` in its build steps. Update this to the same pinned minor version as the Dockerfile and CI — for example, `oven/bun:1.2-alpine`.

**Verification:** If GCP Cloud Build is actively configured, trigger a build and confirm it passes. If not actively used (the project appears to primarily deploy via Vercel and Railway), document the version pin change and move on.

---

#### Step 1.5: Remove the npm lockfile

Delete `frontend/package-lock.json` from the repository. With all environments now using Bun, this file serves no purpose and its presence could confuse developers or tools into thinking npm is supported.

Do not delete `package.json` — Bun uses it as its package manifest, just as npm does.

**What to watch out for:** Ensure that `bun.lock` is committed to the repository and is up to date. Run `bun install` locally and verify that `bun.lock` does not change (if it does, the lockfile was stale and the updated version should be committed as part of this step).

**Verification:** After deleting `package-lock.json`, run `bun install --frozen-lockfile` locally to confirm Bun can resolve all dependencies from `bun.lock` alone. Push the change and verify CI passes.

---

#### Step 1.6: Update developer documentation

In `frontend/README.md`, replace any references to `npm install`, `npm run dev`, `npm run build`, or `npx` commands with their Bun equivalents: `bun install`, `bun run dev`, `bun run build`, `bun run test`, `bun run lint`. Add a note at the top of the README stating that this project uses Bun as its package manager and npm is not supported.

If the root `README.md` contains frontend setup instructions, update those as well.

**Verification:** Follow the README instructions from scratch on a clean checkout and confirm the development server starts successfully.

---

#### Phase 1 Deliverables

After Phase 1, the following is true: all four deployment paths (CI, Docker, Vercel, GCP Cloud Build) use Bun with a pinned minor version; `package-lock.json` no longer exists; the `--legacy-peer-deps` flag is eliminated; developer documentation references Bun exclusively. The CI workflow file has been simplified and the frontend job runs approximately two to three times faster (Bun's install is faster than npm's, and `bun run` avoids npx overhead).

#### Phase 1 Risks and Mitigations

The primary risk is that Bun's dependency resolution produces a different `node_modules` tree than npm's, which could cause subtle runtime differences. This risk is mitigated by the fact that three of four deployment paths already use Bun, so any Bun-specific resolution behavior is already present in production — it is CI that was the outlier. The `--legacy-peer-deps` flag in the old CI configuration explicitly acknowledged that npm's resolution differed from what Bun produces, so removing npm eliminates a known inconsistency rather than introducing a new one.

---

### Phase 2: Prettier and Formatting Infrastructure

**Purpose:** Establish automated code formatting so that all code — whether written manually, generated by AI, or pasted from documentation — conforms to a consistent style without manual effort.

**Delivers:** A Prettier configuration, a one-time codebase reformat with preserved git blame, a CI format check, and pre-commit hooks via Husky and lint-staged.

**Dependencies:** None, but should be completed before Phase 3 so that TypeScript files are auto-formatted from the start.

**Prerequisites:** Phase 1 is not a hard dependency, but completing it first means the Prettier installation uses `bun add` rather than `npm install`.

---

#### Step 2.1: Install Prettier

Run `bun add -d prettier` in the `frontend/` directory. This adds Prettier as a dev dependency in `package.json` and updates `bun.lock`.

**Verification:** Run `bunx prettier --version` and confirm it outputs a version number (the latest stable, currently 3.x).

---

#### Step 2.2: Create the Prettier configuration file

Create a new file at `frontend/.prettierrc` (JSON format). The configuration should match the existing code style observed across the codebase — specifically:

- `singleQuote`: `true` — the entire codebase uses single quotes for strings (observed in `api.js`, `App.jsx`, `constants.js`, all context files, and all component files).
- `semi`: `true` — semicolons are used consistently at the end of statements.
- `trailingComma`: `"es5"` — trailing commas are used in arrays and object literals but not in function parameters (ES5-compatible trailing comma style, observed in `vite.config.js` and component files).
- `tabWidth`: `2` — two-space indentation is used throughout.
- `printWidth`: `100` — lines in the existing code occasionally exceed 80 characters but rarely exceed 100.
- `bracketSpacing`: `true` — spaces inside object braces are used consistently (e.g., `{ children }`, `{ user, loading }`).
- `jsxSingleQuote`: `false` — JSX attributes use double quotes (standard React convention, observed in components).
- `arrowParens`: `"always"` — arrow function parameters are consistently wrapped in parentheses.

---

#### Step 2.3: Create the Prettier ignore file

Create a new file at `frontend/.prettierignore` with the following entries: `dist`, `node_modules`, `coverage`, `bun.lock`, and `*.min.js`. This prevents Prettier from attempting to format build output, dependencies, coverage reports, the lockfile, and minified vendor files.

---

#### Step 2.4: Add Prettier scripts to package.json

Add two new scripts to `frontend/package.json` in the `scripts` section:

- `"format"`: `"prettier --write src/"` — formats all source files in place.
- `"format:check"`: `"prettier --check src/"` — checks formatting without modifying files (used in CI).

These scripts target `src/` specifically rather than `.` to avoid formatting configuration files, which have their own formatting conventions.

**Verification:** Run `bun run format:check` and observe that it reports files that would be reformatted (since no formatting has been applied yet).

---

#### Step 2.5: Perform the one-time reformat

Run `bun run format` to reformat the entire `src/` directory. Review the changes to ensure they are whitespace-only — no behavioral modifications should occur. Pay particular attention to template literals, regex patterns, and JSX expressions where Prettier's reformatting might change line breaks in ways that affect readability.

Commit this reformat as a single commit with the message `chore: format codebase with prettier`. This commit should contain only Prettier-induced whitespace changes and nothing else.

**What to watch out for:** The `constants.js` file contains a large `PARTY_COLORS` object with many entries — Prettier may reformat this significantly. Review the result to ensure the formatting is acceptable. The `predictionEngine.js` file contains complex arithmetic expressions — verify that Prettier's line-breaking choices maintain readability of the mathematical formulas.

---

#### Step 2.6: Create the git-blame-ignore-revs file

After committing the reformat, create a new file at `frontend/.git-blame-ignore-revs` (or at the repository root as `.git-blame-ignore-revs` if the team prefers a repo-wide file). Add the full commit hash of the formatting commit from Step 2.5, preceded by a comment line explaining its purpose (lines beginning with `#` are comments in this file format).

Configure the local repository to use this file by running `git config blame.ignoreRevsFile .git-blame-ignore-revs` (or the path relative to the repo root). This ensures that `git blame` output skips the formatting commit and shows the original author of each line.

If the project is hosted on GitHub, GitHub automatically detects `.git-blame-ignore-revs` at the repository root and applies it to blame views on the web interface. For this reason, placing the file at the repository root (`/Users/cnickson/projects/personal/elec/.git-blame-ignore-revs`) is preferable to placing it inside `frontend/`.

**Verification:** Run `git blame frontend/src/api.js` and confirm that the formatting commit does not appear in the output — lines should show their original commit authors.

---

#### Step 2.7: Add format check to CI

Modify `.github/workflows/ci.yml` to add a new step in the frontend job after the lint step: `bun run format:check`. This step runs `prettier --check src/` and fails the CI pipeline if any file does not match Prettier's expected formatting. This prevents unformatted code from being merged.

The step should be added after lint because formatting errors are less critical than lint errors — if both fail, the developer should fix lint errors first.

**Verification:** Push a branch where one file has been intentionally modified with incorrect formatting (e.g., change single quotes to double quotes in one line). Confirm that CI fails on the format:check step with a clear error message indicating which file is not formatted.

---

#### Step 2.8: Install Husky and lint-staged

Run `bun add -d husky lint-staged` in the `frontend/` directory. Initialize Husky by running `bunx husky init` — this creates a `.husky/` directory inside `frontend/` with a sample `pre-commit` hook.

**What to watch out for:** Husky's `init` command creates a `pre-commit` file at `frontend/.husky/pre-commit` with a default script. The `.husky/` directory must be committed to the repository so that other developers (or CI) get the hooks when they clone.

---

#### Step 2.9: Configure lint-staged

Add a `lint-staged` configuration to `frontend/package.json` (as a top-level `"lint-staged"` key, not inside `scripts`). The configuration should specify:

- For files matching `"*.{js,jsx,ts,tsx}"`: run both `prettier --write` and `eslint --fix` (in that order). Prettier handles formatting, then ESLint catches any remaining lint issues.
- For files matching `"*.{css,json,md}"`: run `prettier --write` only.

This ensures that every commit automatically formats and lints staged files before the commit is created.

---

#### Step 2.10: Configure the Husky pre-commit hook

Replace the default content of `frontend/.husky/pre-commit` with a command that invokes lint-staged: `cd frontend && bunx lint-staged`. The `cd frontend` is necessary because git hooks run from the repository root, but `lint-staged` needs to find the `lint-staged` configuration in `package.json` within the `frontend/` directory.

Alternatively, if the `.husky/` directory is placed at the repository root, the pre-commit hook should `cd frontend && bunx lint-staged`.

**What to watch out for:** Husky hooks require execute permissions. After creating the hook file, run `chmod +x frontend/.husky/pre-commit` (or wherever the hook is located). On macOS and Linux, git will refuse to execute hooks without the execute bit set.

**Verification:** Stage a file with intentionally bad formatting (e.g., use double quotes instead of single quotes). Run `git commit` and verify that lint-staged automatically reformats the file before the commit is created. The committed file should have single quotes.

---

#### Phase 2 Deliverables

After Phase 2: a `.prettierrc` configuration file exists with project-specific formatting rules; the entire `src/` directory is consistently formatted; CI rejects unformatted code; every commit is automatically formatted via pre-commit hooks; the formatting commit does not pollute `git blame` output.

#### Phase 2 Risks and Mitigations

The risk is minimal. Prettier reformatting is a whitespace-only change that does not affect runtime behavior. The `.git-blame-ignore-revs` file preserves `git blame` usefulness. The only subtle risk is that Prettier may change line breaks in template literals or JSX expressions in ways that affect readability — this is caught during the review of the formatting commit in Step 2.5 and can be addressed with `// prettier-ignore` comments for specific code blocks if needed.

---

### Phase 3: TypeScript Adoption — Wave 1: API Types and Client

**Purpose:** Introduce TypeScript to the codebase starting with the highest-value target: the API client and its response types. This catches data shape mismatches between the Python backend and the frontend at compile time rather than at runtime.

**Delivers:** A `tsconfig.json` with graduated strict checks, TypeScript interfaces for all API response shapes, a typed API client, a `tsc --noEmit` CI step, ESLint TypeScript support, and a CI validation script for backend type synchronization.

**Dependencies:** Phase 2 should ideally be complete so that TypeScript files are auto-formatted by Prettier from the start. Phase 1 should be complete so that CI uses Bun.

**Prerequisites:** The developer should have a basic understanding of TypeScript syntax. The `@types/react` and `@types/react-dom` packages are already installed as dev dependencies.

---

#### Step 3.1: Create tsconfig.json

Create a new file at `frontend/tsconfig.json`. This is the TypeScript compiler configuration that controls type checking behavior. The key design decision is to start with `strict: false` and enable individual strict sub-flags incrementally, rather than enabling `strict: true` immediately — which would produce a high volume of type errors across all existing JavaScript files (since `allowJs` is `true`, `tsc` will check `.js` files too).

The configuration should include these settings:

- `compilerOptions.target`: `"ES2020"` — matching the Vite build target already configured in `vite.config.js`.
- `compilerOptions.module`: `"ESNext"` — matching the ESM module format used by Vite.
- `compilerOptions.moduleResolution`: `"bundler"` — the recommended resolution strategy for Vite-based projects, which understands `package.json` `exports` fields and does not require file extensions in imports.
- `compilerOptions.jsx`: `"react-jsx"` — enables the automatic JSX runtime introduced in React 17, which does not require importing React in every file.
- `compilerOptions.strict`: `false` — disabled initially to avoid overwhelming type errors.
- `compilerOptions.strictNullChecks`: `true` — this is the single highest-value strict check, catching `null` and `undefined` access bugs. It is enabled from day one because the prediction engine's most dangerous failure mode is accessing properties on potentially-null objects, producing `NaN` that silently propagates through calculations.
- `compilerOptions.allowJs`: `true` — allows `.js` and `.jsx` files to coexist with `.ts` and `.tsx` files during the incremental migration.
- `compilerOptions.checkJs`: `false` — do not type-check existing JavaScript files, only new TypeScript files. This prevents the initial `tsc --noEmit` run from producing hundreds of errors in unconverted files.
- `compilerOptions.skipLibCheck`: `true` — skip type checking of `.d.ts` declaration files in `node_modules`, which speeds up compilation and avoids false positives from third-party type declarations.
- `compilerOptions.esModuleInterop`: `true` — enables default import compatibility for CommonJS modules.
- `compilerOptions.forceConsistentCasingInFileNames`: `true` — prevents cross-platform bugs from case-insensitive file systems (macOS) vs. case-sensitive file systems (Linux CI/Docker).
- `compilerOptions.resolveJsonModule`: `true` — allows importing `.json` files with type inference.
- `compilerOptions.isolatedModules`: `true` — required by Vite since it processes files individually via Oxc Transformer.
- `compilerOptions.noEmit`: `true` — TypeScript is used only for type checking, not compilation. Vite handles compilation.
- `include`: `["src"]` — type-check only the source directory.
- `exclude`: `["node_modules", "dist"]` — standard exclusions.

**What to watch out for:** Do not set `compilerOptions.paths` or `compilerOptions.baseUrl` at this stage — no path aliases are used in the current codebase. Adding them would require corresponding Vite `resolve.alias` configuration, which is unnecessary complexity at this point.

**Verification:** Run `bunx tsc --noEmit` from the `frontend/` directory. With `checkJs: false` and no `.ts` files yet, the command should complete with zero errors. If it reports errors, they are likely from `@types/react` version mismatches — resolve by verifying that `@types/react` version matches the installed React version.

---

#### Step 3.2: Install TypeScript and ESLint TypeScript packages

Run `bun add -d typescript @typescript-eslint/eslint-plugin @typescript-eslint/parser` in the `frontend/` directory. TypeScript itself must be a dev dependency for the `tsc` command to be available. The ESLint TypeScript plugin and parser are needed for linting `.ts` and `.tsx` files.

Note that `typescript` may already be implicitly available through other dependencies, but it should be an explicit dev dependency to ensure `bunx tsc` works reliably.

**Verification:** Run `bunx tsc --version` and confirm it outputs a TypeScript version (5.x or later).

---

#### Step 3.3: Update ESLint configuration for TypeScript

Modify `frontend/eslint.config.js` to lint TypeScript files alongside JavaScript files. The current configuration has a single config object with `files: ['**/*.{js,jsx}']`. This must be extended.

Add a new config object to the exported array specifically for TypeScript files with `files: ['**/*.{ts,tsx}']`. This TypeScript-specific config object should use `@typescript-eslint/parser` as the parser and include `@typescript-eslint/eslint-plugin` recommended rules. It should also include the React Hooks and React Refresh plugins, just as the JavaScript config does.

Alternatively, the existing config object's `files` pattern can be changed to `['**/*.{js,jsx,ts,tsx}']` with `@typescript-eslint/parser` set as the parser for all files (it can parse JavaScript too). However, this approach requires more careful configuration to avoid parser conflicts, so a separate config block for TypeScript files is safer for a developer new to TypeScript.

The `no-unused-vars` rule should be replaced with `@typescript-eslint/no-unused-vars` in the TypeScript config block, as the base ESLint `no-unused-vars` rule does not understand TypeScript type-only imports and will produce false positives on `import type { ... }` statements.

**What to watch out for:** ESLint 9's flat config format (used in this project) handles plugin registration differently from the legacy `.eslintrc` format. With flat config, `@typescript-eslint/eslint-plugin` is imported as a module and its `configs.recommended` is spread into the config object. Do not use the `.eslintrc`-style `extends` syntax. Consult the `typescript-eslint` documentation for flat config examples specific to ESLint 9.

**Verification:** Create a temporary `.ts` file with an intentional lint error (e.g., an unused variable), run `bun run lint`, and confirm ESLint reports the error. Delete the temporary file.

---

#### Step 3.4: Add tsc --noEmit as a CI step

Modify `.github/workflows/ci.yml` to add a new step in the frontend job: `bunx tsc --noEmit`. This step should run after the test and lint steps. It is a non-negotiable requirement because Vite intentionally does not type-check — it only transpiles. Without this CI step, TypeScript errors could be introduced and merged because the Vite build succeeds regardless of type errors.

On the current thirty-two-file codebase, `tsc --noEmit` completes in under five seconds and will not meaningfully increase CI time.

**Verification:** The step should pass with zero errors after Step 3.1 creates the `tsconfig.json` and before any `.ts` files exist (there is nothing to check yet).

---

#### Step 3.5: Create the shared types file — proof-of-value milestone

Create a new file at `frontend/src/types.ts`. Before defining all thirty-plus interfaces, start with a proof-of-value milestone: define only the types needed for `api.states()` and `api.stateSwing()` — two frequently-used methods with well-defined response shapes. This early milestone validates the TypeScript workflow before committing to the full migration.

For `api.states()`, the response is an array of objects matching the `StateInfo` Pydantic model in `api/models.py` (lines 81–92). Define a `StateInfo` interface with fields: `state_name` (string), `display_name` (string), `election_types` (string array), `ae_year_min` (number or null), `ae_year_max` (number or null), `ge_year_min` (number or null), `ge_year_max` (number or null), `ae_constituencies` (number), `ge_constituencies` (number), `latest_ae_general_year` (number or null), `next_election_est` (number or null).

For `api.stateSwing()`, the response shape depends on the route handler in `api/routes.py`. Examine the route handler to determine the exact response structure — it likely returns an array of objects matching or derived from `StateSwingSummary` (defined in `api/models.py` lines 154–161): `year` (number), `party` (string or null), `seats_won` (number), `total_seats` (number), `avg_vote_share` (number or null), `avg_margin` (number or null), `swing_from_prev` (number or null).

After defining these two interfaces, proceed to Step 3.6a to type just these two API methods and verify the development workflow feels productive.

---

#### Step 3.6: Define all API response type interfaces

After the proof-of-value milestone validates the approach, expand `frontend/src/types.ts` to include interfaces for every API response shape. This requires reading both `api/models.py` and the route handler files to identify the exact response structures.

The following interfaces must be defined, organized by API domain:

**Election Data Types:** `Election` (matching the 48-field Pydantic model — all fields except `id` should be typed as their Python type or `null`; `id` is `number`), `PaginatedElections` (with `total`, `limit`, `offset` as numbers and `data` as `Election[]`), `StatsSummary` (matching the Pydantic model with `general_years` as `number[]`), `YearSummary`, `PartySummary`, `ConstituencySummary`, `DistrictSummary`.

**State and Swing Types:** `StateInfo` (already defined in Step 3.5), `ConstituencyResult`, `PartySwing`, `ConstituencySwing` (containing a `results` array of `ConstituencyResult`), `StateSwingSummary` (already defined in Step 3.5), `ConstituencySwingRow`.

**Prediction Types:** `CandidateResult` (with `party`, `votes`, `vote_share_percentage`, `position` — all nullable except that at least `party` should be `string | null`), `ConstituencyPredictionData` (the large prediction input shape with `candidates_latest` and `candidates_prev` as `CandidateResult[]`), `PredictionDataResponse` (with `total_electors_next`, `total_electors_latest`, `latest_year`, `prev_year`, `constituency_count` as numbers and `constituencies` as `ConstituencyPredictionData[]`).

**National Dashboard Types:** `NationalStateSummary`, `NationalPartyStrength`, `NationalTurnoutTrend`, `UpcomingElection`, `PartyMapEntry`.

**Auth Types:** `AuthResponse` (with `token` as `string` and `user` as a `User` interface), `User` (with fields `id` as number, `mobile` as string, `display_name` as string or null, `google_email` as string or null, `role` as string, `avatar_url` as string or null — derived from the SQL query in `auth_routes.py` line 119 which selects `id, mobile, display_name, google_email, role, avatar_url`), `UserProfile` (with `display_name` as string or null).

**Bookmark Types:** Define a `Bookmark` interface based on the response shape from the bookmark routes — this requires examining the `_bookmark_row` helper function in `api/bookmark_routes.py` to determine the exact fields returned. At minimum: `id` (number), `user_id` (number), `title` (string), `description` (string), `params` (a record or object type), `is_public` (boolean), `like_count` (number), `dislike_count` (number), `created_at` (string — ISO datetime), `updated_at` (string), `author_name` (string or null), `author_avatar` (string or null), `my_vote` (string or null — only present when user is authenticated).

**Subscription and API Key Types:** `SubscriptionOut`, `ApiKeyOut`, `ApiKeyCreated`, `UsageSummaryOut` — these map directly to the Pydantic models.

**What to watch out for:** Several API endpoints return computed/aggregated views that do not map directly to a single Pydantic model. For example, the national comparison endpoint likely returns a custom structure, and bookmark list endpoints include joined fields like `author_name`. For these, define the TypeScript interface based on what the route handler actually returns (inspect the SQL query and the row-to-dict mapping), not based on the Pydantic model alone.

Python's `datetime` type serializes to an ISO 8601 string via Pydantic's JSON serialization. In TypeScript, represent these as `string` rather than `Date` — the frontend can parse them with `new Date(isoString)` when needed.

Python's `None` maps to JSON `null`, which TypeScript represents as `null`. Fields that are `str | None` in Python should be `string | null` in TypeScript. Fields with Python defaults (e.g., `int = 0`) should be typed as the base type (e.g., `number`) since they will always have a value in the response.

**Verification:** Run `bunx tsc --noEmit` and confirm zero errors. The types file is self-contained at this stage and does not import anything from the rest of the codebase.

---

#### Step 3.7: Convert api.js to api.ts

Rename `frontend/src/api.js` to `frontend/src/api.ts`. This is a file rename, not a copy — the git history should show a rename rather than a delete-and-create.

Add TypeScript type annotations to the module:

The `_token` variable should be typed as `string | null`. The `setToken` function parameter should be typed as `string | null`. The `getToken` return type is `string | null`. The `_getCsrfToken` return type is `string | null`. The `authHeaders` function should return `Record<string, string>`. The `_csrfHeaders` function should return `Record<string, string>`.

The `_cache` Map should be typed as `Map<string, { data: unknown; ts: number; promise?: Promise<unknown> }>`. Note the `promise` field for in-flight request deduplication — the cache entry can hold either resolved data or a pending promise.

The generic `get` function should accept a type parameter and return `Promise<T>`. Its implementation casts the `res.json()` result to `T`. The same applies to `post`, `put`, and `del`.

The `_cachedGet` function should also accept a type parameter that flows through to the `get` call and cache retrieval. Its return type is `Promise<T>`.

Each method on the exported `api` object should have its return type annotated using the interfaces from `types.ts`. For example, `states` should return `Promise<StateInfo[]>`, `stats` should return `Promise<StatsSummary>`, `stateSwing` should return `Promise<StateSwingSummary[]>`, `predictionData` should return `Promise<PredictionDataResponse>`, `verifyOtp` should return `Promise<AuthResponse>`, `getMe` should return `Promise<User>`, and so on.

The `exportCsv` method is special — it returns a URL string, not a Promise. Its return type is `string`.

**How it connects:** Every component that imports from `api.js` will need its import path updated. However, because TypeScript module resolution without file extensions (which is how the imports are written: `import { api } from '../api'`) will resolve to `api.ts` automatically, most import paths should work without changes. Verify each import site — if any imports include the `.js` extension explicitly, those must be updated.

**What to watch out for:** The `_cache` typing is the trickiest part because the cache stores heterogeneous data — different API endpoints return different types, but the cache stores them all in the same Map. Using `unknown` for the data field is correct because it forces the consumer to narrow the type when retrieving from the cache. The type parameter on `_cachedGet<T>` handles this narrowing: each API method calls `_cachedGet<StateInfo[]>('/v1/states')`, and the returned Promise is correctly typed.

**Verification:** Run `bunx tsc --noEmit` and confirm zero errors. If there are errors, they likely indicate real type mismatches between what the API methods promise to return and how the code is structured — fix these, as they represent genuine type safety value.

---

#### Step 3.8: Update all import sites

Every file that imports from `'../api'` or `'./api'` needs to be checked. Since the import path does not include a file extension, TypeScript's module resolution under `moduleResolution: "bundler"` will find `api.ts` automatically. However, the `main.jsx` file imports with explicit extensions: `import App from './App.jsx'`, `import { AuthProvider } from './contexts/AuthContext.jsx'`, `import { StateProvider } from './contexts/StateContext.jsx'`. Since these reference `.jsx` files that have not been converted yet, they continue to work.

Check the following files for `api` imports: `src/App.jsx`, `src/contexts/AuthContext.jsx`, `src/contexts/StateContext.jsx`, `src/components/ApiKeyManager.jsx`, `src/components/CommunityFeed.jsx`, `src/components/ConstituencyDetail.jsx`, `src/components/ConstituencyList.jsx`, `src/components/ElectionTimeline.jsx`, `src/components/LoginModal.jsx`, `src/components/MyBookmarks.jsx`, `src/components/NationalDashboard.jsx`, `src/components/PricingPage.jsx`, `src/components/StateComparison.jsx`, `src/components/StateOverview.jsx`, `src/components/UserMenu.jsx`.

For each file, verify that the import resolves correctly after the rename. With `allowJs: true` in `tsconfig.json`, a `.jsx` file can import from a `.ts` file without issues.

**Verification:** Run `bun run dev` and navigate through the application, exercising the state selector, constituency list, prediction panel, national dashboard, and user menu. All API calls should work exactly as before. Run `bun run test:coverage` and confirm all twenty-seven tests still pass.

---

#### Step 3.9: Convert constants.js to constants.ts

Rename `frontend/src/constants.js` to `frontend/src/constants.ts`. Add type annotations to the exports:

- `PARTY_COLORS` should be typed as `Record<string, string>`.
- `normalizeParty` should accept `string | null | undefined` and return `string`.
- `partyColor` should accept `string | null | undefined` and return `string`.
- `majorityMark` should accept `number` and return `number`.
- `MAJOR_PARTIES` should be typed as `string[]`.
- `AFFINITY_PRESETS` should be typed with an interface describing its structure — each preset has a `label` (string) and `weights` (Record of string to number).
- `DEFAULT_PREDICTION_PARAMS` should be typed with an interface describing the prediction parameters shape — this interface will be reused in `App.tsx` later.
- `buildAffinityPresets` should accept `string[]` and return the affinity presets type.

The `_hashColor` private function should accept `string` and return `string`.

**What to watch out for:** The `MAJOR_PARTIES` array is initialized as empty and described as "populated dynamically from API data" via a comment. In TypeScript, this should be typed as `string[]` but remain an empty array — the comment implies it is populated elsewhere, but examining `App.jsx` shows that `topParties` is computed via `useMemo` in the component, not by mutating `MAJOR_PARTIES`. If `MAJOR_PARTIES` is truly never mutated, consider removing the export or marking it with a TODO comment.

**Verification:** Run `bunx tsc --noEmit` and confirm zero errors. Verify that all files importing from `constants` still resolve correctly.

---

#### Step 3.10: Create the CI type synchronization validation script

Create a new file at `api/scripts/validate_types.py` (or `infra/validate_types.py`). This Python script introspects the Pydantic model classes from `api/models.py` and compares their field names against the TypeScript interface definitions in `frontend/src/types.ts`.

The script should:

1. Import each Pydantic model class from `api/models.py`.
2. Use `ModelClass.model_fields` (Pydantic v2 API) to extract the field names and types for each model.
3. Parse `frontend/src/types.ts` to extract interface names and their field names. A simple regex-based parser is sufficient — look for lines matching `interface InterfaceName {` and extract field names from the lines between the opening and closing braces.
4. For each Pydantic model that has a corresponding TypeScript interface (matched by name), compare the field name sets.
5. Report any fields that exist in the Pydantic model but not in the TypeScript interface (indicating the TypeScript type is missing a field that the API sends), and any fields that exist in the TypeScript interface but not in the Pydantic model (indicating the TypeScript type expects a field the API does not send).
6. Exit with code 0 if all matched models are in sync, or code 1 if any divergence is found.

The script should handle the fact that some TypeScript interfaces do not correspond to a single Pydantic model — for example, the `Bookmark` interface includes joined fields like `author_name` that come from SQL joins, not from the Pydantic model. These interfaces should be listed in an explicit skip-list within the script.

Add a step to the CI backend job (or as a separate job) that runs this script: `python api/scripts/validate_types.py`. The step requires both the Python environment (already set up in the backend job) and access to the frontend source code (already checked out).

**What to watch out for:** The script must handle Pydantic v2's `model_fields` API, which returns a dictionary of `FieldInfo` objects. Do not use the deprecated Pydantic v1 `__fields__` attribute. The script should also handle models defined in route files (like `AuthResponse` in `auth_routes.py`) by importing from those files — but this requires the FastAPI application's dependencies to be installed, which they already are in the CI backend job.

**Verification:** Run the script locally: `cd api && python scripts/validate_types.py`. It should report that all models are in sync (assuming the TypeScript interfaces were defined correctly in Step 3.6). Intentionally rename a field in `types.ts` and run the script again — it should report the divergence and exit with code 1.

---

#### Phase 3 Deliverables

After Phase 3: `tsconfig.json` exists with `strictNullChecks: true` and `allowJs: true`; `tsc --noEmit` runs in CI and passes; ESLint lints TypeScript files; `src/types.ts` defines interfaces for all API response shapes; `src/api.ts` returns typed data from all thirty API methods; `src/constants.ts` has typed exports; a CI validation script catches field name drift between Python models and TypeScript interfaces. The development experience now includes IDE autocompletion for API response properties and compile-time errors when accessing properties that do not exist on the response type.

#### Phase 3 Risks and Mitigations

The primary risk is that the TypeScript interface definitions do not match the actual API responses because the response shapes were incorrectly transcribed from the Python models, or because some endpoints return computed fields not present in any Pydantic model. This is mitigated by: (a) the CI validation script that catches field name drift for model-based responses, and (b) the proof-of-value milestone (Step 3.5) that validates the approach on two simple endpoints before committing to the full migration.

The secondary risk is the learning curve: generics for the `_cachedGet<T>` function and utility types for the cache may be unfamiliar patterns. Expect the first few type annotations to take significantly longer than later ones. The proof-of-value milestone (two API methods) is explicitly designed to build confidence before the full migration.

The TypeScript migration leaves the codebase in a hybrid state where `api.ts`, `types.ts`, and `constants.ts` are TypeScript but all components remain `.jsx`. This is safe because `allowJs: true` and `checkJs: false` mean TypeScript does not attempt to type-check the JavaScript files — they continue to work exactly as before. The hybrid state is explicitly temporary; Phases 4 and 5 convert more files, and Step 5.5 prevents new `.jsx` files from being added.

---

### Phase 4: TypeScript Adoption — Wave 2: Prediction Engine and Test Expansion

**Purpose:** Convert the prediction engine to TypeScript (the module with the highest computational sensitivity) and significantly expand test coverage for business logic, the API client, and the full prediction chain.

**Delivers:** Typed prediction engine, expanded prediction engine tests with golden-value assertions, API client unit tests, and a full-chain integration test.

**Dependencies:** Phase 3 must be complete. The prediction engine tests import from `types.ts` (for typed constituency data) and the API client tests import from `api.ts`.

**Prerequisites:** The `types.ts` file must include the `CandidateResult`, `ConstituencyPredictionData`, and `PredictionDataResponse` interfaces.

---

#### Step 4.1: Define prediction-specific types

In `frontend/src/types.ts` (or in a new file `frontend/src/engine/types.ts` co-located with the prediction engine — either approach works, but co-location is cleaner for engine-specific types), define interfaces for the prediction engine's internal data structures. These are not API response types — they are the shapes produced and consumed by the three exported functions.

Define a `PredictionParty` interface for the party objects within prediction results: `party` (string), `originalParty` (string), `voteShare` (number), `votes` (number), `position` (number or null), `isNewParty` (boolean, optional — only present on new party entries added by `applyNewParty`).

Define a `PredictionResult` interface for the output of `generateBaseline` and `applyNewParty`: `constituency_name` (string), `constituency_no` (number), `constituency_type` (string or null), `district_name` (string or null), `sub_region` (string or null), `electors_next` (number), `valid_votes_next` (number), `winner_party_latest` (string), `margin_percentage_latest` (number or null), `predicted_winner` (string or null), `predicted_winner_votes` (number), `predicted_winner_share` (number), `predicted_runner_up` (string or null), `predicted_runner_up_votes` (number), `predicted_margin` (number), `predicted_margin_pct` (number), `flipped` (boolean), `parties` (`PredictionParty[]`). For `applyNewParty` output, add optional fields: `new_party_votes` (number), `new_party_share` (number).

Define a `PredictionParams` interface matching `DEFAULT_PREDICTION_PARAMS` in `constants.ts`: `antiIncumbencyPct` (number), `turnoutPct` (number), `growthFactor` (number).

Define a `NewPartyConfig` interface matching the `config` parameter of `applyNewParty`: `name` (string), `color` (string), `statewideVoteShare` (number), `affinityWeights` (Record of string to number), `constituencyOverrides` (Record of string to number).

Define an `AggregateResult` interface for the output of `aggregateResults`: `totalSeats` (number), `parties` (array of objects with `party`, `seats`, `avgVoteShare`, `totalVotes` — all numbers except `party` which is string), `flipped` (array of objects with `constituency`, `from`, `to` as strings and `margin_latest`, `margin_next` as numbers or null), `flippedCount` (number).

**Verification:** Run `bunx tsc --noEmit` — the types file should compile without errors.

---

#### Step 4.2: Convert predictionEngine.js to predictionEngine.ts

Rename `frontend/src/engine/predictionEngine.js` to `frontend/src/engine/predictionEngine.ts`.

Add type annotations to all three exported functions:

- `generateBaseline` should accept `constituencies: ConstituencyPredictionData[]` and `params: PredictionParams`, returning `PredictionResult[]`. Import `ConstituencyPredictionData` from `types.ts`.
- `applyNewParty` should accept `baselineResults: PredictionResult[]` and `config: NewPartyConfig`, returning `PredictionResult[]`.
- `aggregateResults` should accept `predictions: PredictionResult[]` and return `AggregateResult`.

The private `emptyResult` function should accept a `ConstituencyPredictionData` parameter and return `PredictionResult`.

Within `generateBaseline`, the `parties` local variable (the mapped array of party objects) should be typed as `PredictionParty[]`. The destructured `params` should use the `PredictionParams` interface.

Within `applyNewParty`, the `getWeight` helper function should accept `string` and return `number`. The cloned parties array should be typed as `PredictionParty[]`.

**What to watch out for:** The `normalizeParty` import from `../constants` will now resolve to `../constants.ts` (converted in Phase 3). This should work seamlessly. However, verify that the `normalizeParty` function's TypeScript signature (`(p: string | null | undefined) => string`) is compatible with how it is called in the prediction engine — specifically, `normalizeParty(c.winner_party_latest)` where `winner_party_latest` is `string | null` in the `ConstituencyPredictionData` interface.

**Verification:** Run `bunx tsc --noEmit` — the prediction engine should compile without errors. If `strictNullChecks` produces errors (e.g., accessing `parties[0]` which could be `undefined` if the array is empty), these are genuine safety issues that should be addressed with null checks. The `emptyResult` early return already handles the `parties.length === 0` case, so the `parties[0]` access on the later lines is safe — but TypeScript cannot prove this without a type guard or non-null assertion. Use a non-null assertion (`parties[0]!`) only after verifying the logic guarantees non-emptiness, or add an explicit length check.

---

#### Step 4.3: Convert existing tests to TypeScript

Rename `frontend/src/engine/__tests__/predictionEngine.test.js` to `frontend/src/engine/__tests__/predictionEngine.test.ts`.

Update the `makeConstituency` fixture factory to return a typed `ConstituencyPredictionData` object. Import the interface from `../../types` (or from `../types` if the prediction-specific types are in `engine/types.ts`). The `overrides` parameter should be typed as `Partial<ConstituencyPredictionData>`.

Update the `defaultParams` object to be typed as `PredictionParams`.

The test assertions do not need type annotations — Vitest's `expect` function infers types from the argument. However, adding explicit type annotations to intermediate variables (like `const r: PredictionResult = results[0]`) can improve readability in complex assertions.

**What to watch out for:** Verify that the Vitest configuration in `vite.config.js` works correctly with `.test.ts` files. The `globals: true` setting in the test config means `describe`, `it`, and `expect` are available globally — but the TypeScript compiler does not know about them. Add `"types": ["vitest/globals"]` to the `compilerOptions` in `tsconfig.json` to make TypeScript aware of these global test functions. Alternatively, keep the explicit imports (`import { describe, it, expect } from 'vitest'`) that the current test file already uses — this is the safer approach and does not require modifying `tsconfig.json`.

**Verification:** Run `bun run test` and confirm all twenty-seven existing tests pass. Run `bunx tsc --noEmit` and confirm the test file compiles without errors.

---

#### Step 4.4: Add golden-value numerical tests for the prediction engine

Add new test cases to the `generateBaseline` describe block in the test file. These tests assert on exact numerical output for known inputs, not just structural properties. They are the single most important addition to the test suite because they catch mathematical errors that TypeScript cannot detect.

Define a fixed constituency with exact values: `electors_latest: 200000`, four candidates with vote shares `45`, `35`, `10`, `10` for parties ADMK, DMK, INC, BJP respectively, at positions 1, 2, 3, 4. Use params `antiIncumbencyPct: 20`, `turnoutPct: 75`, `growthFactor: 1.05`.

Calculate the expected output by hand:
- Scaled electors: `Math.round(200000 * 1.05) = 210000`
- Valid votes: `Math.round(210000 * 0.75) = 157500`
- Anti-incumbency: incumbent (ADMK, position 1) at 45% loses `0.45 * 0.20 = 0.09` of vote share. ADMK becomes `0.45 - 0.09 = 0.36`. Runner-up (DMK) gains `0.09 * 0.7 = 0.063`, becoming `0.35 + 0.063 = 0.413`. Others (INC, BJP) each gain `(0.09 * 0.3) / 2 = 0.0135`. INC becomes `0.10 + 0.0135 = 0.1135`, BJP becomes `0.10 + 0.0135 = 0.1135`.
- Normalization: total = `0.36 + 0.413 + 0.1135 + 0.1135 = 1.0`. Already sums to 1.0.
- ADMK votes: `Math.round(0.36 * 157500) = 56700`. DMK votes: `Math.round(0.413 * 157500) = 65048`. And so on.

Assert that the test output matches these hand-calculated values using `toBeCloseTo` with appropriate precision (since rounding may introduce small differences).

Add similar golden-value tests for `applyNewParty`: given the baseline output from the known constituency above, apply a new party with `statewideVoteShare: 15`, `affinityWeights: { ADMK: 0.5, DMK: 0.3, INC: 0.1, BJP: 0.1 }`. Calculate the expected vote redistribution by hand and assert on the results.

Add a golden-value test for the full chain: `generateBaseline` with known input, then `applyNewParty` on the result, then `aggregateResults` on that. Assert on the `totalSeats`, `parties[0].party`, `parties[0].seats`, and `flippedCount` in the aggregate output.

---

#### Step 4.5: Add edge case tests for the prediction engine

Add tests for the following edge cases not covered by the existing twenty-seven tests:

- **NaN propagation test:** Create a constituency where `candidates_latest` contains an entry with `vote_share_percentage: undefined` (not `null`, but `undefined` — simulating a JavaScript property access error). Verify that the output does not contain `NaN` in any numeric field. This tests the `|| 0` fallback in the expression `(cand.vote_share_percentage || 0) / 100`.

- **All zero vote shares:** Create a constituency where all candidates have `vote_share_percentage: 0`. Verify that the normalization step does not divide by zero and the output is deterministic.

- **Very large constituency count:** Create an array of 403 constituencies (matching Uttar Pradesh's assembly count) and run `generateBaseline`. Verify that the function completes without performance issues and all results have valid numeric fields.

- **`applyNewParty` does not mutate input:** Call `applyNewParty`, then verify that the original baseline results array and its nested objects have not been modified. The function already clones parties with `r.parties.map((p) => ({ ...p }))`, but the test should verify this contract explicitly using deep equality on the original.

---

#### Step 4.6: Expand aggregateResults test coverage

Add tests to the `aggregateResults` describe block:

- **Single-party sweep:** Create predictions where all constituencies are won by the same party. Verify `totalSeats` equals the constituency count, `parties` has one entry with `seats` equal to `totalSeats`, and `flippedCount` is zero (assuming the winner is the same as the latest winner).

- **Interaction with applyNewParty output:** Run `generateBaseline`, then `applyNewParty` with a new party that wins some seats, then `aggregateResults`. Verify that the new party appears in the `parties` array with the correct seat count.

- **Golden-value numerical aggregation:** Use a fixed set of three constituencies with known prediction outputs. Assert on exact `avgVoteShare` and `totalVotes` values for each party in the aggregated result.

---

#### Step 4.7: Add full-chain integration test

Create a new test file at `frontend/src/engine/__tests__/predictionChain.test.ts` (or add a new describe block to the existing test file). This test exercises the complete pipeline as `App.jsx` uses it:

1. Create realistic constituency data (at least three constituencies with different parties winning).
2. Call `generateBaseline` with specific params.
3. Call `applyNewParty` on the baseline results with a new party configuration.
4. Call `aggregateResults` on the final predictions.
5. Assert on the numerical output at each stage.

This integration test catches bugs that unit tests miss — for example, if `generateBaseline` produces output whose shape does not match what `applyNewParty` expects (a type mismatch that TypeScript catches at compile time but whose runtime behavior should also be verified).

**Verification:** Run `bun run test:coverage` and confirm all tests pass, including the new golden-value and edge case tests. Coverage should increase from its current level (one file tested) to include the prediction engine more thoroughly.

---

#### Step 4.8: Add API client unit tests

Create a new test file at `frontend/src/__tests__/api.test.ts`. This file tests the API client's internal mechanisms — caching, deduplication, error handling, CSRF extraction, and auth headers — using a mock `fetch` function.

**Cache tests:** Verify that calling an API method twice within the 5-minute TTL (`CACHE_TTL = 5 * 60 * 1000`) results in only one `fetch` call. Verify that calling after TTL expiry triggers a new `fetch`. Verify that different query parameters produce different cache keys (e.g., `api.stats('Tamil_Nadu', 'AE')` and `api.stats('Kerala', 'AE')` should not share a cache entry). To test TTL expiry, use Vitest's `vi.useFakeTimers()` and `vi.advanceTimersByTime()` to simulate time passing.

**Request deduplication tests:** Call the same API method twice concurrently (without awaiting the first call before making the second). Verify that `fetch` is called only once and both calls resolve with the same data.

**Error handling tests:** Mock `fetch` to return a non-200 response (e.g., status 404). Verify that the API method throws an `Error` with a message containing the status code. Mock `fetch` to return a 500 with a JSON body containing `{ detail: "Server error" }` — verify the error message includes the detail from the body (this is how the `post` function handles errors). Mock `fetch` to throw a network error — verify the error propagates.

**CSRF token tests:** Set `document.cookie` to include `csrf_token=test-token` and verify that `_csrfHeaders()` (which is not exported — test it indirectly through a `post` call) includes the `X-CSRF-Token` header with value `test-token`. Test edge cases: cookies with semicolons in other cookie values, multiple cookies where `csrf_token` is not the first, and missing `csrf_token` (the header should not be included).

**Auth headers tests:** Set a token via `api.setToken('test-token')` and verify that subsequent `get` calls include an `Authorization: Bearer test-token` header. Call `api.setToken(null)` and verify the Authorization header is not included. Test with an empty string token — verify behavior is consistent (the current code checks `if (_token)`, so an empty string should not produce a header).

**localStorage interaction tests:** Verify that `api.setToken('abc')` stores `'abc'` in `localStorage.getItem('auth_token')`. Verify that `api.setToken(null)` removes the item. For `localStorage` unavailability (private browsing mode), mock `localStorage` to throw on access and verify the API client does not crash — if it does crash, that is a bug to fix.

**What to watch out for:** The API client uses `fetch` from the global scope. In the Vitest jsdom environment, `fetch` is available globally (jsdom 25 includes a fetch implementation). Use `vi.spyOn(global, 'fetch')` or `vi.fn()` to mock it. For the cache tests, be aware that the `_cache` Map and `_token` variable are module-level state — tests that modify them will affect subsequent tests. Use `beforeEach` to reset state: call `api.setToken(null)` and note that there is no public API to clear the cache — the test may need to import the module in a way that resets between tests, or accept that tests run in a specific order. Consider using Vitest's `vi.resetModules()` and dynamic `import()` to get a fresh module instance for each test group.

**Verification:** Run `bun run test:coverage` and confirm all API client tests pass. Coverage for `api.ts` should now include the `get`, `post`, `_cachedGet`, `authHeaders`, `_getCsrfToken`, and `_csrfHeaders` functions.

---

#### Phase 4 Deliverables

After Phase 4: `predictionEngine.ts` is fully typed with interfaces for all internal data structures; the test file is converted to TypeScript; golden-value numerical tests verify mathematical correctness for known inputs; edge case tests cover NaN propagation, zero vote shares, and large constituency counts; a full-chain integration test exercises the complete prediction pipeline; the API client has comprehensive unit tests covering caching, deduplication, error handling, CSRF, and auth headers. Test coverage has increased from one module to three (prediction engine, API client, and the prediction chain integration).

#### Phase 4 Risks and Mitigations

The prediction engine's deeply nested data structures may require several iterations to type correctly — TypeScript will flag property accesses that do not match the interfaces, and each flag requires investigating whether the type definition is wrong or the code has a latent bug. This is the primary value of the conversion, but it takes time. The golden-value tests may reveal existing calculation errors in the prediction logic — these should be fixed as bugs, not papered over with adjusted test expectations.

---

### Phase 5: TypeScript Adoption — Wave 3: Context Providers and High-Complexity Components

**Purpose:** Convert the remaining high-value modules — both context providers, the error boundary, and the root App component — to TypeScript. Establish a rule that all new files must be `.tsx` with CI enforcement.

**Delivers:** Typed context providers with typed hooks, typed error boundary (the only class component), typed App component, and a CI enforcement mechanism preventing new `.jsx` files.

**Dependencies:** Phases 3 and 4 must be complete. The context providers import from `api.ts` and the App component imports from both `api.ts` and `predictionEngine.ts`.

---

#### Step 5.1: Convert AuthContext.jsx to AuthContext.tsx

Rename `frontend/src/contexts/AuthContext.jsx` to `frontend/src/contexts/AuthContext.tsx`.

Define an `AuthContextValue` interface for the context value. Based on the current `AuthContext.Provider value` prop in the existing code, this interface should contain: `user` (the `User` type from `types.ts`, or `null`), `loading` (boolean), `login` (a function accepting `mobile: string` and `firebaseIdToken: string`, returning `Promise<User>`), `logout` (a function accepting no arguments and returning `void`), `linkGoogle` (a function accepting `googleIdToken: string` and `googleAccessToken: string`, returning `Promise<void>`), `updateProfile` (a function accepting `data: UserProfile` and returning `Promise<void>`).

The `createContext` call should be typed: `createContext<AuthContextValue | null>(null)`. The initial value remains `null` because the provider sets the actual value.

The `useAuth` hook should be typed to return `AuthContextValue` (non-null). It already throws if the context is null (`if (!ctx) throw new Error('useAuth must be inside AuthProvider')`), so the return type assertion is safe. The implementation pattern is: `const ctx = useContext(AuthContext); if (!ctx) throw new Error('...'); return ctx;`.

The `AuthProvider` component's `children` prop should be typed using `React.ReactNode` (from the `@types/react` package already installed). Define a `Props` interface: `{ children: React.ReactNode }`.

The `login` callback uses `api.verifyOtp` which returns `Promise<AuthResponse>`. The `AuthResponse` type has `token` (string) and `user` (dict/object in Python, which is typed as `User` in `types.ts`). Ensure that `result.token` and `result.user` access matches the `AuthResponse` interface.

**How it connects:** Components that use `useAuth()` will now receive typed return values. If a component accesses `user.nonexistent_field`, TypeScript will flag the error at compile time. Update `main.jsx`'s import of `AuthProvider` to point to the new `.tsx` file — if the import uses `'./contexts/AuthContext.jsx'` with the explicit extension (as observed in `main.jsx`), change it to `'./contexts/AuthContext'` (without extension) or `'./contexts/AuthContext.tsx'`.

**Verification:** Run `bunx tsc --noEmit` and confirm zero errors. Run the dev server and verify login/logout functionality works.

---

#### Step 5.2: Convert StateContext.jsx to StateContext.tsx

Rename `frontend/src/contexts/StateContext.jsx` to `frontend/src/contexts/StateContext.tsx`.

Define a `StateContextValue` interface: `states` (array of `StateInfo` from `types.ts`), `selectedState` (string), `selectState` (function accepting `string` and returning `void`), `electionType` (the literal union type `'AE' | 'GE'`), `setElectionType` (function accepting `'AE' | 'GE'` and returning `void`), `loading` (boolean).

The literal union type for `electionType` is particularly valuable — it prevents passing invalid election type strings to API calls. Currently, the `electionType` state is initialized with `useState('AE')`, which TypeScript infers as `string`. Explicitly type the state: `useState<'AE' | 'GE'>('AE')`.

The `createContext` call should be typed: `createContext<StateContextValue | null>(null)`. The `useStateSelection` hook should assert non-null if desired, or return `StateContextValue | null` — the current implementation does not throw on null context (unlike `useAuth`), so the developer must decide whether to add the throw or let consumers handle potential null.

The `localStorage.getItem('selected_state')` call returns `string | null`. The fallback `|| DEFAULT_STATE` handles the null case, so the initial value passed to `useState` is always a string.

Update `main.jsx`'s import of `StateProvider` to drop the `.jsx` extension if present.

**Verification:** Run `bunx tsc --noEmit` and confirm zero errors. Run the dev server, change the selected state, and verify the state persists across page refreshes (localStorage).

---

#### Step 5.3: Add context provider tests

Create a new test file at `frontend/src/contexts/__tests__/AuthContext.test.tsx`. (Note: this is a `.tsx` file because it renders JSX — the `AuthProvider` component is rendered in the test.)

**AuthContext tests:**
- Render a test component inside `AuthProvider` that reads and displays `useAuth()` values. Verify initial state: `user` is `null`, `loading` is `true`.
- Mock `api.getToken()` to return a token and `api.getMe()` to return a user object. Re-render and verify that after the effect resolves, `user` is set and `loading` is `false`.
- Mock `api.getToken()` to return a token and `api.getMe()` to reject. Verify that `user` remains `null`, `loading` becomes `false`, and `api.setToken(null)` is called (clearing the invalid token).
- Call the `login` function from the context (via a button click in the test component). Mock `api.verifyOtp` to return `{ token: 'new-token', user: { id: 1, mobile: '+91...' } }`. Verify that `user` is updated and `api.setToken` is called with the new token.
- Call the `logout` function. Verify that `user` becomes `null` and `api.setToken(null)` is called.
- Render a component that calls `useAuth()` outside of `AuthProvider`. Verify that it throws the error `'useAuth must be inside AuthProvider'`.

Create a test file at `frontend/src/contexts/__tests__/StateContext.test.tsx`.

**StateContext tests:**
- Render a test component inside `StateProvider` that reads `useStateSelection()` values. Mock `api.states()` to return a list of state objects including `{ state_name: 'Tamil_Nadu', ... }` and `{ state_name: 'Kerala', ... }`. Verify initial state: `selectedState` is `'Tamil_Nadu'` (the default), `electionType` is `'AE'`, `loading` becomes `false` after the API call resolves.
- Call `selectState('Kerala')`. Verify `selectedState` updates to `'Kerala'` and `localStorage.setItem` is called with `('selected_state', 'Kerala')`.
- Change `selectedState`. Verify that `electionType` resets to `'AE'` (the `useEffect` that watches `selectedState`).
- Mock `localStorage.getItem('selected_state')` to return `'Kerala'` before rendering. Verify that `selectedState` initializes to `'Kerala'`.
- Mock `api.states()` to return a list that does not include the previously-selected state. Verify that `selectedState` falls back to the first state in the list.

**What to watch out for:** Context tests require wrapping the test component in the provider. Use Testing Library's `render` with a custom wrapper: `render(<TestComponent />, { wrapper: StateProvider })`. For `AuthProvider`, which has side effects on mount (checking for an existing token), ensure mocks are set up before rendering.

**Verification:** Run `bun run test` and confirm all context tests pass.

---

#### Step 5.4: Convert ErrorBoundary.jsx to ErrorBoundary.tsx

Rename `frontend/src/components/ErrorBoundary.jsx` to `frontend/src/components/ErrorBoundary.tsx`.

This is the only class component in the codebase and requires different TypeScript patterns than the functional components. The class should extend `React.Component<ErrorBoundaryProps, ErrorBoundaryState>` where:

- `ErrorBoundaryProps` is an interface with `children: React.ReactNode`.
- `ErrorBoundaryState` is an interface with `hasError: boolean` and `error: Error | null`.

The `constructor` should type its parameter as `props: ErrorBoundaryProps` and call `super(props)`.

The static method `getDerivedStateFromError` should have the signature `static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState>` — it returns `{ hasError: true, error }`.

The `componentDidCatch` method should have the signature `componentDidCatch(error: Error, info: React.ErrorInfo): void`.

The `render` method's return type is `React.ReactNode`.

**What to watch out for:** The class component uses inline `style` attributes (objects passed to the `style` prop). TypeScript will type-check these — ensure the style properties use the correct React CSS property names (e.g., `backgroundColor` not `background-color`). The existing code uses `background` (shorthand), `padding`, `textAlign`, `color`, `marginTop`, `border`, `borderRadius`, `cursor` — all are valid React CSS property names.

**Verification:** Run `bunx tsc --noEmit` and confirm zero errors.

---

#### Step 5.5: Convert App.jsx to App.tsx

Rename `frontend/src/App.jsx` to `frontend/src/App.tsx`.

This is the largest and most complex file at approximately 450 lines. The conversion involves typing several categories of code:

**Typed context consumption:** The `useAuth()` hook now returns `AuthContextValue` (from Step 5.1), so `user` is typed as `User | null` and `loading` as `boolean`. The `useStateSelection()` hook returns `StateContextValue` (from Step 5.2), so `states`, `selectedState`, `electionType`, etc. are all typed.

**Prediction state typing:** The `predData` state should be typed as `PredictionDataResponse | null` (from `types.ts`). The `predParams` state should use the prediction params interface (defined in Phase 4 or in `constants.ts`). The `baseline` and `predictions` useMemo results are typed as `PredictionResult[]`. The `summary` useMemo result is typed as `AggregateResult`.

**Component props:** The `ConstituencyDetailRoute` inner component receives `{ onBack }` — type `onBack` as `() => void`. The `RequireAuth` inner component receives `{ children: React.ReactNode }`.

**Lazy-loaded component imports:** The `lazy(() => import('./components/StateOverview'))` calls should work with TypeScript — the imported module's default export type flows through `lazy`. However, if any component does not have a default export, TypeScript will flag an error.

**React Router types:** `useNavigate()` returns `NavigateFunction`, `useLocation()` returns `Location`, `useParams()` returns `Readonly<Params<string>>`. These are inferred from `react-router-dom`'s type declarations.

**Event handlers and callbacks:** The `handleConstituencyOverride` callback receives `name: string`. The `handleLoadBookmark` callback receives `params: any` (or a more specific bookmark params type if defined). State setters are typed automatically by `useState`.

**What to watch out for:** The line `data._state = selectedState` in the prediction data loading effect mutates the response object by adding a property that does not exist on the `PredictionDataResponse` type. Either extend the type to include `_state?: string` or use a separate state variable to track which state the prediction data belongs to. The latter is cleaner — store `predDataState` as a separate `string | null` state instead of mutating the API response.

The `predParams` state uses spread with `DEFAULT_PREDICTION_PARAMS` which returns a plain object. If `DEFAULT_PREDICTION_PARAMS` is now typed in `constants.ts`, the state will be correctly typed.

Update `main.jsx`'s import of `App` to drop the `.jsx` extension: change `import App from './App.jsx'` to `import App from './App'`.

**Verification:** Run `bunx tsc --noEmit` and confirm zero errors. Run the dev server and exercise all routes: landing page, national dashboard, state overview, constituency list, constituency detail, prediction panel, prediction results, bookmarks, pricing, support, privacy policy, terms of service. Verify no runtime errors.

---

#### Step 5.6: Update main.jsx imports

The entry point `frontend/src/main.jsx` currently imports with explicit `.jsx` extensions:
- `import App from './App.jsx'`
- `import { AuthProvider } from './contexts/AuthContext.jsx'`
- `import { StateProvider } from './contexts/StateContext.jsx'`

Update these to drop the `.jsx` extensions since the files are now `.tsx`. TypeScript module resolution with `moduleResolution: "bundler"` resolves extensionless imports to either `.ts`, `.tsx`, `.js`, or `.jsx`.

Note: `main.jsx` itself is not converted to TypeScript in this phase — it is a simple entry point with no complex logic, and converting it provides minimal type safety value. It can be converted opportunistically later.

**Verification:** Run `bun run dev` and confirm the application loads without errors.

---

#### Step 5.7: Establish the "all new files in .tsx" CI enforcement

Create a new script at `frontend/scripts/check-no-new-jsx.sh` (or inline it as a CI step). The script should:

1. Define an exemption list of existing `.jsx` files that have not yet been converted. Based on the current codebase, this list includes: `src/main.jsx` and all twenty-four component files in `src/components/` (`ApiKeyManager.jsx`, `CommunityFeed.jsx`, `ConstituencyDetail.jsx`, `ConstituencyList.jsx`, `Disclaimer.jsx`, `ElectionTimeline.jsx`, `ElectionTypeToggle.jsx`, `IndiaMap.jsx`, `LoginModal.jsx`, `MyBookmarks.jsx`, `NationalDashboard.jsx`, `PartyStrengthChart.jsx`, `PredictionConstituencyTable.jsx`, `PredictionPanel.jsx`, `PredictionResults.jsx`, `PricingPage.jsx`, `PrivacyPolicy.jsx`, `SaveBookmarkModal.jsx`, `StateComparison.jsx`, `StateOverview.jsx`, `SupportPage.jsx`, `TermsOfService.jsx`, `UserMenu.jsx`) plus the two widget files (`src/widgets/ConstituencyCard.jsx`, `src/widgets/SeatProjection.jsx`).
2. Find all `.jsx` files in `src/` using `find src -name '*.jsx'`.
3. Compare the found files against the exemption list.
4. If any `.jsx` file is found that is not in the exemption list, print an error message and exit with code 1.
5. If all `.jsx` files are in the exemption list, exit with code 0.

Add this script as a CI step in `.github/workflows/ci.yml`, after the `tsc --noEmit` step. The step runs `cd frontend && bash scripts/check-no-new-jsx.sh`.

As components are converted to `.tsx` during future feature work, remove them from the exemption list. When the exemption list is empty, the script can be simplified to `! find src -name '*.jsx' | grep -q .`.

**Verification:** Create a temporary `src/components/TestNewComponent.jsx` file, run the script, and confirm it fails. Delete the file.

---

#### Phase 5 Deliverables

After Phase 5: both context providers are typed with properly typed hooks and context values; the error boundary class component is typed with `React.Component<Props, State>` generics; `App.tsx` is fully typed with typed prediction state, typed context consumption, and typed callbacks; `main.jsx` imports are updated; a CI script prevents new `.jsx` files from being added. All data flow paths through the application — from API response through context providers to the App component to the prediction engine — are type-checked by `tsc --noEmit`.

#### Phase 5 Risks and Mitigations

The `App.tsx` conversion is the most complex step in the entire plan because the component manages prediction state through multiple `useMemo` chains with deeply nested dependencies. If TypeScript errors accumulate faster than they can be resolved, it is acceptable to temporarily add `// @ts-ignore` comments on specific lines and create TODO issues for each — but this should be a last resort, not a first approach. Each `@ts-ignore` represents a real type safety gap.

The lazy-loaded component imports may produce TypeScript errors if the component files (still `.jsx`) do not have type declarations. With `allowJs: true`, TypeScript infers types from JavaScript files — but the inference may not be accurate for complex components. This is acceptable at this stage; the lazy-loaded components will be converted to `.tsx` opportunistically during future feature work.

---

### Phase 6: Deferred Items Documentation

**Purpose:** Document decisions that were explicitly deferred, with trigger criteria for revisiting each one.

**Delivers:** A decisions document that prevents institutional memory loss about why certain tooling changes were not made.

**Dependencies:** None.

---

#### Step 6.1: Document CSS architecture trigger point

Add a section to `frontend/README.md` (or create a new file `frontend/DECISIONS.md`) documenting: the single `index.css` file is acceptable at current scale (approximately 1,210 lines); it should be reconsidered when it exceeds 2,000 lines or when the first class name collision is encountered; CSS Modules is the recommended migration approach because Vite supports it natively via `.module.css` file naming; the existing CSS custom property theming system (`:root` variables like `--bg`, `--bg2`, `--text`, `--accent`) would remain in a global `theme.css` file since CSS custom properties need to be globally accessible.

---

#### Step 6.2: Document accessibility linting trigger point

Document that `eslint-plugin-jsx-a11y` should be added when the platform pursues institutional or government users, or when user feedback indicates accessibility issues. Note that the prediction panel sliders and the login modal OTP inputs are the highest-priority accessibility concerns (interactive elements that may not have proper ARIA labels or keyboard navigation).

---

#### Step 6.3: Document monorepo decision

Document that monorepo tooling (Turborepo, Nx, npm/Bun workspaces) was evaluated and explicitly rejected because: the project has a single JavaScript package; the frontend and API communicate via HTTP and share no code; the backend is Python, making workspace-level dependency management inapplicable. This decision should be revisited only if a shared TypeScript package (e.g., generated API types) is introduced.

---

#### Phase 6 Deliverables

After Phase 6: a decisions document exists recording the CSS architecture, accessibility linting, and monorepo tooling decisions with explicit trigger criteria. This prevents future developers (or the same developer after a break) from re-evaluating already-settled questions.

#### Phase 6 Risks and Mitigations

None. This is a documentation-only phase with no technical risk.

---

## 4. Cross-Cutting Concerns

**Error handling patterns.** The API client's error handling pattern — throwing `Error` objects with status code information for non-200 responses — should be preserved during the TypeScript conversion. The `post` function additionally attempts to parse an error body with `res.json().catch(() => ({}))` and includes `data.detail` in the error message; this pattern should be replicated in the `put` function for consistency (it currently does not extract error details). All error handling in context providers follows the pattern of catching and logging errors in `useEffect` blocks — this should continue.

**Logging and monitoring.** Sentry integration is configured in `main.jsx` and should not be modified during any phase. The `@sentry/react` package provides error boundary integration that wraps the existing `ErrorBoundary` component. When converting `ErrorBoundary.tsx`, verify that Sentry's `browserTracingIntegration` continues to work — it should, since Sentry hooks into the global error handler, not the component's error boundary.

**Security considerations.** The API client handles authentication tokens in `localStorage` and CSRF tokens in cookies. During the TypeScript conversion (Phase 3, Step 3.7), do not change the token storage mechanism. The `authHeaders` function's pattern of only including the `Authorization` header when `_token` is truthy (not empty string, not null, not undefined) is correct and should be preserved. The CSRF token extraction regex (`/(?:^|;\s*)csrf_token=([^;]*)/`) handles the standard cookie format — do not modify it during conversion.

**Performance considerations.** The API client's unbounded `_cache` Map does not have a maximum size limit. The strategic plan acknowledges this as a known issue but defers it — do not add LRU eviction or max-size checks during this implementation unless instructed. The `useMemo` chains in `App.jsx` (which will become `App.tsx`) are performance-critical and depend on correct dependency arrays — when adding TypeScript types, do not modify the dependency arrays.

**Accessibility.** No accessibility changes are included in this implementation. The deferred items documentation (Phase 6) records the trigger criteria for adding `eslint-plugin-jsx-a11y`.

---

## 5. Migration and Data Considerations

No data model changes or database migrations are involved in this implementation. All changes are confined to the frontend tooling, type system, and test infrastructure. The backend API is not modified — the TypeScript interfaces in `types.ts` describe the existing API response shapes without changing them.

The only "migration" is the file extension renaming from `.js`/`.jsx` to `.ts`/`.tsx`, which affects git history (renamed files) but has no data implications.

---

## 6. Integration Points

**Frontend-to-backend API contract.** The TypeScript interfaces in `types.ts` codify the API contract between the React frontend and the FastAPI backend. Every field name, type, and nullability annotation in the TypeScript interfaces must exactly match what the Python backend serializes. The CI validation script (Step 3.10) is the enforcement mechanism for this contract.

The API endpoints are:
- `GET /v1/states` → `StateInfo[]`
- `GET /v1/stats/summary?state=...&election_type=...` → `StatsSummary`
- `GET /v1/years?state=...&election_type=...` → `YearSummary[]`
- `GET /v1/constituencies?state=...&election_type=...` → `ConstituencySummary[]`
- `GET /v1/swings/state?state=...&election_type=...` → `StateSwingSummary[]`
- `GET /v1/swings/constituency/{name}?state=...&election_type=...` → `ConstituencySwing`
- `GET /v1/swings/constituencies?state=...&election_type=...` → `ConstituencySwingRow[]`
- `GET /v1/parties?state=...&election_type=...` → `PartySummary[]`
- `GET /v1/predict/data?state=...` → `PredictionDataResponse`
- `POST /v1/auth/verify-otp` → `AuthResponse`
- `GET /v1/auth/me` → `User`
- `PUT /v1/auth/me` → `User`
- `POST /v1/auth/google-link` → (void/success)
- `GET /v1/bookmarks` → `Bookmark[]`
- `GET /v1/bookmarks/public?sort=...` → `Bookmark[]`
- `GET /v1/bookmarks/{id}` → `Bookmark`
- `POST /v1/bookmarks` → `Bookmark`
- `PUT /v1/bookmarks/{id}` → `Bookmark`
- `DELETE /v1/bookmarks/{id}` → `null`
- `POST /v1/bookmarks/{id}/vote` → (vote result)
- `GET /v1/national/state-summary?election_type=...` → `NationalStateSummary[]`
- `GET /v1/national/party-strength?election_type=...` → `NationalPartyStrength[]`
- `GET /v1/national/turnout-trends?election_type=...` → `NationalTurnoutTrend[]`
- `GET /v1/national/upcoming-elections` → `UpcomingElection[]`
- `GET /v1/national/compare?state_a=...&state_b=...&election_type=...` → (comparison result)
- `GET /v1/national/party-map?party=...&election_type=...` → `PartyMapEntry[]`
- `POST /v1/subscriptions/create` → `SubscriptionOut`
- `GET /v1/subscriptions/me` → `SubscriptionOut`
- `POST /v1/subscriptions/cancel` → `SubscriptionOut`
- `GET /v1/api-keys` → `ApiKeyOut[]`
- `POST /v1/api-keys` → `ApiKeyCreated`
- `DELETE /v1/api-keys/{id}` → `null`
- `GET /v1/auth/users/me/data` → (user data export)
- `DELETE /v1/auth/users/me` → `null`

**CI pipeline integration.** The CI workflow after all phases will have the following frontend job steps in order: checkout → setup-bun → `bun install --frozen-lockfile` → `bun run test:coverage` → `bun run lint` → `bun run format:check` → `bunx tsc --noEmit` → `bash scripts/check-no-new-jsx.sh`.

---

## 7. Configuration and Environment

**New files created:**
- `frontend/tsconfig.json` — TypeScript compiler configuration
- `frontend/.prettierrc` — Prettier formatting configuration
- `frontend/.prettierignore` — Prettier ignore patterns
- `frontend/.husky/pre-commit` — Git pre-commit hook
- `frontend/src/types.ts` — Shared TypeScript type definitions
- `frontend/scripts/check-no-new-jsx.sh` — CI enforcement script
- `api/scripts/validate_types.py` — CI type synchronization validation
- `.git-blame-ignore-revs` — Git blame ignore file (repository root)

**New dev dependencies:**
- `prettier` — code formatter
- `husky` — git hooks manager
- `lint-staged` — staged file linter/formatter
- `typescript` — TypeScript compiler
- `@typescript-eslint/eslint-plugin` — ESLint TypeScript rules
- `@typescript-eslint/parser` — ESLint TypeScript parser

**CI workflow changes:**
- Replace `actions/setup-node@v4` with `oven-sh/setup-bun@v2` (with version pinning)
- Replace `npm ci --legacy-peer-deps` with `bun install --frozen-lockfile`
- Replace `npx vitest run --coverage` with `bun run test:coverage`
- Replace `npx eslint src/` with `bun run lint`
- Add `bun run format:check` step
- Add `bunx tsc --noEmit` step
- Add `bash scripts/check-no-new-jsx.sh` step
- Add `python api/scripts/validate_types.py` step (in backend job or as separate job)

**Docker changes:**
- Pin `oven/bun:1-alpine` to specific minor version (e.g., `oven/bun:1.2-alpine`) in both `dev` and `build` stages

**Vercel changes:**
- Pin Bun version if the platform supports it (via environment variable or `.bun-version` file)

**GCP Cloud Build changes:**
- Pin `oven/bun:1-alpine` to specific minor version in `infra/cloudbuild/frontend-deploy.yaml`

**No environment variables are added or modified.** All changes are tooling and configuration, not runtime behavior.

---

## 8. Implementation Order and Dependencies

**Dependency graph:**

Phase 1 (Bun) → no dependencies, can start immediately
Phase 2 (Prettier) → no dependencies, can start immediately
Phase 3 (TS Wave 1) → soft dependency on Phases 1 and 2 (CI uses Bun, files are pre-formatted)
Phase 4 (TS Wave 2) → hard dependency on Phase 3 (needs types.ts and api.ts)
Phase 5 (TS Wave 3) → hard dependency on Phase 4 (needs predictionEngine.ts)
Phase 6 (Docs) → no dependencies, can be done anytime

**Parallelizable work:**

Phases 1 and 2 can be done in parallel by the same developer (they touch different files — CI workflow vs. Prettier config) or sequentially in the same day.

Within Phase 3, Steps 3.1–3.4 (tsconfig, TypeScript install, ESLint config, CI step) can be done as a single preparation commit. Steps 3.5–3.9 (types.ts, api.ts, constants.ts, import updates) form the main conversion work. Step 3.10 (validation script) is independent and can be done after the rest of Phase 3.

Phase 4 test writing (Steps 4.4–4.8) can begin as soon as `types.ts` and `api.ts` exist — the prediction engine conversion (Steps 4.1–4.3) is a prerequisite for the prediction tests but not for the API client tests.

Phase 6 can be done at any time.

**Recommended order for a single developer:**

1. Phase 1 (half day)
2. Phase 2 (half day — same day as Phase 1)
3. Phase 3, Steps 3.1–3.4: TypeScript infrastructure (2 hours)
4. Phase 3, Steps 3.5–3.6: types.ts with proof-of-value milestone (4–6 hours)
5. Phase 3, Steps 3.7–3.9: api.ts and constants.ts conversion (4–6 hours)
6. Phase 4, Steps 4.1–4.3: predictionEngine.ts and test conversion (3–4 hours)
7. Phase 4, Steps 4.4–4.7: prediction engine test expansion (3–4 hours)
8. Phase 4, Step 4.8: API client tests (3–4 hours)
9. Phase 5, Steps 5.1–5.3: context providers and tests (3–4 hours)
10. Phase 5, Steps 5.4–5.5: ErrorBoundary and App.tsx (3–4 hours)
11. Phase 5, Steps 5.6–5.7: main.jsx updates and CI enforcement (1 hour)
12. Phase 3, Step 3.10: type sync validation script (2 hours)
13. Phase 6: deferred items documentation (1 hour)

**How to split across multiple developers:** Phase 1 and Phase 2 can be done by different developers simultaneously. Phase 3 must be done by one developer to maintain consistency in type definitions. Phase 4's test writing can be split: one developer writes prediction engine tests while another writes API client tests (after Phase 3 is merged). Phase 5 should be done by the developer who completed Phase 3, as they are most familiar with the type system.

---

## 9. Completion Criteria

**Phase 1 completion:**
- CI workflow uses Bun with a pinned minor version
- `package-lock.json` is deleted
- All deployment paths (Docker, Vercel, GCP Cloud Build) use the same pinned Bun version
- CI passes with all existing tests and lint rules
- Developer documentation references Bun exclusively

**Phase 2 completion:**
- `.prettierrc` exists with project-specific configuration
- All files in `src/` pass `prettier --check`
- CI includes a `format:check` step that blocks on formatting errors
- Pre-commit hooks run Prettier and ESLint on staged files
- `.git-blame-ignore-revs` contains the formatting commit hash
- `git blame` output skips the formatting commit

**Phase 3 completion:**
- `tsconfig.json` exists with `strictNullChecks: true`, `allowJs: true`, `checkJs: false`
- `bunx tsc --noEmit` passes in CI with zero errors
- ESLint lints both `**/*.{js,jsx}` and `**/*.{ts,tsx}` files
- `src/types.ts` defines interfaces for all API response shapes
- `src/api.ts` has typed return values for all thirty API methods
- `src/constants.ts` has typed exports
- The CI type validation script passes

**Phase 4 completion:**
- `src/engine/predictionEngine.ts` compiles without errors
- All existing twenty-seven tests pass after conversion to `.test.ts`
- Golden-value numerical tests exist for `generateBaseline`, `applyNewParty`, and `aggregateResults`
- A full-chain integration test exercises the complete prediction pipeline
- API client unit tests exist covering cache, deduplication, error handling, CSRF, and auth headers
- `bun run test:coverage` passes with increased coverage

**Phase 5 completion:**
- `AuthContext.tsx` and `StateContext.tsx` export typed hooks
- `ErrorBoundary.tsx` uses `React.Component<Props, State>` generics
- `App.tsx` compiles without errors with typed prediction state and context consumption
- Context provider tests exist and pass
- `main.jsx` imports are updated to extensionless paths
- The `check-no-new-jsx.sh` CI script passes
- `bunx tsc --noEmit` continues to pass with zero errors

**Phase 6 completion:**
- A decisions document exists recording CSS architecture, accessibility linting, and monorepo tooling decisions with explicit trigger criteria

**Overall completion:**
- All CI steps pass: `bun install --frozen-lockfile`, `bun run test:coverage`, `bun run lint`, `bun run format:check`, `bunx tsc --noEmit`, `bash scripts/check-no-new-jsx.sh`
- Test coverage is above 50% for business logic modules (prediction engine, API client)
- The application runs without errors locally and deploys successfully to Vercel

---

## 10. Implementation Report Summary

This report decomposes the Pragmatic Foundation approach into six phases containing forty-one individual steps across twenty-five to thirty-seven developer-hours. Phase 1 eliminates the dual-lockfile problem by standardizing on Bun with version pinning across CI, Docker, Vercel, and GCP Cloud Build. Phase 2 adds Prettier with a one-time reformat, preserved git blame, CI enforcement, and pre-commit hooks. Phase 3 introduces TypeScript starting with the highest-value targets: a graduated tsconfig with strictNullChecks enabled from day one, TypeScript interfaces for all API response shapes matched against the twenty-seven Pydantic models in the Python backend, a fully typed API client, typed constants, tsc --noEmit in CI, ESLint TypeScript configuration, and a CI validation script that catches type drift between Python and TypeScript. Phase 4 converts the prediction engine to TypeScript and dramatically expands test coverage with golden-value numerical tests, edge case coverage, a full-chain integration test, and comprehensive API client unit tests. Phase 5 completes the high-priority TypeScript migration by converting both context providers (with typed hooks), the class-based error boundary, and the complex root App component, then establishes a CI-enforced rule preventing new .jsx files. Phase 6 documents deferred decisions with explicit revisitation criteria.

The critical dependency chain is Phase 3 → Phase 4 → Phase 5 for the TypeScript migration, while Phases 1, 2, and 6 are independent. The highest-risk step is Phase 3's type definitions (Step 3.6), where incorrect transcription from Python models produces TypeScript types that compile but do not match runtime API responses — mitigated by the CI validation script. The highest-value deliverable is the golden-value prediction engine tests (Step 4.4), which are the only mechanism for catching mathematical errors that produce plausible but incorrect election predictions.
