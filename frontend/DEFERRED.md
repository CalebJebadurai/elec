# Frontend Tooling — Deferred Items

This document captures tooling improvements that are not yet needed but should be triggered when specific thresholds are reached.

## CSS Architecture (CSS Modules or Tailwind)

**Trigger:** When `frontend/src/index.css` exceeds 2000 lines, or when a second CSS file is introduced.

**Current state:** Single `index.css` file (~1800 lines). Still manageable but approaching the threshold where a CSS architecture decision becomes necessary.

**Options when triggered:**

- CSS Modules (co-located `Component.module.css` files) — zero runtime cost, scoped by default
- Tailwind CSS — utility-first, eliminates most custom CSS, good DX with IDE plugins
- vanilla-extract — type-safe CSS-in-TS, zero runtime, integrates with TypeScript

**Decision criteria:** Choose based on team preference and whether the app is growing toward a design system (favors Tailwind) or staying component-local (favors CSS Modules).

---

## Accessibility Linting (eslint-plugin-jsx-a11y)

**Trigger:** When the application adds public-facing features beyond the current authenticated dashboard (e.g., a public embed widget, public API docs page, or SEO-driven landing pages).

**Current state:** The app is authentication-gated for most features. Accessibility is important but not yet critical for compliance. The hero/landing page is the only public-facing content.

**Implementation when triggered:**

1. `bun add -d eslint-plugin-jsx-a11y`
2. Add to ESLint config: `import jsxA11y from 'eslint-plugin-jsx-a11y'` and spread `jsxA11y.configs.recommended`
3. Fix violations (likely: missing alt text, form labels, focus management)

---

## Monorepo Structure (Turborepo / Nx)

**Trigger:** When a second frontend package is introduced (e.g., an admin panel, a widget library, or a shared component library), OR when the API and frontend need shared TypeScript types beyond the current manual sync.

**Current state:** Single frontend app + Python API. The type definitions in `frontend/src/types.ts` are manually maintained to match Pydantic models. This works fine at current scale.

**Options when triggered:**

- Turborepo — lightweight, Bun-compatible, good for JS/TS monorepos
- Nx — heavier, more features (affected commands, dependency graph), supports polyglot
- pnpm workspaces — simplest, just workspace linking without a build orchestrator

**Decision criteria:** If only JS/TS packages are added, Turborepo is the natural fit with Bun. If the Python API needs tighter integration, Nx handles polyglot better.
