# Mobile-First UI/UX Transformation — Implementation Report

**Date:** 2026-04-29  
**Source Plan:** `_architect/analysis/2026-04-29-mobile-first-ui-ux.md`  
**Status:** ready for implementation  

---

## 1. Implementation Overview

This implementation report decomposes the mobile-first UI/UX transformation of the Indian election analytics platform into granular, actionable steps organized across six phases. The transformation migrates the frontend from a desktop-first CSS architecture with breakpoint patches to a mobile-first design system powered by Tailwind CSS 4.x for utility-first styling, Radix UI primitives for structural accessibility, and the Motion library for purposeful animation. The work touches all 24 component files in `frontend/src/components/`, the two widget files in `frontend/src/widgets/`, the root `App.tsx`, the monolithic 2300-line `index.css`, the entry point `main.jsx`, the HTML shell `index.html`, and the Vite configuration `vite.config.js`. The backend is affected only in a single file — `api/main.py` at line 250 — where the Content-Security-Policy header must be updated to allow Plausible analytics and self-hosted web fonts.

The detected technology stack consists of React 19.2 with React Router 7.14, Vite 8.0 as the bundler, TypeScript 6.0 (with `strict: false`, `strictNullChecks: true`, and `allowJs: true` enabling mixed JSX/TSX), Recharts 2.15 for data visualization, Firebase 11.x for phone and Google authentication, Sentry for error tracking, Vitest 3.0 with Testing Library for unit tests, and a single monolithic CSS file using eight CSS custom properties for theming. The codebase uses lazy loading extensively via `React.lazy()` for 14 route-level components, with `LoginModal`, `SaveBookmarkModal`, `UserMenu`, `ElectionTypeToggle`, `Disclaimer`, and `ErrorBoundary` imported eagerly in `App.tsx`. State management is handled through two React context providers (`AuthContext.tsx` and `StateContext.tsx`) and component-local state. The prediction engine lives in `engine/predictionEngine.ts` as a pure TypeScript module consumed by `useMemo` hooks in `App.tsx` at lines 129–155.

The work is organized into six phases: Phase 0 validates the toolchain and calibrates effort through a LoginModal reference migration; Phase 1 establishes the Tailwind CSS 4.x foundation and design token system without visible changes; Phase 2 replaces native HTML interactive elements with Radix UI primitives, achieving Lighthouse Accessibility 100; Phase 3 inverts all component layouts to mobile-first; Phase 4 adds animation and micro-interactions via the Motion library; Phase 5 optimizes performance and validates against Lighthouse targets. Each phase produces a deployable increment.

---

## 2. Technology Stack Summary

The frontend runs on **React 19.2.4** with **React DOM 19.2.4**, using the `@vitejs/plugin-react` 6.0.1 plugin for JSX transformation. The router is **React Router DOM 7.14.1** providing client-side routing with path-based patterns like `/state/:stateName/overview`, `/state/:stateName/predictions`, and `/national`. The bundler is **Vite 8.0.4** configured in `vite.config.js` with manual chunk splitting that separates Firebase, Recharts (including d3 sub-packages), and vendor (React, React DOM, React Router) into distinct chunks. The build target is ES2020. The dev server runs on port 5173 with a proxy forwarding `/api` to `http://api:8000`.

**TypeScript 6.0.3** is configured in `tsconfig.json` with `strict: false` but `strictNullChecks: true`, `allowJs: true`, and `checkJs: false`. This means `.jsx` files are allowed alongside `.tsx` files without type-checking — the codebase currently has 23 `.jsx` component files and 5 `.tsx` files (`App.tsx`, `ErrorBoundary.tsx`, `AuthContext.tsx`, `StateContext.tsx`, `predictionEngine.ts`). The `moduleResolution` is set to `bundler` and no path aliases are configured — all imports use relative paths like `../contexts/AuthContext`.

**Recharts 2.15.3** provides all data visualization (bar charts, line charts, pie charts) wrapped in `ResponsiveContainer` for width adaptation. **react-simple-maps 3.0.0** renders the India map on the national dashboard. **Firebase 11.x** handles phone authentication (RecaptchaVerifier, signInWithPhoneNumber) and Google sign-in (signInWithPopup), configured in `firebase.js` with environment variables from `import.meta.env`. **Sentry React 10.50.0** provides error tracking initialized in `main.jsx` with browser tracing at 0.1 sample rate.

The **testing stack** consists of Vitest 3.0 configured in `vite.config.js` with jsdom environment and globals enabled, plus Testing Library React 16.0 and jest-dom 6.0 for component testing assertions. Coverage uses `@vitest/coverage-v8`. Currently only two test files exist: `__tests__/api.test.ts` (API client unit tests) and `engine/__tests__/predictionEngine.test.ts` (prediction engine unit tests).

**Linting** uses ESLint 9.39 with separate configurations for JS/JSX and TS/TSX files, including react-hooks and react-refresh plugins. **Formatting** uses Prettier 3.8 enforced through Husky 9.1 pre-commit hooks via lint-staged 16.4 that runs Prettier on staged JS/JSX/TS/TSX files.

The **CSS architecture** is a single `index.css` file of approximately 2300 lines using eight CSS custom properties (`--bg`, `--bg2`, `--text`, `--text-muted`, `--accent`, `--border`, `--sans`, `--mono`) defined in `:root`. The file uses a desktop-first responsive strategy with four `max-width` media queries at 900px (tablet), 600px (mobile), 380px (very small phones), and 768px (national dashboard). There are no CSS modules, no PostCSS plugins, and no CSS-in-JS — all styling is plain CSS with class-based selectors.

The **backend** is a FastAPI application in `api/main.py` that sets security headers including Content-Security-Policy at line 250. The CSP currently allows scripts from `self`, Google APIs, Firebase, and gstatic; styles from `self` with `unsafe-inline`; connections to Google APIs, Firebase, and Identity Toolkit; and frames from Google accounts and Firebase. Plausible analytics is not yet allowed in the CSP despite the script tag existing in `index.html`.

---

## 3. Phase-by-Phase Implementation

### Phase 0: Proof of Concept Spike — Validate Toolchain and Calibrate Effort

#### Phase Header

Phase 0 validates all critical assumptions before committing to the full migration. It verifies Tailwind 4.x compatibility with Vite 8, measures the actual production bundle size, migrates LoginModal as an end-to-end reference implementation exercising Tailwind + Radix Dialog + Motion, catalogs existing mobile CSS rules, and calibrates effort estimates for subsequent phases. This phase has no dependencies on other phases and must complete before any other phase begins.

#### Prerequisites

The developer must have Node.js installed matching the project's requirements. The existing frontend must build and run successfully via `npm run dev` and `npm run build`. Access to Chrome DevTools for bundle analysis is required. The Tailwind CSS IntelliSense VS Code extension should be installed for v4 syntax support verification.

#### Step-by-Step Breakdown

**Step 0.1: Measure the actual production bundle.**

Run `npm run build` (which executes `vite build`) in the `frontend/` directory and record the exact gzipped sizes of every output chunk. The current `vite.config.js` at lines 14–22 defines three manual chunks: `firebase` (matching `node_modules/firebase`), `recharts` (matching `node_modules/recharts` and `node_modules/d3-`), and `vendor` (matching `node_modules/react-router`, `node_modules/react-dom`, and `node_modules/react/`). Record the main chunk, each named chunk, and any additional auto-split chunks. Sum for the total initial JavaScript payload. This number replaces the estimated 165KB baseline from the strategic plan and determines the real headroom within the 300KB gzipped budget. Save measurements in a file at `frontend/BUNDLE-BASELINE.md` for future comparison. No code changes are required for this step.

To verify this step is complete: a `BUNDLE-BASELINE.md` file exists in `frontend/` with exact byte counts for each chunk and a total gzipped size.

**Step 0.2: Verify Tailwind 4.x and Vite 8 compatibility.**

Install `tailwindcss` and `@tailwindcss/vite` as dev dependencies in `frontend/package.json` using `npm install --save-exact -D tailwindcss @tailwindcss/vite` to pin exact versions without `^` ranges. All new dependencies added during this migration must use exact version pinning — either use the `--save-exact` flag (or `--save-exact -D` for dev dependencies) or manually remove the `^` prefix from the version in `package.json` after installation. This policy applies to every `npm install` command in every phase of this migration. Pinning existing dependencies that already use `^` ranges is out of scope for this migration and should be addressed as a separate maintenance task. Add the Tailwind Vite plugin to `vite.config.js` by importing `tailwindcss` from `@tailwindcss/vite` and adding it to the `plugins` array alongside the existing `react()` plugin. Create a new CSS entry file at `frontend/src/app.css` that imports Tailwind's base layer with `@import "tailwindcss"`. Add `@theme` block in this file with a single test token (e.g., `--color-accent: #7ae0ff`) to validate that the `@theme` directive works with Vite 8. Import this new `app.css` in `main.jsx` alongside the existing `index.css` import — both stylesheets must coexist during the migration period. Verify that `npm run dev` starts without errors, that Hot Module Replacement works when changing a Tailwind utility class, and that existing styles from `index.css` are not disrupted by Tailwind's Preflight reset. If Preflight conflicts with existing styles (likely for `h1`–`h6`, `button`, `a`, and `table` elements), configure Tailwind to disable Preflight by adding `@layer base { }` overrides or using the `@import "tailwindcss" layer(utilities)` import strategy that skips base resets.

Verify the Tailwind CSS IntelliSense VS Code extension provides autocomplete for v4 syntax including `@theme` tokens. If the extension does not support v4 yet, document this limitation and proceed with manual utility class entry.

To verify this step is complete: `npm run dev` runs without errors, existing pages render identically, and adding a `className="text-accent"` to any element applies the custom `#7ae0ff` color.

**Step 0.3: Migrate LoginModal as a reference implementation.**

This step exercises every technology in the proposed stack on a single, contained component. The current `LoginModal.jsx` (in `frontend/src/components/`) is a 200+ line component that renders a modal overlay with phone authentication (country code selector, phone number input, OTP six-box input, reCAPTCHA) and Google sign-in. It uses CSS classes from `index.css` including `modal-overlay`, `modal-content`, `modal-close`, `modal-error`, `modal-label`, `modal-input`, `otp-boxes`, `otp-box`, and `country-selector`.

First, install the Radix Dialog primitive with exact version pinning: `npm install --save-exact @radix-ui/react-dialog`. Create a Shadcn-style Dialog wrapper component at `frontend/src/components/ui/dialog.tsx`. This file should export named subcomponents (`Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogClose`, `DialogOverlay`, `DialogPortal`) that wrap the corresponding Radix primitives and apply Tailwind utility classes for styling. The overlay should use `fixed inset-0 bg-black/60 backdrop-blur-sm` for the dark overlay effect matching the current `modal-overlay` style. The content should use `fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2` for centering, with `w-full max-w-md mx-4` for responsive width, `bg-[#1a1a2e] rounded-xl border border-[#2a2a40] p-6` for the dark card appearance matching current `modal-content` styles.

