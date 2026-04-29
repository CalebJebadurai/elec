# Refinement Notes: Mobile-First UI/UX Transformation

**Date:** 2026-04-29  
**Iteration:** 1  
**Critic Score:** 38/55  
**Dimensions Below 4/5:** Feasibility (2), Security (3), Completeness (3), Risk Assessment (3), Test Coverage (3)

---

## Iteration 1 Summary

### Critical Weaknesses Resolved

**Feasibility (2/5):**
- Added Phase 0 PoC Spike (5-7 developer-days) to validate toolchain, produce LoginModal reference implementation, measure actual bundle, inventory mobile CSS, and calibrate effort
- Added quantitative effort estimates: Phase 0 (5-7d), Phase 1 (5-8d), Phase 2 (10-15d), Phase 3 (15-20d), Phase 4 (5-7d), Phase 5 (5-8d), total 10-16 weeks
- Acknowledged learning curve as distinct cost, concentrated in Phase 0
- Acknowledged card-based table design needs design iteration before implementation
- Acknowledged near-zero test coverage baseline as significant effort multiplier

**Security (3/5):**
- Added CSP updates for Plausible (`script-src`, `connect-src`) and web-vitals (`connect-src`)
- Specified self-hosted fonts (woff2 in build output) to avoid CDN font-src issues
- Added version pinning policy for new deps; existing `^` ranges acknowledged out of scope
- Scoped `touch-action: none` to slider containers only

**Completeness (3/5):**
- Added browser support matrix: Chrome 105+, Safari 15.4+, Firefox 103+
- Specified Playwright + `@axe-core/playwright` as testing tools
- Added SEO Validation Tests section
- Addressed rollback complexity per-phase
- Added centralized animation config (`lib/motion.ts`)
- Added file organization (`components/ui/` for Shadcn primitives)
- Specified responsive chart height mechanism (CSS viewport units)

**Risk Assessment (3/5):**
- Added Tailwind 4.x ecosystem maturity risk with Phase 0 mitigation
- Added CSS bridge permanence risk with firm deadline + lint rule
- Added mobile CSS inventory step before migration
- Carried Recharts+Motion SVG interaction risk into Phase 4 steps
- Added Shadcn maintenance burden as honest tradeoff

**Test Coverage (3/5):**
- Specified Playwright for E2E/visual regression
- Added `@axe-core/playwright` for accessibility testing
- Harmonized performance targets: 95+ read-only, 90+ interactive
- Specified 0.1% pixel tolerance for visual regression
- Added CSS bridge testing
- Added Manual Accessibility Testing section
- Fixed test file count (2, not 1)

### Important Issues Resolved

- Radix Slider `onValueChange(number[])` adapter pattern documented
- SaveBookmarkModal eager import → lazy load recommendation
- "Ample headroom" → honest 23-43KB assessment
- Step 2.6 manual accessibility clarified as distinct from component-level
- Debounce + animation timing: entrance animations mount-only, debounce applied to `setPredParams`
- Component boundary for slider migration clarified (App.tsx + PredictionPanel.jsx)
- JSX→TSX per-component conversion strategy added
- LCP baseline noted as development-mode measurement

### Minor Issues Deferred

- Design mockups (not a design deliverable)
- State management for new UI state (component-local, not architectural)
- Ark UI comparison (Radix is established choice)
- `prefers-contrast` (deferred to post-migration)
- WCAG 2.2 reference (targets already exceed requirements)
- Full i18n architecture (out of scope)
