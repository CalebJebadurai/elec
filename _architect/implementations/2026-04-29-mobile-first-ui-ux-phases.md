# Mobile-First UI/UX Transformation — Implementation Phases

**Date:** 2026-04-29  
**Source:** [2026-04-29-mobile-first-ui-ux.md](../analysis/2026-04-29-mobile-first-ui-ux.md)  
**Total Estimated Effort:** 10-16 weeks for a solo developer

---

## Phase 0 — PoC Spike (Validate + Calibrate)

**Effort:** 5-7 developer-days  
**Exit Gate:** Validated toolchain, measured bundle baseline, reference implementation complete

- **Step 0.1:** Measure actual production bundle via `vite build` and record gzipped sizes for all chunks
- **Step 0.2:** Verify Tailwind 4.x + Vite 8 compatibility — install `@tailwindcss/vite`, verify HMR and IntelliSense
- **Step 0.3:** Migrate LoginModal end-to-end as reference implementation (Tailwind + Radix Dialog + Motion + Playwright tests). Establish `components/ui/` convention. Convert JSX→TSX
- **Step 0.4:** Calibrate effort estimates based on LoginModal migration. Reassess approach if blockers found
- **Step 0.5:** Inventory existing mobile CSS rules (~250 rules in 600px and 380px media queries). Map each to Tailwind utility or custom CSS

## Phase 1 — Foundation (Tailwind + Design Tokens)

**Effort:** 5-8 developer-days  
**Dependencies:** Phase 0 complete  
**User Impact:** None (infrastructure only)

- **Step 1.1:** Install Tailwind CSS 4.x with Vite plugin. Dual-mode CSS operation (old + new)
- **Step 1.2:** Define ~60 design tokens: color scales (teal primary, neutral, semantic), fluid typography (clamp-based), spacing (4px base), elevation shadows, border-radius
- **Step 1.3:** Create CSS bridge mapping old vars (--bg, --bg2, etc.) to Tailwind tokens. Firm deletion deadline: end of Phase 3. ESLint/CI enforcement rule
- **Step 1.4:** Configure dark mode (class strategy) with prefers-color-scheme detection script

## Phase 2 — Accessibility (Radix Primitives)

**Effort:** 10-15 developer-days  
**Dependencies:** Phase 1 complete  
**Target:** Lighthouse Accessibility 100

- **Step 2.1:** Install Radix packages (dialog, slider, tabs, select, toggle-group, tooltip, visually-hidden)
- **Step 2.2:** Create Dialog in `components/ui/dialog.tsx`. Migrate LoginModal + SaveBookmarkModal (lazy-load to avoid +8KB to main bundle). Playwright tests
- **Step 2.3:** Create Slider in `components/ui/slider.tsx`. Adapter for Radix `onValueChange(number[])` → prediction engine format. 44×44px touch targets. `touch-action: none` scoped to sliders. Debounce `setPredParams` (200ms). Playwright tests
- **Step 2.4:** Create Tabs. Migrate header navigation. Mobile: bottom nav bar. Desktop: horizontal tabs. Arrow key navigation
- **Step 2.5:** Create Select. Migrate 4 unlabeled selects (resolves Lighthouse failure). Proper label association
- **Step 2.6:** Global accessibility: skip link, ARIA landmarks, table scope/caption, focus-visible styles (parallelizable)

## Phase 3 — Mobile-First Layout

**Effort:** 15-20 developer-days  
**Dependencies:** Phase 2 complete (for Steps 3.2, 3.5); Phase 1 for others  
**Deliverable:** Primary user-visible transformation

- **Step 3.1:** Invert header: stacked vertical on mobile (title → subtitle → actions → nav), horizontal at 768px+
- **Step 3.2:** Invert prediction panel: collapsible accordion sections (primary always visible, secondary/advanced collapsed). Full sidebar at 1024px+
- **Step 3.3:** Invert data tables: card-based list on mobile (design iteration needed), horizontal-scroll table at 768px+
- **Step 3.4:** Invert charts: legends below, responsive height via CSS viewport units, reduced data density on mobile, tap-to-reveal tooltips
- **Step 3.5:** Bottom navigation bar: 4-5 destinations, 56px height, 44×44px targets, fixed position, hidden on 768px+
- **Step 3.6:** Community feed redesign: elevated cards, skeleton loading, infinite scroll (IntersectionObserver), icon vote buttons
- **End of Phase 3:** Delete old `index.css`

## Phase 4 — Animation Layer

**Effort:** 5-7 developer-days  
**Dependencies:** Phase 3 substantially complete

- **Step 4.0:** Centralized animation config in `lib/motion.ts` (shared variants, presets, duration tokens)
- **Step 4.1:** Install Motion library (22.7KB gzipped, GPU-composited Web Animations API)
- **Step 4.2:** Page transitions: AnimatePresence with fade + slide-up (200ms enter, 150ms exit)
- **Step 4.3:** Interactive feedback: button scale (0.97), slider thumb scale (1.2), accordion transitions. Respect prefers-reduced-motion
- **Step 4.4:** Loading states: skeleton shimmer screens, staggered list entrance (50ms delay)
- **Step 4.5:** Chart entrance: mount-only bar growth + line draw (400ms). No animation on slider-triggered updates (INP budget). Exclude Recharts from layout animations

## Phase 5 — Performance & Validation

**Effort:** 5-8 developer-days  
**Dependencies:** Phases 1-4 complete (for validation steps)

- **Step 5.0:** Measure final bundle sizes vs Phase 0 baseline. Verify <300KB gzipped
- **Step 5.1:** Debounce setPredParams for chart-heavy params (150-200ms). React.memo on chart wrappers
- **Step 5.2:** Virtualize long lists (TanStack Virtual) for 381-row constituency table and community feed
- **Step 5.3:** Defer Firebase init, lazy-load Firebase Auth, preload critical route chunks, font preloading
- **Step 5.4:** Lighthouse audits: 95+/90+/100/100/95+ (Perf read-only/interactive/A11y/BP/SEO)
- **Step 5.5:** Profile animations at 4x CPU throttle. Target: 60fps, no drops below 50fps
- **Step 5.6:** Fix Plausible (data-domain), web-vitals reporting, CSP updates (script-src/connect-src for Plausible), self-host fonts, version pinning
- **Step 5.7:** Cross-device testing: budget Android, mid-range Android, iPhone
- **Step 5.8:** Browser support matrix verification: Chrome 105+, Safari 15.4+, Firefox 103+

---

## Critical Milestones

1. Phase 0 complete — Toolchain validated, effort calibrated
2. Phase 1 complete — Tailwind operational
3. Phase 2 complete — Lighthouse Accessibility 100
4. Phase 3 complete — Mobile-first live, old CSS deleted
5. Phase 5.4 complete — All Lighthouse targets met

## Key Dependencies

- Phase 0 → Phase 1 → Phases 2/3 (partial parallel) → Phase 4 → Phase 5
- Steps 3.2, 3.5 depend on Phase 2 (Radix Accordion, Tabs)
- Steps 3.1, 3.3, 3.4, 3.6 can parallel with Phase 2
- Steps 5.0-5.3 can begin independently at any time