Then, install the Motion library with exact version pinning: `npm install --save-exact motion`. Wrap the `DialogContent` in a `motion.div` with entrance animation (`opacity: 0 → 1`, `scale: 0.95 → 1`, `duration: 200ms`) and exit animation (`opacity: 1 → 0`, `scale: 1 → 0.95`, `duration: 150ms`) using `AnimatePresence` for mount/unmount coordination.

Rename `LoginModal.jsx` to `LoginModal.tsx` and refactor it to use the new Dialog wrapper instead of the raw `div.modal-overlay` / `div.modal-content` structure. The `onClose` prop maps to `Dialog`'s `onOpenChange` callback. The `showLogin` state in `App.tsx` (line 55) becomes the controlled `open` prop. Preserve all Firebase authentication logic unchanged — the country code selector, phone input, OTP flow, reCAPTCHA verifier setup, Google sign-in, and consent checkbox must function identically. The key structural change is wrapping the modal body in `<Dialog open={showLogin} onOpenChange={setShowLogin}>` with `<DialogContent>` replacing the `div.modal-content`, gaining focus trapping, Escape-to-close, and `aria-describedby` for free from Radix.

Write Playwright tests for the migrated LoginModal. Install `@playwright/test` and `@axe-core/playwright` as dev dependencies with exact version pinning: `npm install --save-exact -D @playwright/test @axe-core/playwright`. Create a Playwright config at `frontend/playwright.config.ts` with projects for Chromium, Firefox, and WebKit, with mobile viewport presets for 375px and 390px width. Write tests verifying: the dialog traps focus within its content when open, pressing Escape closes the dialog, the dialog has proper `role="dialog"` and `aria-modal="true"` attributes, focus returns to the trigger element (Sign In button) when the dialog closes, and axe-core reports zero accessibility violations on the dialog.

To verify this step is complete: LoginModal opens and closes with animation, phone auth and Google sign-in work identically to before, Playwright tests pass, and axe-core reports zero violations on the modal.

**Step 0.4: Calibrate effort estimates.**

Based on the time taken for the LoginModal migration in Step 0.3, calculate the per-component effort for structural migrations (Radix primitive replacement), the per-component effort for styling-only migrations (Tailwind className replacement), and the Playwright test writing overhead per component. Update the phase effort estimates: the strategic plan estimates 10–16 weeks total, and these measured values may adjust that range. Document findings in `frontend/MIGRATION-ESTIMATES.md`. If the spike reveals that Tailwind 4.x or Radix introduces unexpected issues, document them and decide whether to proceed, adjust, or abandon the migration.

To verify this step is complete: `MIGRATION-ESTIMATES.md` exists with measured per-component effort and updated total estimates.

**Step 0.5: Inventory existing mobile CSS rules.**

Catalog every CSS rule inside the four responsive media query blocks in `index.css`: the 900px block (lines 1467–1492, approximately 25 rules for tablet layout), the 600px block (lines 1494–1742, approximately 250 rules for mobile layout), the 380px block (lines 1744–1779, approximately 35 rules for very small phones), and the 768px block (lines 2232–2266, approximately 35 rules for national dashboard). For each rule, document: the CSS selector, the component it affects (map each class name to its component file by searching the `components/` and `widgets/` directories), the visual behavior it controls, and whether the behavior maps to a standard Tailwind responsive utility or requires custom CSS. Save this inventory as `frontend/MOBILE-CSS-INVENTORY.md`. This inventory prevents losing refined mobile-specific adjustments when they are replaced by Tailwind utilities in Phase 3. This step can run in parallel with Steps 0.2 and 0.3.

To verify this step is complete: `MOBILE-CSS-INVENTORY.md` contains an entry for every rule in all four media query blocks.

#### Phase Deliverables

A validated Tailwind 4.x + Vite 8 integration running alongside the existing CSS. A fully migrated LoginModal using Radix Dialog, Tailwind utilities, and Motion animation with Playwright tests. Measured production bundle baseline. Mobile CSS inventory. Calibrated per-component effort estimates.

#### Phase Risks and Mitigations

The primary risk is that Tailwind 4.x's Vite plugin conflicts with the existing `@vitejs/plugin-react` or produces CSS that clashes with `index.css` base styles. Mitigation: Tailwind's Preflight can be disabled during the migration period. If the Vite plugin itself fails, Tailwind 4.x can alternatively be used via its PostCSS plugin (`@tailwindcss/postcss`) by adding a `postcss.config.js` to the project root. A secondary risk is that Radix Dialog's focus trapping interferes with the Firebase reCAPTCHA verifier, which dynamically injects an iframe. Mitigation: use Radix Dialog's `onOpenAutoFocus` to delay focus trapping until after the reCAPTCHA container is rendered, or configure the reCAPTCHA to use an invisible variant that does not require focus.

---

### Phase 1: Foundation — Tailwind CSS 4.x Integration and Design Token System

#### Phase Header

Phase 1 establishes the complete styling infrastructure — Tailwind CSS configuration, design tokens, CSS bridge, and dark mode detection — without changing any visible UI. This foundation enables all subsequent phases. It depends on Phase 0 completion (validated toolchain).

#### Prerequisites

Phase 0 must be complete: Tailwind 4.x confirmed working with Vite 8, bundle baseline measured, LoginModal reference implementation validated. The `@tailwindcss/vite` plugin and `tailwindcss` package must be installed (done in Phase 0 Step 0.2).

#### Step-by-Step Breakdown

**Step 1.1: Finalize Tailwind CSS 4.x configuration in the Vite pipeline.**

Building on the Phase 0 proof-of-concept, finalize the Tailwind configuration in `vite.config.js`. The plugin was added in Step 0.2; now ensure it is positioned correctly in the plugins array (Tailwind should process before React). In `frontend/src/app.css`, set up the complete Tailwind import structure:

The `@import "tailwindcss"` directive brings in all three layers (base, components, utilities). If Preflight was disabled during Phase 0, it remains disabled until Phase 3 completion when the old `index.css` is deleted. Verify that `app.css` is imported in `main.jsx` before `index.css` so that Tailwind's base layer can be overridden by existing styles during the migration period.

The connection to the rest of the system: `main.jsx` currently imports `./index.css` at line 5. Add `import './app.css'` before that import. All components will be able to use Tailwind utility classes immediately via `className` attributes without any per-component configuration.

To verify: `npm run dev` starts cleanly, and adding `className="p-4"` to any element applies 1rem padding.

**Step 1.2: Define the comprehensive design token system.**

In `frontend/src/app.css`, define the full token system within the `@theme` block. The tokens must map to the existing visual design to maintain consistency during migration.

Colors: Define a primary scale (teal/cyan family matching the current `--accent: #7ae0ff`) from primary-50 (lightest) through primary-900 (darkest). Define a neutral scale for the dark theme: neutral-950 as `#0f0f1a` (current `--bg`), neutral-900 as `#1a1a2e` (current `--bg2`), neutral-800 as `#2a2a40` (current `--border`), neutral-400 as `#a0a0a0` (current `--text-muted`), neutral-200 as `#e0e0e0` (current `--text`). Define surface colors for elevated cards matching the current `#1a1a2e` backgrounds used throughout. Define semantic colors: success (green), warning (amber), error (red), info (blue) — each with a base and muted variant.

Typography: Define fluid font sizes using `clamp()` for responsive scaling without media queries. Map to the current sizing: text-xs at `clamp(0.6875rem, 0.65rem + 0.1vw, 0.75rem)` (11–12px), text-sm at `clamp(0.75rem, 0.7rem + 0.15vw, 0.8125rem)` (12–13px), text-base at `clamp(0.8125rem, 0.75rem + 0.2vw, 0.875rem)` (13–14px), text-lg at `clamp(0.875rem, 0.8rem + 0.25vw, 1rem)` (14–16px), text-xl at `clamp(1rem, 0.9rem + 0.3vw, 1.25rem)` (16–20px), text-2xl at `clamp(1.25rem, 1.1rem + 0.4vw, 1.5rem)` (20–24px), text-3xl at `clamp(1.5rem, 1.3rem + 0.5vw, 1.75rem)` (24–28px). The current header h1 is 28px at desktop and 18px at 600px — the fluid `text-3xl` should handle this without a media query.

Spacing: Use Tailwind's default 4px-based scale — spacing-0.5 (2px) through spacing-16 (64px). No custom spacing tokens needed; Tailwind's built-in scale (`p-1` = 4px, `p-2` = 8px, etc.) matches the current design's patterns.

Elevation: Define shadow tokens — shadow-sm for subtle card borders, shadow-md for elevated cards matching the current `box-shadow: 0 4px 12px rgba(0,0,0,0.4)` used in `.map-tooltip`, shadow-lg for modals, shadow-xl for popovers.

Border radius: Define radius tokens — rounded-sm (4px), rounded-md (6px, matching the current `border-radius: 6px` on nav buttons), rounded-lg (8px, matching current card radii), rounded-xl (10px, matching `.stat-card`), rounded-2xl (12px for redesigned cards in Phase 3).

The connection: once defined in `@theme`, all tokens are available as Tailwind utilities throughout the codebase. For example, `bg-neutral-950` applies the current `--bg` color, `text-neutral-200` applies the current `--text` color. Components migrated in Phases 2–3 will use these utilities instead of CSS classes.

To verify: create a temporary test element in any component with `className="bg-neutral-950 text-neutral-200 p-4 rounded-lg shadow-md"` and confirm it renders with the correct dark background, light text, padding, border radius, and shadow matching the current design.

**Step 1.3: Create the CSS bridge for incremental migration.**

Create a mapping file at `frontend/src/bridge.css` that defines the existing CSS custom properties in terms of Tailwind tokens, ensuring both systems resolve to identical values. The bridge maps each of the eight existing CSS custom properties to its Tailwind equivalent:

`--bg` → `theme(colors.neutral.950)`, `--bg2` → `theme(colors.neutral.900)`, `--text` → `theme(colors.neutral.200)`, `--text-muted` → `theme(colors.neutral.400)`, `--accent` → `theme(colors.primary.400)`, `--border` → `theme(colors.neutral.800)`, `--sans` → `theme(fontFamily.sans)`, `--mono` → `theme(fontFamily.mono)`.

Import `bridge.css` in `main.jsx` between `app.css` and `index.css`. This ensures that any existing CSS rules using `var(--bg)` resolve to the same color as Tailwind's `bg-neutral-950` utility, preventing visual inconsistency during the migration period.

Set a firm deadline: the bridge and the old `index.css` must both be deleted at the end of Phase 3. To enforce this, add an ESLint rule after Phase 3 that flags any `className` string containing a non-Tailwind CSS class name. Alternatively, add a CI script that greps JSX/TSX files for the old class names (e.g., `modal-overlay`, `pred-panel`, `filters`, `panel`, `loading`) and fails the build if any are found.

