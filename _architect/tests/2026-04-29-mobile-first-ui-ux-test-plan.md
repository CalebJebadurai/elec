# Mobile-First UI/UX Transformation — Test Plan

**Date:** 2026-04-29  
**Source:** [2026-04-29-mobile-first-ui-ux.md](../analysis/2026-04-29-mobile-first-ui-ux.md)

---

## Testing Infrastructure

Two test runners required:
- **Vitest + Testing Library** (already configured) — unit and component tests
- **Playwright** (install in Phase 0) — E2E, visual regression, and accessibility audits
  - Target browsers: Chromium, Firefox, WebKit
  - Mobile viewports: 375px (iPhone SE), 390px (iPhone 14), 412px (Pixel 7)
  - Install `@axe-core/playwright` for automated accessibility testing beyond Lighthouse's ~30-40% WCAG coverage

## Unit Tests

### Shadcn-Style Components (in `components/ui/`)

**Dialog:**
- Renders in portal when triggered
- Traps focus within dialog content
- Returns focus to trigger on close
- Closes on Escape key
- Exposes aria-describedby linking to description element

**Slider:**
- Renders with correct aria-valuemin, aria-valuemax, aria-valuenow
- Responds to arrow key increments/decrements
- Calls onChange with correct numeric value (via adapter from number[])
- Thumb meets 44×44px minimum touch target

**Tabs:**
- Renders role=tablist on container, role=tab on triggers
- Manages aria-selected state correctly
- Supports arrow key navigation between triggers
- Renders correct tabpanel content for active tab

**Select:**
- Renders with properly associated label (resolves Lighthouse failure)
- Opens popover on click or Enter
- Supports keyboard navigation through options
- Announces selected option to screen readers

### Regression Tests for Migrated Components

- Prediction engine: fixed inputs (anti-incumbency 50%, turnout 65%, growth 1.05) produce identical outputs regardless of Radix vs native slider
- LoginModal: Firebase phone auth flow works identically through Dialog
- CommunityFeed: vote interactions produce correct API calls in redesigned card layout

## CSS Bridge Tests

During Phases 1-3:
- For each design token, verify old CSS var and Tailwind token resolve to identical computed values
- Playwright test renders reference component under both systems, compares computed styles
- Run in CI on every PR during migration; remove when old index.css is deleted

## Integration Tests

### Prediction Flow
- Open prediction panel on mobile (bottom nav tap)
- Adjust anti-incumbency slider 0→75 via keyboard arrow keys
- Verify prediction results summary card updates
- Verify chart re-renders after 200ms debounce
- Save bookmark through Dialog-wrapped SaveBookmarkModal → verify API request

### Navigation
- At 375px: bottom nav visible, top tabs hidden
- Tapping each bottom nav destination routes correctly with page transition animation
- Active state indicator updates on bottom bar
- At 1024px: top tabs visible, bottom bar hidden

### Accessibility Integration
- Keyboard-only user journey: skip link → main content → tab navigation (arrow keys) → prediction sliders (Tab + arrow) → community feed voting (Enter) → back to top via skip link

## End-to-End Tests (Playwright)

### Mobile Prediction Workflow (390px viewport)
- Land on national dashboard → navigate to state → open prediction panel
- Adjust primary controls (anti-incumbency, turnout)
- Expand advanced controls accordion
- Modify affinity weights → view updated predictions → save bookmark
- Verify all interactions via touch-sized targets

### Authentication Workflow (mobile + desktop)
- Tap Sign In → Dialog opens with focus on first input (not close button)
- Enter phone number (numeric keyboard) → OTP entry (auto-tab between boxes)
- Complete auth → Dialog closes → focus returns to Sign In location (now UserMenu)

## Visual Regression Tests

- Playwright screenshot comparison at 375px, 768px, 1280px for each migrated component
- Pixel difference tolerance: 0.1%
- Data-driven components (Recharts): use structural comparison (SVG text values) not pixel comparison
- Prediction engine: byte-identical output for same inputs before/after slider migration

## Edge Cases

### Mobile Layout
- 280px viewport: bottom nav icons tappable without overlapping
- Long constituency names: graceful truncation in card and table views
- RTL text (Urdu constituency names): correct rendering
- All prediction sections expanded simultaneously at 375px: scrollable without breaking
- Rapid slider sweep (0→100): no JS errors or visual glitches with debouncing

### Accessibility
- Screen reader: debounced aria-live announcements for prediction results (fire on pause, not during drag)
- Modal open + viewport rotation: focus management correct
- Card view keyboard: focusable with Enter to expand, Escape to collapse

## Negative Tests

- Slider: cannot produce out-of-range values (0-100% enforced by Radix)
- Login: inline error for invalid phone numbers, associated via aria-describedby
- Bookmark save: prevents empty title submission, validation feedback announced to screen readers

## Performance Tests

### Lighthouse Targets
- **Read-only routes** (landing, national, state overview): 95+ Performance
- **Interactive routes** (predictions, constituency detail): 90+ Performance
- All routes: 100 Accessibility, 100 Best Practices, 95+ SEO
- Measured in incognito mode with mobile throttling (Moto G4, 4x CPU, Slow 4G)

### Core Web Vitals (production builds, not dev mode)
- LCP < 2.5 seconds
- INP < 200 milliseconds during slider interaction
- CLS < 0.1

### Animation Performance
- No animation drops below 50fps under 4x CPU throttling
- Measured across: page transitions, slider interactions, modal open/close, feed scrolling

### Bundle Size
- Initial JS < 300KB gzipped (measured via `vite build`)
- No single lazy-loaded chunk > 100KB gzipped

## SEO Validation Tests

- Collapsed accordion content is crawlable (URL Inspection tool in Search Console)
- Existing URLs (/state/Tamil%20Nadu/predictions) work without redirects
- robots.txt and meta tags verified after layout changes

## Manual Accessibility Testing

After Phase 2 completion:
1. **VoiceOver (macOS/iOS):** Complete prediction workflow — verify all elements announced with correct roles, slider changes announced, modal focus trap works
2. **Keyboard-only:** Full user journey (landing → state → predictions → save bookmark) using only Tab/Shift+Tab/Enter/Escape/arrow keys. Logical focus order, all elements reachable, no unintentional traps
3. **High-contrast mode:** Interface usable with `prefers-contrast: more` active, focus indicators and element boundaries visible

## Coverage Targets

- **New Shadcn components** (`components/ui/`): 80% line coverage (Vitest coverage-v8)
- **Migrated existing components**: 60% line coverage
- **Playwright scenarios**: every user-facing workflow has a corresponding test
- Coverage reports on every PR; trend must increase across phases

## Test Execution Order

1. **Phase 0:** Playwright setup, LoginModal accessibility tests, bundle measurement
2. **Phase 1:** Tailwind rendering, token resolution, CSS bridge equivalence
3. **Phase 2:** Radix component accessibility tests (Playwright + axe-core)
4. **Phase 3:** Responsive layout tests, visual regression (0.1% tolerance)
5. **Phase 4:** Animation frame rate assertions under throttling
6. **Phase 5:** Lighthouse score gates, bundle size assertions

## Pass/Fail Criteria

Suite passes when:
- All unit, integration, and accessibility tests green
- Visual regression within 0.1% pixel tolerance
- axe-core reports zero violations on all pages
- Lighthouse meets thresholds (95+/90+/100/100/95+)
- Bundle under 300KB gzipped (from `vite build` output)