To verify: change the `--bg` value in `bridge.css` to a vivid color like red, and confirm that both old CSS-class-styled elements and new Tailwind-styled elements change to the same red — proving both systems read from the same source.

**Step 1.4: Configure dark mode and system preference detection.**

Configure Tailwind's dark mode in `app.css` using the `class` strategy: `@variant dark (&:where(.dark, .dark *))`. This allows a future light mode toggle while defaulting to dark. Add a blocking inline script in `frontend/index.html` in the `<head>` before any stylesheets:

The script should read `localStorage.getItem('theme')` and fall back to `window.matchMedia('(prefers-color-scheme: dark)').matches`. If the result is dark (or no preference is stored, since the app is dark-by-default), add the `dark` class to `document.documentElement`. This must be a synchronous inline script to prevent flash of wrong theme (FOWT).

Add the `dark` class to the `<html>` element as a default in `index.html` to ensure dark mode renders correctly even before the script executes.

To verify: the application renders identically to its current appearance with the `dark` class applied. Removing the `dark` class from `<html>` in DevTools should show Tailwind's light mode defaults on any elements styled with `dark:` variants (which will be none at this point — this is infrastructure for the future).

#### Phase Deliverables

A fully configured Tailwind CSS 4.x installation with approximately 60 design tokens covering colors, typography, spacing, elevation, and border radius. A CSS bridge ensuring visual consistency during incremental migration. Dark mode infrastructure ready for both system preference detection and manual toggle. Zero user-visible changes.

#### Phase Risks and Mitigations

The primary risk is token value mismatches between the bridge and the actual rendering — a `--bg` value defined in the bridge might not exactly match what the current `index.css` `:root` defines if the Tailwind theme resolution works differently than expected. Mitigation: write a Playwright test that renders a reference element with both the old `className="app"` (styled by `index.css`) and a new `className="bg-neutral-950"` (styled by Tailwind) and compares their computed `background-color` values — they must be identical. A secondary risk is that the `@theme` block syntax or `theme()` function in `bridge.css` behaves differently in Tailwind 4.x compared to documentation (the API is still relatively new). Mitigation: the Phase 0 spike already validated basic `@theme` usage; Phase 1 extends it, and any issues will surface immediately on `npm run dev`.

---

### Phase 2: Accessibility Foundation — Radix UI Primitives for Core Interactive Patterns

#### Phase Header

Phase 2 replaces native HTML interactive elements with Radix UI primitives that provide structural accessibility, directly resolving the Lighthouse audit findings: zero ARIA attributes, four unlabeled selects, missing table scope attributes, suppressed focus styles, and 14 touch targets below 44px. This phase delivers Lighthouse Accessibility 100. It depends on Phase 1 completion (Tailwind tokens available for styling Radix components).

#### Prerequisites

Phase 1 complete: Tailwind CSS operational with full design token system and CSS bridge. The Radix Dialog primitive and Motion library are already installed from Phase 0 Step 0.3. The Shadcn-style Dialog component at `components/ui/dialog.tsx` already exists from Phase 0 Step 0.3.

#### Step-by-Step Breakdown

**Step 2.1: Install remaining Radix UI primitive packages.**

Add the following production dependencies to `frontend/package.json` using exact version pinning: `npm install --save-exact @radix-ui/react-slider @radix-ui/react-tabs @radix-ui/react-select @radix-ui/react-toggle-group @radix-ui/react-tooltip @radix-ui/react-collapsible @radix-ui/react-visually-hidden`. The `--save-exact` flag ensures versions are pinned without `^` ranges, consistent with the version pinning policy established in Phase 0 Step 0.2. After installation, verify that `package.json` entries for all Radix packages show exact versions (e.g., `"1.2.3"` not `"^1.2.3"`). These are imported selectively (not a monolithic package), so only the primitives used in the application contribute to the bundle. Verify installation with `npm install` and confirm no peer dependency conflicts with React 19.2.

To verify: `npm install` completes without errors, and `node -e "require('@radix-ui/react-slider')"` executes without error.

**Step 2.2: Migrate SaveBookmarkModal to Radix Dialog.**

The current `SaveBookmarkModal.jsx` at `frontend/src/components/SaveBookmarkModal.jsx` uses the same `modal-overlay` / `modal-content` CSS pattern as LoginModal. It is currently imported eagerly in `App.tsx` at line 19 (`import SaveBookmarkModal from './components/SaveBookmarkModal'`). During migration, convert this to a lazy import: `const SaveBookmarkModal = lazy(() => import('./components/SaveBookmarkModal'))`. This avoids adding the Radix Dialog JavaScript to the initial bundle since `SaveBookmarkModal` is only rendered when `showSave` is true (controlled by the `onClick` handler on the "Save Prediction" button at approximately line 492 of `App.tsx`).

Rename `SaveBookmarkModal.jsx` to `SaveBookmarkModal.tsx`. Refactor it to use the existing Shadcn Dialog wrapper from `components/ui/dialog.tsx` (created in Phase 0). The `onClose` prop maps to `DialogClose` or the `onOpenChange` callback. The `showSave` state in `App.tsx` (line 56) becomes the controlled `open` prop on the `Dialog` root. Preserve all bookmark save logic: title input, description textarea, public toggle, API call to `api.createBookmark()`, error display, and the `onSaved` callback.

Add TypeScript types to the component props: `{ params: AppPredictionParams; stateName: string; onClose: () => void; onSaved?: (bookmark: Bookmark) => void }`. Import `AppPredictionParams` from `../types` and `Bookmark` from `../types`.

Write Playwright tests verifying: focus traps within the dialog when open, the Title input receives focus on open (not the close button), pressing Escape closes without saving, submitting with an empty title shows a validation error that is associated to the input via `aria-describedby`, and axe-core reports zero violations.

To verify: the Save Prediction dialog opens with focus on the title input, traps focus, closes on Escape, saves correctly, and all Playwright accessibility tests pass.

**Step 2.3: Create Shadcn-style Slider component and migrate prediction controls.**

Create `frontend/src/components/ui/slider.tsx` wrapping Radix Slider primitives (`Slider.Root`, `Slider.Track`, `Slider.Range`, `Slider.Thumb`). Style the track with `h-2 w-full rounded-full bg-neutral-800`, the range with `h-full rounded-full bg-primary-400`, and the thumb with `block h-6 w-6 rounded-full bg-white shadow-md` (24px diameter; add a `touch-action: none` on the Root container and ensure the effective touch target is at least 44px via padding or a larger hit area on the thumb). The `touch-action: none` must be scoped only to the slider container — it prevents pan/zoom gestures from interfering with slider drag but must not affect the rest of the page.

The critical integration challenge is the type mismatch between Radix Slider and the current prediction engine. Currently, `PredictionPanel.jsx` at line 67 reads slider values via `onChange={(e) => update('antiIncumbencyPct', +e.target.value)}`, where `e` is a `ChangeEvent<HTMLInputElement>` and `e.target.value` is a string. Radix Slider's `onValueChange` callback receives `number[]` (to support multi-thumb sliders). The Slider wrapper component must normalize this: accept a single `value: number` prop and an `onValueChange: (value: number) => void` callback. Internally, pass `[value]` to Radix's `value` prop and extract `values[0]` from the `onValueChange` array, calling the user's callback with the single number.

In `PredictionPanel.jsx`, the `update` callback at line 16 already receives a key and a value and calls `onChange({ ...params, [key]: value })`. The `onChange` prop comes from `App.tsx` where it maps to `setPredParams` (passed at approximately line 500). So the refactoring is contained: replace `<input type="range" ... onChange={(e) => update('key', +e.target.value)} />` with `<Slider value={params.key} onValueChange={(v) => update('key', v)} min={0} max={100} step={1} />`. The value flow remains the same: `PredictionPanel` calls `onChange` with updated params → `App.tsx` `setPredParams` updates state → `useMemo` hooks recompute `baseline` and `predictions` → charts re-render.

Rename `PredictionPanel.jsx` to `PredictionPanel.tsx` during this migration. Add TypeScript types for the component props: `{ params: AppPredictionParams; onChange: (params: AppPredictionParams) => void; presets: AffinityPresets; topParties: string[] }`.

Migrate all `<input type="range">` elements in PredictionPanel: anti-incumbency slider, turnout slider, new party vote share slider, and each affinity weight slider (one per party in the `affinityKeys` array). Each slider gains ARIA attributes automatically from Radix: `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and `aria-orientation`. Add `aria-label` attributes describing each slider's purpose (e.g., "Anti-incumbency factor percentage").

Write Playwright tests for each slider verifying: `aria-valuemin`, `aria-valuemax`, and `aria-valuenow` reflect correct values; keyboard arrow key presses increment/decrement the value by the step amount; the thumb meets 44px minimum touch target size; and axe-core reports zero violations.

To verify: all prediction sliders render with Radix primitives, keyboard navigation works (arrow keys adjust values), ARIA attributes are present, and prediction engine output is identical for the same input parameters.

**Step 2.4: Create Shadcn-style Tabs component and migrate navigation.**

Create `frontend/src/components/ui/tabs.tsx` wrapping Radix Tabs primitives (`Tabs.Root`, `Tabs.List`, `Tabs.Trigger`, `Tabs.Content`). Style the tab list with horizontal layout, and each trigger with minimum 44px height for touch targets. Active triggers use the existing accent color (`bg-primary-400 text-black` matching the current `nav button.active` style of `background: var(--accent); color: #000`).

Migrate the state-level navigation in `App.tsx` (lines 285–330). The current `<nav>` contains four buttons: "State Overview", "Constituencies", "Prediction", and "Community". Each button uses `navigate()` on click and applies the `active` class based on path matching. Replace this with a Radix Tabs component where each tab trigger maps to a route and each tab content is handled by React Router (the tabs serve as navigation, not content containers). The `value` prop on `Tabs.Root` is derived from the current route path. The `onValueChange` callback calls `navigate()` with the corresponding route path. This gives the navigation proper `role="tablist"` and `role="tab"` semantics, arrow key navigation between tabs, and `aria-selected` state management.

Also migrate the national dashboard tabs in `NationalDashboard.jsx`. The current `.national-tabs` div contains `.tab-btn` buttons for "Overview", "Parties", "Compare", and "Timeline". Replace these with Radix Tabs where each trigger maps to a sub-route and tab content is managed by the component's state or React Router.

On mobile viewports (below 768px), the tab list styling will be changed in Phase 3 Step 3.5 to render as a fixed bottom navigation bar. For now, keep the horizontal tab layout but ensure touch targets are 44px minimum height.

To verify: the navigation renders with `role="tablist"` on the container and `role="tab"` on each trigger; arrow key navigation cycles between tabs; `aria-selected="true"` is set on the active tab; and clicking a tab navigates to the correct route.

**Step 2.5: Create Shadcn-style Select component and migrate dropdowns.**

Create `frontend/src/components/ui/select.tsx` wrapping Radix Select primitives (`Select.Root`, `Select.Trigger`, `Select.Value`, `Select.Content`, `Select.Item`, `Select.ItemText`, `Select.Viewport`, `Select.ScrollUpButton`, `Select.ScrollDownButton`). Style the trigger with dark background matching current select styling (`bg-[#1e1e1e] border border-neutral-800 text-neutral-200 rounded-md`), and the content popover with elevated dark panel styling.

Migrate the four select elements identified in the Lighthouse audit as lacking labels:

1. **State selector** in `App.tsx` at approximately line 275: `<select value={selectedState} onChange={...}>`. This is inside a `div.state-selector` with no associated label. Replace with Radix Select, adding a `Label` component (using Radix's `Select.Label` or a `<label>` with `htmlFor`) with text "Select state" — visually hidden using Radix's `VisuallyHidden` component if the label should not be displayed but must be present for screen readers.

2. **Sort select** in `CommunityFeed.jsx`: the `<select value={sort} onChange={...}>` for sorting predictions by "recent", "popular", etc. Add a label "Sort by".

3. **Control group selects** in `NationalDashboard.jsx`: the `.control-group select` elements for filtering. Each has a label element above it (`<label>` inside `.control-group`) but they are not semantically associated. Replace with Radix Select components where the label is built into the primitive.

4. Any additional unlabeled select elements discovered during migration — search all `.jsx` and `.tsx` files for `<select` tags without associated labels.

For each migrated select, write Playwright tests verifying: the select has an accessible name (via label association or `aria-label`); the popover opens on click and Enter; arrow keys navigate between options; selecting an option closes the popover and updates the value; and axe-core reports zero violations.

To verify: all four (or more) select elements have proper label associations, keyboard navigation works, and Lighthouse no longer flags unlabeled form elements.

**Step 2.6: Add global accessibility infrastructure.**

This step adds page-level accessibility features that no component library provides — landmarks, skip navigation, table semantics, and focus styles.

Add a **skip navigation link** as the first child of `<body>` (or the first child of the `#root` div in `App.tsx`). The link targets `#main-content` and reads "Skip to main content". Style it as visually hidden by default but visible on focus using `sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-neutral-900 focus:text-primary-400 focus:px-4 focus:py-2 focus:rounded` (Tailwind utilities).

Add **ARIA landmarks** to `App.tsx`: add `role="banner"` to the `<header>` element, add `id="main-content" role="main"` to the `<main>` element, add `role="navigation" aria-label="Main navigation"` to the `<nav>` element. These are structural HTML attributes that take seconds to add but significantly improve screen reader navigation.

Fix the **constituency table** accessibility. The table is rendered in `ConstituencyList.jsx` and `PredictionConstituencyTable.jsx`. Add `<caption>` elements describing the table content (e.g., "Constituency election results for Tamil Nadu"). Add `scope="col"` to all `<th>` elements in the header row. If any `<th>` elements exist in the body rows (for constituency names), add `scope="row"`. These changes resolve the second Lighthouse accessibility failure about `th` elements without scope attributes.

Replace **suppressed focus styles** across the codebase. Search `index.css` for any rules that set `outline: none` or `outline: 0` on interactive elements (buttons, links, inputs). Replace these with visible `focus-visible` styles: `outline: 2px solid var(--accent); outline-offset: 2px`. In the Tailwind world, this is `focus-visible:outline-2 focus-visible:outline-primary-400 focus-visible:outline-offset-2`. During the migration period, add these focus styles in `index.css` so they apply to both migrated and unmigrated components.

This step can run in parallel with Steps 2.2 through 2.5 because it modifies different parts of the codebase (page-level HTML attributes rather than component structure).

To verify: the skip link is visible when focused via keyboard Tab; screen readers announce landmarks (banner, main, navigation); constituency table headers have `scope` attributes and a `caption`; all interactive elements show a visible focus ring on keyboard focus; and Lighthouse Accessibility score reaches 100.

#### Phase Deliverables

All modals use Radix Dialog with focus trapping and ARIA attributes. All sliders use Radix Slider with keyboard navigation and ARIA value attributes. Navigation uses Radix Tabs with proper tablist semantics. All selects have associated labels. Page has skip link, ARIA landmarks, and table semantics. Focus styles are visible on all interactive elements. Lighthouse Accessibility score: 100. Vitest coverage-v8 reports at least 80% line coverage for all new Shadcn-style components in `components/ui/` (dialog.tsx, slider.tsx, tabs.tsx, select.tsx).

#### Phase Risks and Mitigations

The highest risk is the Radix Slider migration breaking the prediction engine's tight coupling with slider values. The `useMemo` hooks in `App.tsx` at lines 129–155 depend on `predParams.antiIncumbencyPct`, `predParams.turnoutPct`, and `growthFactor` — if the Radix Slider adapter introduces floating-point precision differences (e.g., 50 becomes 50.00000001), the memoization comparison may behave differently. Mitigation: ensure the adapter rounds values to integers before passing them upstream, matching the `step={1}` configuration on all percentage sliders. Write an integration test that sets specific slider values via keyboard and verifies the exact `generateBaseline` output matches the pre-migration output for the same inputs.

A secondary risk is that Radix Select's popover content may be clipped by CSS `overflow: hidden` on ancestor elements. The current layout uses `overflow-x: auto` on several containers (`.pred-main`, `.table-scroll`). Mitigation: Radix Select renders its content via a Portal by default, placing it outside the DOM hierarchy of any clipping container.

---

### Phase 3: Mobile-First Layout Inversion

#### Phase Header

Phase 3 inverts all component layouts from desktop-first (base styles for 1400px, patched down via max-width queries) to mobile-first (base styles for 320px, enhanced up via min-width queries). This is the primary user-visible transformation. It depends on Phase 1 (Tailwind tokens) and Phase 2 (Radix components for some steps).

#### Prerequisites

Phase 1 complete: Tailwind tokens and CSS bridge operational. Phase 2 complete for Steps 3.2 and 3.5 (which depend on Radix Collapsible and Radix Tabs respectively). Steps 3.1, 3.3, 3.4, and 3.6 can begin as soon as Phase 1 is complete, in parallel with Phase 2.

#### Step-by-Step Breakdown

**Step 3.1: Invert the header layout for mobile-first.**

The current header in `App.tsx` (lines 228–334) consists of a `header` element containing a `div.header-top` with the title/subtitle on the left and `div.header-actions` on the right, followed by a `<nav>` with four route buttons. On desktop, this is a horizontal layout with `display: flex; justify-content: space-between`. At 600px (the current mobile breakpoint), the `header-actions` stacks vertically, but the title still wraps to four lines at 375px.

Redesign using Tailwind mobile-first utilities on the header JSX:

Base styles (mobile, 320px+): Stack the header vertically. Title uses `text-xl font-semibold` (fluid, not 28px). Subtitle uses `text-xs text-neutral-400`. The mode switcher (National/State Analysis toggle) renders as a full-width pair of buttons with `min-h-[44px]` for touch targets. The state selector and election type toggle render full-width below. The Sign In button renders full-width with `min-h-[44px]`.

At `md:` (768px+): Switch to horizontal layout with `md:flex-row md:items-center md:justify-between`. Title and subtitle share a row with action buttons. Mode switcher returns to compact inline style. State selector and election type toggle sit inline.

At `lg:` (1024px+): Title uses `lg:text-3xl`. Actions compress further into a single row.

Remove the corresponding CSS rules from `index.css` for `.header-top`, `.header-actions`, `.subtitle`, and their responsive overrides. Replace all `className` strings in the header JSX with Tailwind utilities.

To verify: at 375px viewport, the header stacks cleanly with no overlapping elements and all buttons are at least 44px tall. At 1280px, the header renders horizontally matching the current desktop layout. No CSS class names from `index.css` are used in the header JSX.

**Step 3.2: Invert the prediction panel layout with progressive disclosure.**

The current `PredictionPanel.jsx` renders all controls in a scrollable sidebar with CSS class `pred-panel`. At 900px (tablet breakpoint), the `pred-layout` flex direction changes to column and the panel takes full width.

Redesign for mobile-first: The `pred-layout` container (rendered in `App.tsx` at approximately line 500) uses `flex flex-col lg:flex-row` — stacked on mobile, side-by-side on large screens. The `pred-panel` uses `w-full lg:w-80 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto` — full-width and scrolling with the page on mobile, fixed sidebar on desktop.

Implement progressive disclosure using Radix Collapsible (installed in Step 2.1). Organize the prediction panel into three collapsible sections:

1. **Primary controls** (always visible, not collapsible): Anti-incumbency slider, turnout slider. These are the most commonly adjusted parameters.
2. **New party configuration** (collapsed by default on mobile, expanded on desktop): New party name, color, statewide vote share slider, and the preset selector. Wrap in `Collapsible.Root` with `Collapsible.Trigger` as an expandable header and `Collapsible.Content` for the body.
3. **Advanced controls** (collapsed by default on all viewports): Affinity weights grid and constituency overrides. Currently behind `showAffinity` and `showOverrides` state toggles in `PredictionPanel.jsx` (lines 10–11) — these existing toggles map directly to Collapsible components.

Use `lg:` breakpoint modifiers to expand sections on desktop: conditionally pass `defaultOpen={true}` to collapsible sections when the viewport is large (detect via a `useMediaQuery` hook or CSS-based conditional rendering). Alternatively, use `open` state initialized differently based on a media query match.

Rename `PredictionPanel.jsx` to `PredictionPanel.tsx` during this migration (if not already done in Step 2.3).

To verify: on 375px, only primary controls are visible by default; tapping section headers expands/collapses with smooth animation; on 1024px+, the panel renders as a sticky sidebar with all sections expanded.

**Step 3.3: Invert data table layouts to card-based mobile view.**

The constituency table in `ConstituencyList.jsx` currently renders a `<table>` with columns for constituency name, latest year, winner, party, margin, and trend. On mobile, the table scrolls horizontally — usable but not optimized.

Create a dual-view approach: on mobile (base styles), render a card-based list; on desktop (`md:` 768px+), render the current table. Use a CSS-based approach (not a media query hook) to show/hide the correct view: the card container uses `block md:hidden` and the table uses `hidden md:block`.

Each card renders: constituency name as the card title, latest winner and party as a subtitle with party color indicator (using the `partyColor()` function from `constants.ts`), margin as a badge, and a chevron indicating the card is tappable. Cards use `bg-neutral-900 rounded-xl border border-neutral-800 p-4 mb-2` styling. The card list is scrollable with no horizontal overflow.

For `PredictionConstituencyTable.jsx`, apply the same card-based mobile pattern. The prediction table shows more data (predicted winner, vote share, seat change) — the card should show constituency name, predicted winner with party color, and whether the seat flipped.

Migrate the `ConstituencyCard.jsx` widget in `frontend/src/widgets/` to use Tailwind utilities.

To verify: on 375px, constituencies render as a scrollable card list with no horizontal overflow; tapping a card navigates to the constituency detail; on 768px+, the full table renders with sticky first column.

**Step 3.4: Invert chart layouts for mobile-first.**

All Recharts components are used in `StateOverview.jsx`, `PredictionResults.jsx`, `PartyStrengthChart.jsx`, `NationalDashboard.jsx`, and `StateComparison.jsx`. Each currently wraps charts in `<ResponsiveContainer width="100%" height={300}>` (or similar fixed heights).

Apply mobile-first chart patterns:

1. Set responsive height using CSS on the chart container: `min-h-[200px] h-[40vh] max-h-[400px]` — this scales the chart height with the viewport on mobile while capping it on desktop.

2. Reposition legends: Recharts `<Legend>` defaults to top or right. On mobile, configure `verticalAlign="bottom"` and `align="center"` for all charts, placing legends below the chart area where they do not consume horizontal space.

3. Add tap-to-reveal tooltips: The current Recharts `<Tooltip>` uses hover, which does not work on touch devices. Add `trigger="click"` to tooltip configuration where supported by Recharts. For charts where Recharts does not support click-triggered tooltips natively, implement a custom tooltip component that toggles on bar/point click via Recharts' `onClick` handler on chart elements.

4. Reduce mobile data density: For line charts with many years of data, show only the most recent 3–5 elections by default on mobile (base styles) with a "Show all years" button that expands the dataset. Use the responsive `hidden md:block` pattern to show the full dataset on desktop.

5. Convert party comparison bar charts from vertical to horizontal on mobile for better readability on narrow screens: use `<BarChart layout="vertical">` in Recharts with responsive `layout` prop based on viewport.

To verify: charts render at appropriate height on 375px (approximately 40% of viewport height); legends appear below charts; tapping a chart element reveals a tooltip; full data is visible on desktop.

**Step 3.5: Implement bottom navigation for mobile.**

Create a new component at `frontend/src/components/BottomNav.tsx`. This component renders a fixed bottom navigation bar visible only on mobile viewports (`fixed bottom-0 left-0 right-0 md:hidden`). The bar has 56px height with `bg-neutral-950 border-t border-neutral-800 shadow-lg` styling.

Include four navigation items: National (map icon), Predictions (bar chart icon), Community (users icon), and Bookmarks (bookmark icon). Each item is a button with 44×44px minimum touch target, containing an SVG icon (16–20px) and a text label (10–11px). The active item uses `text-primary-400` (accent color) with a filled icon variant; inactive items use `text-neutral-400`.

Icons can be inline SVGs or sourced from a minimal icon library. Given the bundle budget constraints, inline SVGs are preferred over adding a full icon library like Lucide (which would add 20KB+). Create simple path-based SVG icons for the four destinations.

Connect the bottom nav to React Router: use `useLocation()` to determine the active tab, and `useNavigate()` to handle tab presses. Map each tab to its route: National → `/national`, Predictions → `/state/${selectedState}/predictions`, Community → `/state/${selectedState}/community`, Bookmarks → the bookmarks view.

In `App.tsx`, import `BottomNav` and render it outside the `<main>` element but inside the `<div className="app">` container. Add `pb-16 md:pb-0` to the main content area to prevent the bottom nav from overlapping page content on mobile.

Hide the top `<nav>` element on mobile when the bottom bar is active by adding `hidden md:block` to the `<nav>` in the header.

To verify: on 375px, the bottom nav is visible with four tappable icons; tapping each icon navigates to the correct route; the active icon is highlighted; the top nav is hidden on mobile; content does not overlap with the bottom bar.

**Step 3.6: Implement the community feed mobile redesign.**

The current `CommunityFeed.jsx` renders prediction cards with basic styling. Redesign for mobile-first using Tailwind utilities.

Each card uses `bg-neutral-900 rounded-2xl border border-neutral-800 p-4 shadow-md mb-3` for elevated appearance with 12px rounded corners. The card layout stacks vertically on mobile: author name and avatar (initials fallback using the first letter of the username) at top, prediction title and parameters summary in the middle, vote buttons (like/dislike) at the bottom as icon buttons with `min-w-[44px] min-h-[44px]` touch targets.

Add skeleton loading states: while `loading` is true, render 3–5 skeleton cards using `animate-pulse bg-neutral-800 rounded-2xl h-32 mb-3` placeholders. This replaces any "Loading..." text with a content-shaped skeleton that matches the final card layout.

Implement infinite scroll pagination: add an `IntersectionObserver` hook that triggers loading the next page of predictions when the user scrolls near the bottom of the feed. Currently `CommunityFeed.jsx` loads all predictions in a single API call (`api.listPublicBookmarks(sort)`). If the API supports pagination (check `api.ts` for offset/limit parameters), implement cursor-based loading. If not, the infinite scroll can be deferred to a future API enhancement and the current single-load approach retained.

To verify: community feed cards render with elevated styling, skeleton placeholders appear during loading, vote buttons are at least 44px, and the feed displays correctly at 375px width.

**Step 3.7: Delete the old index.css and remove the CSS bridge.**

After all components have been migrated to Tailwind utilities in Steps 3.1–3.6, delete `frontend/src/index.css` and `frontend/src/bridge.css`. Remove their imports from `main.jsx`. This is the firm deadline established in Phase 1 Step 1.3.

Run a search across all JSX/TSX files for any remaining references to CSS class names from the old stylesheet. Common class names to check: `modal-overlay`, `modal-content`, `pred-panel`, `pred-slider`, `filters`, `panel`, `loading`, `hero`, `app`, `header-top`, `header-actions`, `table-scroll`, `timeline-card`, etc. Any remaining references must be replaced with Tailwind equivalents before the files are deleted.

If using the ESLint enforcement approach from Step 1.3, enable the rule and verify the CI build passes with zero violations.

To verify: `index.css` and `bridge.css` are deleted, `main.jsx` imports only `app.css`, no component references old CSS class names, and the application renders correctly at all viewport sizes.

#### Phase Deliverables

All 24+ components styled with Tailwind utilities in a mobile-first paradigm. Bottom navigation for mobile. Card-based table views on mobile with full table on desktop. Progressive disclosure in prediction panel. Charts optimized for mobile touch and viewport. Old `index.css` deleted. The application is fully mobile-first. Vitest coverage-v8 reports at least 60% line coverage for all migrated existing components (BottomNav.tsx, PredictionPanel.tsx, ConstituencyList.tsx, CommunityFeed.jsx, and other migrated components).

#### Phase Risks and Mitigations

The highest risk is visual regression during the class-by-class migration of 24 components. Each component's CSS classes must be faithfully translated to Tailwind utilities without missing subtle styles (e.g., `transition: all 0.15s` on nav buttons, `letter-spacing: -0.5px` on the header title). Mitigation: use the Phase 0 mobile CSS inventory (Step 0.5) as a checklist, and take Playwright screenshots at 375px, 768px, and 1280px before and after each component migration for visual comparison. The card-based table view (Step 3.3) carries design risk — the card layout may not surface enough information for analyst workflows. Mitigation: retain the table view behind a toggle on mobile, letting users switch to the familiar table format if the card view is insufficient.

---

### Phase 4: Animation and Micro-Interaction Layer

#### Phase Header

Phase 4 adds purposeful motion design providing tactile feedback, improving perceived performance through skeleton states, and creating polished page transitions. It depends on Motion library installation (Phase 0 Step 0.3) and component migration completion (Phases 2–3). Estimated effort: 5–7 developer-days.

#### Prerequisites

The Motion library (`motion` package) is installed (from Phase 0). Components are migrated to Tailwind utilities and Radix primitives (Phases 2–3). The LoginModal already has Motion animation from Phase 0 Step 0.3 as a reference.

#### Step-by-Step Breakdown

**Step 4.0: Establish centralized animation configuration.**

Create `frontend/src/lib/motion.ts` to define shared animation constants, variants, and transition presets used across all components. This prevents animation definitions from being scattered as inline objects.

Define the following presets: a **page transition** variant with enter (`opacity: 0, y: 16` → `opacity: 1, y: 0`, duration 200ms, ease `easeOut`) and exit (`opacity: 1` → `opacity: 0`, duration 150ms); an **interactive feedback** preset with `whileTap: { scale: 0.97 }` using spring physics (stiffness 400, damping 15); a **slider thumb** preset with `whileTap: { scale: 1.2 }` using spring return; a **collapsible expand** preset using layout animation with 200ms duration; and a **modal entrance** preset (already used in the Phase 0 Dialog migration: `scale: 0.95 → 1, opacity: 0 → 1, duration: 200ms`).

Also define a **reduced motion** utility: a function that checks `window.matchMedia('(prefers-reduced-motion: reduce)').matches` and returns either the full animation preset or an instant transition (`duration: 0`) accordingly. All subsequent animation steps must use this utility to respect user preferences.

Export all presets as named exports for consumption by individual components.

To verify: importing any preset from `lib/motion.ts` works without errors, and the reduced motion utility correctly returns instant transitions when the system preference is active.

**Step 4.1: Implement page transition animations.**

In `App.tsx`, wrap the `<Routes>` content (inside `<Suspense>`) with Motion's `AnimatePresence` component. Each route element gets wrapped in a `motion.div` using the page transition variant from `lib/motion.ts`. Use the `key` prop from `useLocation().pathname` to trigger exit/enter animations when the route changes.

For the national dashboard's internal tab switching (Overview, Parties, Compare, Timeline), apply the same page transition variant to the tab content. The Radix Tabs component from Step 2.4 handles semantic tab switching; Motion adds the visual transition on the content.

Ensure that `AnimatePresence` uses `mode="wait"` so the exiting page completes its fade-out before the entering page fades in, preventing both pages from being visible simultaneously.

To verify: navigating between routes shows a subtle fade+slide-up transition; switching national dashboard tabs shows a smooth content transition; the transition completes within 200ms; and no layout shift occurs during the transition.

**Step 4.2: Implement interactive element feedback.**

Apply `whileTap: { scale: 0.97 }` from `lib/motion.ts` to all button elements throughout the application. This requires wrapping buttons in `motion.button` or using the `motion()` higher-order component. Start with the highest-impact buttons: mode switcher buttons (National/State Analysis), nav tab triggers, bottom nav items, vote buttons in community feed, Save Prediction button, and Sign In button.

For the Radix Slider thumbs, apply `whileTap: { scale: 1.2 }` to the thumb element. This is done in the Shadcn Slider wrapper at `components/ui/slider.tsx` — replace the `Slider.Thumb` render with `<motion.span asChild><Slider.Thumb ... /></motion.span>` or use Radix's `asChild` pattern with Motion.

Add subtle hover effects using Tailwind's `hover:` utilities (not Motion) for desktop: `hover:bg-neutral-800` on cards, `hover:border-primary-400` on interactive cards, `hover:scale-[1.02]` on community feed cards.

All motion effects must check the `prefers-reduced-motion` utility from Step 4.0. If reduced motion is preferred, skip the `whileTap` animation entirely.

To verify: pressing any button shows a brief scale-down effect; pressing a slider thumb shows it enlarge; hover effects appear on desktop; and all effects are disabled when "reduce motion" is active in system preferences.

**Step 4.3: Implement loading state animations (skeleton screens).**

Replace all `<div className="loading">Loading…</div>` instances throughout the codebase with skeleton screens that match the final content layout. The `Loading` component is defined at line 32 of `App.tsx` and used in `<Suspense fallback={<Loading />}>`. Create content-specific skeleton components:

1. **Card skeleton**: `animate-pulse bg-neutral-800 rounded-xl h-32 mb-3` — used for community feed card placeholders.
2. **Table row skeleton**: A row of `animate-pulse bg-neutral-800 rounded h-4 w-[var]` elements matching column widths.
3. **Chart skeleton**: `animate-pulse bg-neutral-800 rounded-lg h-[40vh]` — a rectangle matching the chart container dimensions.
4. **Header skeleton**: Thin bars mimicking title and subtitle lines.

Create a `frontend/src/components/Skeleton.tsx` component that accepts a `variant` prop (`card`, `table`, `chart`, `header`) and renders the appropriate skeleton layout.

Add staggered entrance animations to list content: when community feed cards or constituency cards load, each card enters with a 50ms stagger delay creating a cascading reveal effect. Use Motion's `staggerChildren` on the parent container and `variants` on each child.

To verify: loading states show content-shaped skeleton placeholders instead of "Loading…" text; skeleton placeholders animate with a shimmer pulse; list items enter with a staggered cascade when data loads.

**Step 4.4: Implement chart entrance animations.**

Recharts supports built-in animation via the `isAnimationActive` prop (default true) with configurable `animationDuration` and `animationEasing`. Tune these for a polished data reveal:

For bar charts: set `animationDuration={400}` and `animationEasing="ease-out"` — bars grow from zero height on initial render.
For line charts: set `animationDuration={500}` and `animationEasing="ease-out"` — lines draw progressively from left to right.
For pie charts: set `animationDuration={400}` — slices expand from center.

These entrance animations must fire only on initial component mount, not on data updates from slider changes. Implement a `hasAnimatedOnce` ref in each chart wrapper component. On mount, `hasAnimatedOnce` is `false` and animations play. After the first render, set it to `true` and pass `isAnimationActive={false}` to prevent re-animation. This is critical because slider-driven chart updates must render instantly after the debounce period (200ms) without adding a 400ms animation delay — otherwise the total feedback time would exceed the 200ms INP target.

Do NOT apply Motion layout animations to any container wrapping a Recharts `ResponsiveContainer`. Motion's FLIP-based transforms temporarily distort SVG content because Recharts measures container dimensions synchronously and does not handle animated size changes. Use opacity-only transitions (`animate={{ opacity: 1 }}`) if any wrapper animation is needed.

To verify: charts animate bars/lines growing on initial page load; subsequent data updates (from slider changes) render instantly without animation; no SVG distortion occurs during any transition.

#### Phase Deliverables

Page transition animations between routes. Interactive button and slider feedback. Skeleton loading states replacing text spinners. Chart entrance animations on mount only. All animations respect `prefers-reduced-motion`. Centralized animation configuration in `lib/motion.ts`.

#### Phase Risks and Mitigations

The risk of Motion layout animations distorting Recharts SVG is addressed by the explicit rule to use opacity-only transitions on chart containers. The risk of animations causing frame drops on budget Android devices is mitigated by profiling in DevTools with 4x CPU throttling (done in Phase 5 Step 5.5) and disabling any animation that drops below 50fps. The risk of `AnimatePresence` interfering with React Router's route transitions is mitigated by using `mode="wait"` and keying on `location.pathname`.

---

### Phase 5: Performance Optimization and Validation

#### Phase Header

Phase 5 optimizes the redesigned application for mobile performance and validates against all Lighthouse, bundle, and accessibility targets. It depends on substantial completion of Phases 1–4, though optimization steps (5.0–5.3) can begin independently at any time.

#### Prerequisites

Phases 1–4 substantially complete. The application is functional with Tailwind styling, Radix primitives, mobile-first layouts, and Motion animations. The old `index.css` has been deleted.

#### Step-by-Step Breakdown

**Step 5.0: Measure and validate the bundle budget.**

Run `npm run build` and compare the new chunk sizes against the Phase 0 Step 0.1 baseline. Record sizes for: main chunk, vendor chunk, firebase chunk, recharts chunk, and any new chunks (Radix primitives, Motion library). Sum for total initial JavaScript. If the total exceeds 300KB gzipped, identify which dependencies have leaked into the main bundle — this commonly happens when Radix primitives used in eagerly-imported components (like `LoginModal`, `UserMenu`, `ElectionTypeToggle`) pull their Radix packages into the main chunk. Solutions: convert eager imports to lazy imports (as done for `SaveBookmarkModal` in Step 2.2), or configure Vite's manual chunks to separate Radix into its own chunk.

Add a manual chunk for Radix in `vite.config.js`: `if (id.includes('node_modules/@radix-ui')) return 'radix'`. This isolates Radix primitives into a separate chunk that is only loaded when components using Radix are rendered.

Add a manual chunk for Motion: `if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) return 'motion'`.

To verify: `npm run build` output shows total initial JavaScript under 300KB gzipped, with chunk sizes documented.

**Step 5.1: Implement prediction render debouncing.**

The current architecture triggers chart re-renders on every slider `onChange` event because each event calls `setPredParams`, which updates state, which triggers `useMemo` recomputation (lines 129–155 of `App.tsx`), which passes new data to chart components. On budget Android devices, rendering 234 constituency calculations and three chart SVG updates on every pixel of slider drag would cause visible lag.

Implement debouncing at the `setPredParams` level in `App.tsx`. Create a `debouncedPredParams` state that lags behind `predParams` by 200ms. The slider components write to `predParams` immediately (so numeric value displays update instantly), but the `useMemo` hooks for `baseline` and `predictions` read from `debouncedPredParams` (so expensive calculations and chart re-renders are batched).

Use the existing `useDebounce` hook from `frontend/src/hooks/useDebounce.js`: `const debouncedPredParams = useDebounce(predParams, 200)`. Replace `predParams` with `debouncedPredParams` in the `useMemo` dependency arrays for `baseline` and `predictions` (but not for the slider display values, which should show `predParams` directly for immediate feedback).

Also apply `React.memo` with a custom comparison function to the chart wrapper components (`PredictionResults.jsx`) so they only re-render when the prediction data array actually changes reference (which happens only after debounce).

To verify: dragging a slider shows the numeric value updating immediately, while charts update after a 200ms pause in dragging. No lag is perceptible during continuous slider drag.

**Step 5.2: Virtualize long lists.**

Install `@tanstack/react-virtual` as a production dependency. Apply virtualization to two components:

1. **ConstituencyList.jsx** on desktop table view: The table renders up to 381 rows (Tamil Nadu has 234, but other states may have more). With virtualization, only approximately 20 visible rows plus a 5-row overscan buffer are rendered in the DOM, reducing DOM node count from hundreds to approximately 25. The virtual list must maintain the table semantics — use TanStack Virtual's `useVirtualizer` hook with a `<tbody>` containing only the visible rows, and set `transform: translateY(${virtualizer.getTotalSize()}px)` on a spacer element for correct scroll behavior.

2. **CommunityFeed.jsx** if it displays more than 50 items: Apply the same virtualization pattern to the card list.

The card-based mobile view (from Step 3.3) also benefits from virtualization for large constituency lists.

To verify: scrolling through the full constituency list (381 rows) is smooth with no jank; inspecting the DOM shows approximately 20–30 rendered rows at any time; the scroll position and total scrollable height are correct.

**Step 5.3: Optimize bundle loading and font delivery.**

Three optimizations:

1. **Defer Firebase SDK initialization**: Currently, `firebase.js` is imported at the top level by `LoginModal.jsx` and `AuthContext.tsx`, meaning Firebase loads during initial page load even before the user interacts with authentication. Move `firebase.js` initialization into a lazy-loaded module: `const getFirebase = () => import('./firebase')`. `AuthContext.tsx` calls this on mount to check for existing sessions, and `LoginModal` calls it when the user opens the sign-in dialog. Since `AuthContext.tsx` is a root-level provider in `main.jsx`, the Firebase import cannot be fully deferred — but the `signInWithPhoneNumber` and `RecaptchaVerifier` imports (the heaviest parts) can be dynamically imported only when the user taps Sign In.

2. **Preload critical route chunks**: Add `<link rel="modulepreload">` tags in `index.html` for the most likely navigation paths. After the main chunk loads, preload the NationalDashboard chunk (the default authenticated route) and the StateOverview chunk (the default state route).

3. **Self-host web fonts**: Download Inter (Latin + Latin Extended subsets) and Noto Sans Devanagari as woff2 files. Place them in `frontend/public/fonts/`. Add `@font-face` declarations in `app.css` for these fonts with `font-display: swap`. Add `<link rel="preload" href="/fonts/inter-var-latin.woff2" as="font" type="font/woff2" crossorigin>` in `index.html` to preload the primary font. Self-hosting avoids external font CDN requests and CSP complications. Update the `--sans` font stack in the Tailwind theme to use `'Inter', system-ui, ...`.

To verify: Lighthouse does not flag any font-related performance issues; the Network tab shows fonts loading from the same origin; Firebase chunks load only when auth is initiated.

**Step 5.4: Run comprehensive Lighthouse audits.**

Execute Lighthouse audits in Chrome DevTools incognito mode with mobile throttling (Moto G4 preset, 4x CPU, Slow 4G) on all five critical routes:

1. Landing page (`/`) — Target: Performance 95+, Accessibility 100
2. National dashboard (`/national`) — Target: Performance 95+, Accessibility 100
3. State overview (`/state/Tamil_Nadu/overview`) — Target: Performance 95+, Accessibility 100
4. Prediction panel (`/state/Tamil_Nadu/predictions`) — Target: Performance 90+, Accessibility 100
5. Constituency detail (`/state/Tamil_Nadu/constituencies/Chennai%20North`) — Target: Performance 90+, Accessibility 100

For each route, record Performance, Accessibility, Best Practices, and SEO scores. Identify and resolve any regressions. Common issues to watch for: unused CSS (should be minimal with Tailwind's tree-shaking), render-blocking resources (fonts, inline scripts), main thread blocking time from Radix hydration, and CLS from layout shifts during lazy component loading.

To verify: all routes meet their target Lighthouse scores in incognito mobile-throttled mode.

**Step 5.4a: Conduct manual accessibility testing.**

Automated testing (Lighthouse and axe-core) catches approximately 50–60% of WCAG 2.1 AA violations. The remaining violations require manual testing with assistive technologies that cannot be automated. Perform the following three manual testing procedures after the Lighthouse audits pass:

First, test with **VoiceOver on macOS** (and iOS if a physical device is available). Enable VoiceOver via System Settings → Accessibility → VoiceOver, then navigate the complete prediction workflow: land on the home page, navigate to a state overview, open the prediction panel, adjust the anti-incumbency and turnout sliders, save a prediction bookmark, open the community feed, and vote on a prediction. Verify that all interactive elements are announced with correct roles and states (e.g., sliders announce their current value and range, dialogs announce their title on open, tabs announce their selected state). Verify that slider value changes are announced as they occur. Verify that modal focus trapping works correctly — VoiceOver's rotor should not escape the dialog boundary. Verify that the bottom navigation items are announced with their labels and active state.

Second, test **keyboard-only navigation** through the full user journey. Using only Tab, Shift+Tab, Enter, Escape, and arrow keys (no mouse or trackpad), complete the following flow: focus the skip link and activate it to jump to main content, navigate through the tab navigation using arrow keys, enter the prediction panel and adjust slider values using arrow keys, open the Save Prediction dialog via Enter, fill in the title field, submit the form, close the dialog with Escape, navigate to the community feed, and activate a vote button with Enter. Verify that focus order is logical and follows the visual layout, that all interactive elements are reachable via keyboard, that focus is never trapped outside of intentional traps (modals), and that the visible focus ring (`focus-visible` styles from Phase 2 Step 2.6) is always clearly visible on the currently focused element.

Third, test with **high-contrast mode** by activating `prefers-contrast: more` in the browser. In Chrome DevTools, open the Rendering panel (Cmd+Shift+P → "Show Rendering") and set "Emulate CSS media feature prefers-contrast" to "more". Navigate all five critical routes and verify that focus indicators remain visible with sufficient contrast, that interactive element boundaries (buttons, inputs, cards) remain distinguishable from their backgrounds, and that text remains readable. Pay particular attention to the prediction panel sliders (the track, range, and thumb must be visually distinguishable) and the bottom navigation (active vs inactive icons must be clearly differentiated).

Document all findings from the three manual tests in a structured accessibility audit report at `frontend/ACCESSIBILITY-AUDIT.md`. Any issues discovered must be fixed before proceeding to cross-device testing in Step 5.7.

To verify: all three manual testing procedures have been completed, the audit report exists at `frontend/ACCESSIBILITY-AUDIT.md`, and any issues found during testing have been resolved.

**Step 5.5: Profile animations on throttled devices.**

Open DevTools Performance panel with 4x CPU throttling enabled. Record performance profiles for the following user flows:

1. Navigate from landing page to national dashboard (page transition animation)
2. Switch between national dashboard tabs (tab transition animation)
3. Navigate to state predictions and drag the anti-incumbency slider from 0 to 100 (slider animation + chart debounce)
4. Open and close the login modal (dialog entrance/exit animation)
5. Scroll through the community feed (card entrance stagger animation)

For each flow, verify that the frame rate stays above 50fps during animations. Identify any dropped frames and their cause. If any animation drops below 50fps consistently, simplify it: reduce the number of animated properties (e.g., animate only opacity, not scale + opacity), shorten the duration, or disable the animation entirely and rely on the `prefers-reduced-motion` fallback.

To verify: all animations maintain above 50fps under 4x CPU throttling as shown in DevTools Performance panel flame charts.

**Step 5.6: Fix Plausible analytics and update CSP headers.**

The current `index.html` has `<script defer data-domain="" src="https://plausible.io/js/script.js">` with an empty `data-domain` attribute. Set the `data-domain` to the production domain. Since this value is environment-specific, use Vite's HTML env substitution: `data-domain="%VITE_PLAUSIBLE_DOMAIN%"` and add `VITE_PLAUSIBLE_DOMAIN=your-domain.com` to the production `.env` file.

Update the Content-Security-Policy header in `api/main.py` at line 250:

Add `https://plausible.io` to `script-src` (for the Plausible analytics script).
Add `https://plausible.io` to `connect-src` (for analytics event reporting).

For web fonts, since they are self-hosted (Step 5.3), no `font-src` CSP change is needed — they are served from `'self'`.

Install the `web-vitals` npm package and integrate it to report LCP, INP, and CLS metrics. Add a small reporting module at `frontend/src/lib/vitals.ts` that calls `onLCP`, `onINP`, and `onCLS` from web-vitals and sends metrics to the Plausible analytics endpoint (or logs them to console in development). Import this module in `main.jsx` after app initialization.

To verify: in production, the Plausible script loads without CSP violations; web-vitals metrics are reported; the `data-domain` is correctly set from the environment variable.

**Step 5.7: Conduct cross-device testing.**

Test the complete application on physical devices or accurate emulators covering the primary Indian mobile market:

1. **Budget Android** (Samsung Galaxy A series or equivalent, 2–3GB RAM, Android 12+): Verify layout correctness at approximately 360px width, touch interaction responsiveness, animation smoothness, and memory usage.
2. **Mid-range Android** (Pixel 7 or Samsung Galaxy S21): Verify all features at 412px width.
3. **iPhone SE** (375px width, Safari 15.4+): Verify layout, touch interactions, and Safari-specific CSS behaviors (particularly `-webkit` prefixed properties for slider styling if any remain).
4. **iPhone 14** (390px width, Safari 16+): Verify at the most common recent iPhone width.

Document any device-specific issues (e.g., Safari viewport height with address bar, Android WebView container query support, iOS momentum scrolling behavior) and fix them.

To verify: the application is functional and visually correct on all four device categories with no layout breaks, touch target violations, or interaction failures.

**Step 5.8: Verify browser support matrix.**

Test the completed application against the minimum browser versions: Chrome 105+ (for container queries), Safari 15.4+ (for `@layer` and `:has()`), and Firefox 103+ (for container queries). Verify that all CSS features used by Tailwind 4.x — container queries, `clamp()`, `@layer`, CSS nesting, `color-mix()` — work correctly in these minimum versions. If any feature produces errors or visual issues in minimum-version browsers, add PostCSS fallbacks or adjust to use supported alternatives.

To verify: the application renders correctly and all interactive features work in Chrome 105, Safari 15.4, and Firefox 103 (tested via BrowserStack or equivalent).

#### Phase Deliverables

Optimized bundle under 300KB gzipped. Debounced slider-to-chart rendering. Virtualized long lists. Deferred Firebase loading. Self-hosted web fonts. Lighthouse scores meeting all targets. Animation frame rates validated. Plausible analytics fixed with correct CSP. Manual accessibility audit completed covering VoiceOver, keyboard-only navigation, and high-contrast mode, with findings documented and issues resolved. Cross-device and cross-browser testing complete.

#### Phase Risks and Mitigations

The primary risk is that the accumulated dependency additions (Radix, Motion, TanStack Virtual, web-vitals) push the bundle over 300KB gzipped despite individual estimates suggesting headroom. Mitigation: Step 5.0 measures the actual bundle before any optimization, providing early warning. Radix and Motion can be separated into lazy-loaded chunks. If the budget is still exceeded, the least critical addition (TanStack Virtual, at approximately 12KB) can be removed — the constituency table works without virtualization, just less smoothly for very long lists.

---

## 4. Cross-Cutting Concerns

**Error handling patterns.** The existing codebase uses try/catch in API calls (see `SaveBookmarkModal.jsx` lines 16–26 and `CommunityFeed.jsx` line 26) with component-local `error` state displayed as inline messages. The `ErrorBoundary.tsx` wraps the entire app. Maintain this pattern for all new and migrated components. Radix primitives do not throw errors during normal operation, so no additional error handling is needed for the UI library layer. For the new web-vitals reporting (`lib/vitals.ts`), wrap the reporting call in a try/catch to prevent analytics failures from affecting the user experience.

**Logging and monitoring.** Sentry is configured in `main.jsx` (lines 11–18) for error tracking. No additional logging configuration is needed for this migration. Ensure that any new `React.lazy()` imports are covered by the ErrorBoundary — if a lazy chunk fails to load (network error), the ErrorBoundary should display a retry UI rather than a blank screen. The existing ErrorBoundary in `App.tsx` already wraps the app; verify it catches chunk load failures by testing with DevTools network throttling set to Offline after initial load.

**Security considerations.** The CSP header update in Step 5.6 is the only security-relevant change. All Radix primitives render in the same origin and do not introduce new security surfaces. The self-hosted fonts avoid CORS and CSP complications. No user input handling changes — the existing Firebase authentication flow, API CSRF protection (via `_getCsrfToken()` in `api.ts`), and input validation patterns remain unchanged. When converting JSX to TSX, ensure that any `dangerouslySetInnerHTML` usage (if any exists) is not introduced — search the codebase to confirm none exists.

**Performance considerations.** The debouncing strategy (Step 5.1) and virtualization (Step 5.2) address the two primary performance bottlenecks identified in the strategic plan: slider-driven chart re-renders and large DOM node counts. Additionally, Tailwind's tree-shaking ensures the CSS bundle contains only used utilities, likely smaller than the current 2300-line CSS file. Motion's Web Animations API runs animations off the main thread when possible, reducing jank on mobile.

**Accessibility considerations.** Accessibility is structurally integrated through Radix primitives (Phase 2) rather than treated as a separate concern. All new Tailwind-styled elements must use semantic HTML and maintain the ARIA attributes established in Phase 2. Every interactive element must have a visible `focus-visible` style. Every form input must have an associated label (visible or visually hidden). Every image must have `alt` text. All color combinations must meet WCAG 2.1 AA contrast ratios (4.5:1 for normal text, 3:1 for large text) — the current dark theme's `#e0e0e0` on `#0f0f1a` achieves approximately 15:1 contrast, well above the minimum.

---

## 5. Migration and Data Considerations

This implementation involves no data model changes, no database migrations, no data backfill, and no server-side data transformations. All changes are confined to the frontend presentation layer. The backend API endpoints, request/response shapes, and database schema remain completely unchanged.

The only backend file modification is the CSP header update in `api/main.py` at line 250, which is a configuration change, not a data migration.

---

## 6. Integration Points

**Frontend–Backend API contracts.** No changes. All API endpoints called from `api.ts` (states, stats, constituencies, prediction data, bookmarks, auth) remain unchanged. The Radix component migration changes only how data is displayed, not how it is fetched or submitted.

**Frontend–Firebase integration.** The Firebase authentication flow (phone auth, Google sign-in) is preserved unchanged. The only structural change is that `LoginModal` now wraps the auth UI in a Radix Dialog, which adds focus trapping but does not alter the Firebase SDK calls. The reCAPTCHA verifier initialization (`RecaptchaVerifier` in `LoginModal.jsx` line 7) must work within the Dialog's focus trap — if the reCAPTCHA iframe loses focus, the verification may fail. Test this explicitly in Phase 0 Step 0.3.

**Frontend–Plausible analytics.** Step 5.6 fixes the broken integration by setting the `data-domain` attribute and updating CSP. The Plausible script is loaded from `https://plausible.io/js/script.js` and reports page views automatically. Web-vitals metrics are reported via the same Plausible endpoint or logged to console.

**Frontend–Sentry integration.** No changes to Sentry configuration. The existing `@sentry/react` integration in `main.jsx` continues to capture errors and performance traces.

---

## 7. Configuration and Environment

**New environment variables:**

- `VITE_PLAUSIBLE_DOMAIN` — The production domain for Plausible analytics (e.g., `elec.example.com`). Used in `index.html` via Vite's HTML env substitution.

**Package.json changes (new dependencies):**

Production: `@radix-ui/react-dialog`, `@radix-ui/react-slider`, `@radix-ui/react-tabs`, `@radix-ui/react-select`, `@radix-ui/react-toggle-group`, `@radix-ui/react-tooltip`, `@radix-ui/react-collapsible`, `@radix-ui/react-visually-hidden`, `motion`, `@tanstack/react-virtual`, `web-vitals`.

Dev: `tailwindcss`, `@tailwindcss/vite`, `@playwright/test`, `@axe-core/playwright`.

All new dependencies must be installed with exact version pinning (`npm install --save-exact` or `npm install --save-exact -D` for dev dependencies). Verify that no `^` prefixes appear on newly added entries in `package.json`. Existing dependencies that already use `^` ranges are out of scope for this migration.

**Vite configuration changes (`vite.config.js`):**

- Add `tailwindcss` plugin from `@tailwindcss/vite` to the `plugins` array.
- Add manual chunks for `radix` and `motion` in `rollupOptions.output.manualChunks`.

**Backend configuration changes (`api/main.py`):**

- Update CSP header at line 250 to add `https://plausible.io` to `script-src` and `connect-src`.

**Docker/container changes:** None. The Dockerfile for the frontend (`frontend/Dockerfile`) builds with `npm run build` and serves via nginx (`frontend/nginx-frontend.conf`) — no changes needed.

**New files created during implementation:**

- `frontend/src/app.css` — Tailwind entry with `@theme` tokens
- `frontend/src/bridge.css` — Temporary CSS bridge (deleted in Phase 3)
- `frontend/src/components/ui/dialog.tsx` — Shadcn-style Dialog
- `frontend/src/components/ui/slider.tsx` — Shadcn-style Slider
- `frontend/src/components/ui/tabs.tsx` — Shadcn-style Tabs
- `frontend/src/components/ui/select.tsx` — Shadcn-style Select
- `frontend/src/components/BottomNav.tsx` — Mobile bottom navigation
- `frontend/src/components/Skeleton.tsx` — Skeleton loading component
- `frontend/src/lib/motion.ts` — Centralized animation configuration
- `frontend/src/lib/vitals.ts` — Web vitals reporting
- `frontend/playwright.config.ts` — Playwright test configuration
- `frontend/BUNDLE-BASELINE.md` — Bundle size measurements
- `frontend/MOBILE-CSS-INVENTORY.md` — Mobile CSS rule inventory
- `frontend/MIGRATION-ESTIMATES.md` — Calibrated effort estimates
- `frontend/ACCESSIBILITY-AUDIT.md` — Manual accessibility testing results

---

## 8. Implementation Order and Dependencies

**Dependency graph:**

```
Phase 0 (PoC Spike)
  └── Phase 1 (Foundation)
        ├── Phase 2 (Accessibility) ─────────────┐
        │     ├── Step 2.2–2.5 (Radix components)│
        │     └── Step 2.6 (Global a11y) ────────┤ (parallel)
        ├── Phase 3 (Mobile Layout) ─────────────┘
        │     ├── Steps 3.1, 3.3, 3.4, 3.6 (no Radix dep, start with Phase 1)
        │     ├── Step 3.2 (needs Radix Collapsible from Phase 2)
        │     ├── Step 3.5 (needs Radix Tabs from Phase 2)
        │     └── Step 3.7 (delete CSS — after all above)
        └── Phase 4 (Animation) ─── starts when target components exist
              └── Phase 5 (Performance) ─── validation after Phases 1-4
                    ├── Steps 5.0–5.3 (optimizations — can start anytime)
                    └── Steps 5.4–5.8 (validation — needs Phases 1-4 complete)
```

**Parallel execution opportunities:**

- Steps 0.2 and 0.5 can run in parallel (Tailwind setup and CSS inventory are independent).
- Step 2.6 (global accessibility) can run in parallel with Steps 2.2–2.5 (component migrations).
- Steps 3.1, 3.3, 3.4, and 3.6 can begin as soon as Phase 1 completes, in parallel with Phase 2.
- Steps 5.0, 5.1, 5.2, and 5.3 (performance optimizations) can begin independently at any point.
- Step 4.0 (animation config) depends only on Motion being installed (Phase 0).

**Recommended order for a single developer:**

1. Phase 0 in full (Steps 0.1–0.5)
2. Phase 1 in full (Steps 1.1–1.4)
3. Phase 2 Steps 2.1 + 2.6 (install Radix + global accessibility — quick wins)
4. Phase 2 Steps 2.2–2.3 (Dialog and Slider migrations — highest complexity)
5. Phase 3 Steps 3.1, 3.3, 3.4, 3.6 (layout inversions without Radix dependencies)
6. Phase 2 Steps 2.4–2.5 (Tabs and Select migrations)
7. Phase 3 Steps 3.2, 3.5 (layout steps requiring Radix Tabs/Collapsible)
8. Phase 3 Step 3.7 (delete old CSS)
9. Phase 4 in full (Steps 4.0–4.4)
10. Phase 5 in full (Steps 5.0–5.8)

**Splitting across multiple developers:**

Developer A handles Phase 2 (Radix component migrations) while Developer B handles Phase 3 layout inversions that do not depend on Radix (Steps 3.1, 3.3, 3.4, 3.6). Both must coordinate on the CSS bridge — when Developer A migrates a component to Radix, they should also apply Tailwind utilities so Developer B does not duplicate the work. Phase 4 and Phase 5 are best handled by a single developer who has context on the full migration.

---

## 9. Completion Criteria

**Phase 0:** LoginModal renders with Radix Dialog + Motion animation. Bundle baseline measured. Mobile CSS inventory documented. Playwright tests pass. Effort estimates calibrated.

**Phase 1:** Tailwind 4.x operational with `npm run dev` and `npm run build`. Design tokens defined and resolvable as Tailwind utilities. CSS bridge ensures visual consistency. No user-visible changes.

**Phase 2:** Lighthouse Accessibility score reaches 100 on all routes. All modals use Radix Dialog. All sliders use Radix Slider. Navigation uses Radix Tabs. All selects have associated labels. Skip link, ARIA landmarks, and table semantics are present. Focus-visible styles appear on all interactive elements. Vitest coverage-v8 reports at least 80% line coverage for all new Shadcn-style components in `components/ui/` (dialog.tsx, slider.tsx, tabs.tsx, select.tsx).

**Phase 3:** All components styled with Tailwind mobile-first utilities. Header, prediction panel, tables, charts, and community feed are mobile-optimized. Bottom navigation visible on mobile. Card-based table views on mobile. `index.css` deleted. Application renders correctly at 375px, 768px, and 1280px. Vitest coverage-v8 reports at least 60% line coverage for all migrated existing components.

**Phase 4:** Page transitions animate between routes. Buttons show press feedback. Sliders show thumb scaling. Skeleton loaders replace text spinners. Chart entrance animations fire on mount only. All animations respect `prefers-reduced-motion`.

**Phase 5:** Total JavaScript bundle under 300KB gzipped. Lighthouse Performance 95+ on read-only routes, 90+ on interactive routes. Lighthouse Accessibility 100. INP under 200ms. CLS under 0.1. LCP under 2.5s on production builds. All animations above 50fps at 4x CPU throttle. Plausible analytics functional. Manual accessibility testing completed (VoiceOver, keyboard-only navigation, high-contrast mode) with all issues resolved. Cross-device and cross-browser testing passed.

**Overall completion:** all six phases complete, all Lighthouse targets met, zero axe-core violations, old CSS deleted, and the README updated to document the new design system and component architecture.

---

## 10. Implementation Report Summary

This report decomposes the mobile-first UI/UX transformation into 6 phases containing 30+ granular implementation steps. The transformation migrates the Indian election analytics frontend from a 2300-line monolithic CSS file with desktop-first breakpoint patches to a Tailwind CSS 4.x utility-first design system with 60+ design tokens, Radix UI primitives providing structural accessibility for all interactive elements, and Motion library animations for tactile feedback and perceived performance.

Phase 0 validates the entire toolchain through a LoginModal reference implementation, measuring the real bundle baseline and calibrating effort estimates before committing resources. Phase 1 establishes Tailwind infrastructure and design tokens without visible changes, creating a CSS bridge for incremental migration with a firm deletion deadline. Phase 2 achieves Lighthouse Accessibility 100 by replacing native HTML elements with Radix Dialog, Slider, Tabs, and Select primitives and adding page-level landmarks, skip navigation, and focus styles. Phase 3 is the largest phase, inverting all 24+ components to mobile-first layouts with bottom navigation, card-based table views, progressive disclosure in the prediction panel, and chart touch optimization. Phase 4 adds polish through page transitions, button feedback, skeleton loading states, and chart entrance animations, all respecting `prefers-reduced-motion`. Phase 5 optimizes the bundle, debounces slider-chart rendering, virtualizes long lists, runs Lighthouse audits, profiles animations, fixes Plausible analytics, and conducts cross-device testing.

Key decision points include the Phase 0 exit gate (if Tailwind 4.x or Radix reveals blockers, the approach is reassessed), the Phase 3 CSS deletion deadline (enforced by lint rules to prevent the dual CSS system from becoming permanent), and the Phase 5 bundle budget check (if 300KB is exceeded, lazy-loading and chunk splitting are applied). Critical dependencies flow from Phase 0 → Phase 1 → Phases 2/3 (partially parallel) → Phase 4 → Phase 5. The Radix Slider type mismatch (`number[]` vs `ChangeEvent`) is addressed through a documented adapter pattern in the Shadcn Slider wrapper. The prediction engine integration is protected by regression tests comparing output for fixed input parameters before and after migration.

The implementation creates 14 new files (Shadcn UI primitives, bottom navigation, skeleton component, animation config, vitals reporting, Playwright config, and documentation files) while migrating 24 existing component files from JSX to TSX and from CSS classes to Tailwind utilities. The old `index.css` is deleted at the end of Phase 3.
