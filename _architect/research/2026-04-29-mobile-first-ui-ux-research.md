# Deep Domain Analysis: Mobile-First UI/UX Transformation for Indian Election Analytics Platform

**Date:** 2026-04-29  
**Analyst:** GitHub Copilot (Senior Technical Analyst)  
**Subject:** Mobile-first CSS architecture, data visualization on mobile, touch interactions, design token systems, animation strategies, navigation patterns, and performance optimization for budget Indian mobile devices  
**Prior Work:** Builds on `_architect/research/2026-04-27-elec-platform-improvement-research.md` — this document avoids duplicating findings from that report and focuses exclusively on areas not previously covered.

---

## 1. Codebase Findings

### Current CSS Architecture

The entire visual layer of the application lives in a single monolithic file at `frontend/src/index.css`, containing approximately 2,300 lines of hand-written CSS. The file uses a minimal set of CSS custom properties defined on `:root` — exactly eight variables (`--bg`, `--bg2`, `--text`, `--text-muted`, `--accent`, `--border`, `--sans`, `--mono`) — which provide dark theme colors but no semantic layering, no spacing scale, no elevation system, and no typography scale. The color palette is hardcoded throughout: deep purple-black backgrounds (`#0f0f1a`, `#1a1a2e`), a cyan accent (`#7ae0ff`), muted gray text (`#a0a0a0`, `#e0e0e0`), and dark borders (`#2a2a40`). Additional colors for swing indicators (`#4ade80`, `#facc15`, `#f87171`), party-specific colors, and chart styling are scattered as inline hex values with no token abstraction.

The responsive strategy is desktop-first with four `@media (max-width: ...)` breakpoint blocks: 900px for tablet (lines 1467–1491, converts prediction panel from sidebar to stacked), 600px for mobile (lines 1494–1742, the largest block at ~250 lines covering font sizes, navigation, sliders, tables, filters, modals, and OTP boxes), 380px for very small phones (lines 1744–1779, micro-adjustments), and 768px for national dashboard specifics (lines 2232–2267). These breakpoints override desktop base styles downward rather than building mobile-first upward. The 600px block is by far the most complex, touching nearly every component.

### Component Structure and Charting

The application has 24 React components in `frontend/src/components/`, all using JSX with className-based styling. No CSS modules, no CSS-in-JS, no utility classes. Components are lazy-loaded via `React.lazy()` in `App.tsx` for code splitting. The build configuration in `vite.config.js` defines manual chunks for Firebase, Recharts/D3, and React vendor bundles.

Recharts is used extensively across six components: `StateOverview.jsx` (3 charts: stacked bar for seats, line for vote share, bar for swing), `ConstituencyDetail.jsx` (2 charts: bar for historical results, bar for margin trends), `PredictionResults.jsx` (3 charts: bar for seat distribution, pie for vote share, stacked bar for comparison), `PartyStrengthChart.jsx` (2 charts: bar and line), and `StateComparison.jsx` (1 chart: grouped bar). All charts use `<ResponsiveContainer width="100%" height={N}>` wrappers with fixed pixel heights ranging from 250px to 400px. Chart heights are not adjusted for mobile viewports. Tooltips use the default hover-triggered mechanism (no touch adaptation). Legends use default right or bottom positioning.

### Touch Interaction Surface

The `PredictionPanel.jsx` component is the most interaction-dense part of the application, containing 5+ range sliders (anti-incumbency, turnout, new party vote share, per-party affinity weights), text inputs, a color picker, a select dropdown, and collapsible toggle sections. The slider thumb size is 16×16px at desktop, increased to 28×28px at the 600px breakpoint — still below the recommended 44×44px minimum (iOS Human Interface Guidelines, Material Design). The slider track height increases from 6px to 8px on mobile. The `pred-section select` gets a `min-height: 44px` on mobile, but other interactive elements (buttons, toggles) do not receive similar touch target expansion.

Navigation uses a `<nav>` element with flex buttons that switch to horizontal scrolling (`overflow-x: auto`) at 600px with `-webkit-overflow-scrolling: touch` for momentum scrolling. Button padding reduces from `8px 20px` to `7px 14px` on mobile.

### Dependencies and Bundle Constraints

Current production dependencies from `package.json`: React 19.2, React DOM 19.2, React Router DOM 7.14, Recharts 2.15, react-simple-maps 3.0, Firebase 11.0, and Sentry React 10.50. No animation library, no CSS framework, no component library. DevDependencies include Vite 8, Vitest, Testing Library, TypeScript 6, ESLint, Prettier, and Husky. The build targets ES2020.

---

## 2. Architectural Constraints

The React 19 + Vite 8 stack is fixed. Any CSS architecture change must integrate with Vite's build pipeline. The existing single-file CSS approach means a migration to any new system must touch all 2,300 lines and 24 components. No component uses scoped styles — every selector is global.

The prediction engine runs client-side synchronously on every slider change in `predictionEngine.js`. UI debouncing can be applied only to chart re-renders, not to the numeric result displays. This means any animation library that intercepts slider values must not add latency to the core calculation path.

Firebase Authentication must remain undisturbed. The `LoginModal.jsx` component calls Firebase SDK directly. Any modal redesign is UI-only.

The lazy-loading code-splitting architecture in `App.tsx` means new libraries are automatically split into separate chunks if imported only by lazy-loaded components. This is favorable for tree-shaking animation or component libraries that are only used in specific routes.

The current CSS file size is approximately 60KB uncompressed (estimated 12KB gzipped). The performance budget from the refined prompt targets total CSS under 100KB uncompressed. Any framework migration must stay within this budget.

---

## 3. Mobile-First CSS Architecture Approaches

### Approach A: Tailwind CSS 4.x with Design Tokens

Tailwind CSS v4.0, released January 2026, represents a ground-up rewrite with significant architectural changes relevant to this project. The framework now uses CSS-first configuration via `@theme` blocks directly in CSS files, eliminating the need for `tailwind.config.js`. All design tokens defined in `@theme` are automatically exposed as CSS custom properties on `:root`, meaning the existing codebase's pattern of using `var(--bg)` style references would naturally extend into Tailwind's token system. The `@tailwindcss/vite` plugin provides first-party Vite integration with builds measured in microseconds for incremental rebuilds. Tailwind v4 leverages native CSS `@layer`, registered `@property` custom properties, and `color-mix()` for opacity variants, all of which are supported in the target browser matrix (Chrome 90+, Safari 14+, Firefox 88+). Container queries are now built into core via `@container` variants, enabling component-level responsive design independent of viewport width — particularly valuable for components like the prediction panel that may appear in different layout contexts.

**Bundle size**: Tailwind v4 with tree-shaking typically produces 8–25KB of CSS (gzipped) depending on usage breadth. For a project of this size with approximately 24 components, the output is likely in the 12–18KB range gzipped, comparable to or smaller than the current 12KB gzipped single file. Tailwind's JIT engine generates only the utilities actually used in template files.

**Migration effort from 2,300-line index.css**: This is the highest-effort approach. Every CSS class must be replaced with utility classes in JSX templates. All 24 components would need their `className` props rewritten. The 8 existing CSS variables would be replaced by `@theme` tokens. Custom component styles that don't map to utilities (e.g., `.swing-count.high`, `.const-name`, `.party-cell`) would require `@apply` directives or custom CSS within `@layer components`. Estimated migration: 200–300 individual className changes across 24 component files, plus the complete replacement of `index.css` with a Tailwind entry file and component layer. The Tailwind team provides an automated upgrade tool, but it is designed for Tailwind v3→v4 migration, not for plain CSS→Tailwind migration. This would be a manual process.

**Developer experience**: Tailwind provides excellent DX for a solo developer once learned: rapid prototyping, consistent spacing/color scales, built-in responsive variants (`sm:`, `md:`, `lg:`), dark mode support via `dark:` variant, and extensive documentation. The `@theme` system for design tokens is particularly clean — defining `--color-primary-500: oklch(0.7 0.15 240)` in CSS makes `bg-primary-500` available as a utility. The P3 color palette using OKLCH provides more vivid colors on modern displays.

**Accessibility**: Tailwind provides no accessibility enforcement. It is a styling-only framework. ARIA attributes, keyboard handling, and focus management must be implemented manually. However, the `focus-visible:` variant provides easy styling of keyboard focus indicators, and the `sr-only` utility class handles screen-reader-only content.

### Approach B: Shadcn/ui + Radix Primitives + Tailwind

Shadcn/ui is not a traditional component library — it is a code distribution system that copies component source code directly into the project. Components are built on Radix UI primitives (headless, accessible React components) and styled with Tailwind CSS. This approach provides both the utility-first CSS architecture of Tailwind and a library of pre-built, accessible UI components including Dialog (modal), Select, Slider, Tabs, Toast, Accordion, and Tooltip — all of which map directly to components currently hand-built in this codebase.

**Bundle size**: Radix UI primitives are individually installable (`@radix-ui/react-dialog`, `@radix-ui/react-slider`, etc.) and tree-shakeable. Each primitive adds 3–8KB gzipped. A typical selection of 8–10 primitives (Dialog, Select, Slider, Tabs, Toast, Accordion, Tooltip, Dropdown Menu) adds approximately 40–60KB total gzipped JavaScript. Combined with Tailwind CSS output of 12–18KB, total framework overhead is roughly 55–80KB gzipped. This fits within the 300KB initial JS budget since these would be lazy-loaded per-route.

**Migration effort**: This approach requires Tailwind migration (same effort as Approach A) plus refactoring interactive components to use Radix primitives. The LoginModal would migrate to Radix Dialog, the prediction panel dropdowns to Radix Select, prediction sliders to Radix Slider, navigation tabs to Radix Tabs, and collapsible sections to Radix Accordion. Each migration provides accessibility for free — Radix Dialog includes focus trapping, Radix Slider includes keyboard support and ARIA labels, Radix Tabs handles arrow key navigation. The Shadcn CLI (`npx shadcn@latest add button dialog slider`) scaffolds component files that the developer then owns and modifies. Estimated additional effort over Approach A: 8–12 component migrations.

**Accessibility**: This is the strongest accessibility story. Radix primitives are built accessibility-first: keyboard navigation, screen reader support, focus management, and ARIA patterns are baked in. The `Slider` primitive provides keyboard control (arrow keys for fine adjustment, Home/End for range bounds), visible value announcements for screen readers, and proper ARIA attributes — none of which the current `<input type="range">` implementation provides. The `Dialog` primitive handles focus trapping, escape key dismissal, and scroll locking, all of which the current `LoginModal` implements partially and manually.

**Developer experience**: Shadcn/ui is explicitly designed for AI-assisted development. Its open-code model means components are inspectable, modifiable, and predictable. The consistent composable API across all components (using `className`, `asChild`, variant props) makes the codebase easier to maintain. The Shadcn registry also supports custom component distribution, enabling the team to create election-specific components (SwingIndicator, PartyBadge, VoteShareBar) using the same patterns.

### Approach C: Enhanced Custom CSS with PostCSS

This approach preserves the current plain CSS architecture but systematically enhances it with a comprehensive design token system, PostCSS plugins for modern CSS features, and a mobile-first refactoring of the media query strategy. No new framework is introduced. The `index.css` file would be split into multiple files (tokens, base, components, utilities, responsive) imported via CSS `@import` (natively supported by Vite).

**Specific changes**: The 8 CSS variables would expand to a comprehensive token system: color scales (primary-50 through primary-900, neutral-50 through neutral-900, semantic success/warning/error), typography scale (using `clamp()` for fluid sizing), spacing scale (4px base unit: `--space-1` through `--space-16`), elevation shadows (4 levels), and border radius tokens (4 levels). Media queries would be inverted to mobile-first: base styles target 320px, with `@media (min-width: 640px)`, `@media (min-width: 768px)`, `@media (min-width: 1024px)`, and `@media (min-width: 1280px)` for progressive enhancement. PostCSS plugins would enable CSS nesting (`postcss-nesting`), autoprefixing (`autoprefixer`), and custom media queries (`@custom-media`). The file would be split into approximately 8 partials.

**Bundle size**: Zero additional JavaScript. CSS output would be comparable to or slightly larger than the current file due to the expanded token system, but still well under 100KB uncompressed. Gzipped size would be approximately 12–15KB. This is the lightest approach by far.

**Migration effort**: This is the lowest-effort approach. The existing CSS structure is preserved — selectors, class names, and component markup remain unchanged. Changes are architectural (file splitting, token extraction, media query inversion) rather than wholesale rewriting. The 8 existing variables expand to ~60 tokens. Each media query block gets its base styles moved out and its overrides converted to `min-width`. Estimated effort: 40–60 hours of focused CSS work with no component file changes.

**Accessibility**: No improvement over current state. Accessibility must be addressed entirely separately through manual ARIA additions, keyboard event handlers, and focus management code in each component. The current `<input type="range">` sliders, modal overlay, and tab navigation would remain without built-in accessibility patterns.

**Developer experience**: The most familiar DX for developers comfortable with plain CSS. No learning curve for new frameworks. However, no design system tooling — no auto-complete for token names, no responsive variant syntax, no component documentation system. Maintaining consistency across 24 components relies entirely on developer discipline.

---

## 4. Indian Election Data Visualization Best Practices

### How Leading Platforms Present Complex Multi-Variable Data on Mobile

**FiveThirtyEight (ABC News)**: FiveThirtyEight's election forecast interfaces (used extensively in the 2024 US presidential race) established several mobile visualization patterns now considered industry standard. Their approach prioritizes a "headline number" pattern: the most important metric (win probability percentage) is shown as a large, prominent number at the top of the viewport, with supporting charts below. On mobile, they collapse multi-column desktop layouts into single-column scrollable views. Bar charts comparing candidates or parties use horizontal orientation on mobile (vertical bars become hard to label on narrow screens). They use a "small multiples" pattern for comparing multiple races: instead of one complex multi-variable chart, they show many small, simple charts in a grid that collapses to a vertical stack on mobile. Color is used sparingly — only two colors (red/blue for party) with gray for undecided. Tooltips on mobile are replaced with inline data labels directly on chart elements, eliminating the need for touch-to-reveal interactions.

**The Economist's Interactive Graphics**: The Economist takes a data-density approach, using annotation-heavy static charts that tell a story without interaction. On mobile, their graphics use full-viewport-width charts with generous vertical spacing between chart sections. They favor line charts with annotations (text callouts pointing to specific data points) over interactive tooltips. Their mobile charts reduce data density by showing fewer time periods or aggregating categories. Typography plays a strong role — large, bold chart titles with descriptive subtitles that explain the takeaway, followed by the chart, followed by source attribution. This "title → chart → source" vertical stack is the dominant pattern.

**Election Commission of India (ECI)**: The ECI's official results portal demonstrates patterns specific to Indian election data presentation. Their mobile interface uses a state-centric navigation model — a map or list of states serves as the primary entry point, with drill-down to constituency-level results. Party results are always color-coded using established Indian party colors (saffron for BJP, green for INC, red for CPI(M), etc.), which creates an immediate recognition pattern for Indian users. Tables dominate over charts — Indian political data consumers are accustomed to tabular election results showing constituency name, candidate name, party, and vote count. The ECI site uses horizontal scrolling tables on mobile with the constituency name column frozen. Their approach is utilitarian rather than aesthetic, but the navigation patterns and data hierarchy reflect cultural expectations.

**Key patterns applicable to this platform**:
- The "headline number" pattern maps directly to the prediction results: show the predicted seat count as a large, prominent number before detailed charts
- Horizontal bar charts are more readable than vertical bars on mobile for party comparisons
- Replace hover tooltips with inline data labels or tap-to-reveal patterns
- Reduce chart data density on mobile by showing the most recent 3–4 election years rather than the full historical range
- Use consistent party colors that Indian users recognize (but see design token section for caveats about political neutrality)
- Tables with sticky first columns and horizontal scroll are the culturally expected format for constituency-level data
- Use descriptive chart titles with interpretive subtitles (e.g., "DMK has won the most seats since 2006" rather than just "Seats Won by Party")

---

## 5. Touch Interaction Patterns for Data-Heavy Apps

### Sliders on Mobile

The current prediction panel sliders use `<input type="range">` with CSS-styled thumbs. On mobile (≤600px breakpoint), the thumb enlarges to 28×28px with 3px border, giving an effective touch target of approximately 34×34px — below the 44×44px minimum recommended by both Apple's HIG and Material Design guidelines.

Industry best practices for touch sliders in data-heavy applications include: (1) Thumb size of at least 44×44px visual size with an even larger invisible hit area (Radix Slider uses a `SliderThumb` component that can have a separate visual and hit target size). (2) Value labels that follow the thumb position — the current implementation shows the value as a `<span>` next to the label text, but on mobile this can be far from the thumb, making it hard to see the value while adjusting. A tooltip-style value bubble attached to the thumb is the standard pattern. (3) Touch-action CSS property set to `none` on the slider container to prevent browser pan/zoom gestures from interfering with slider interaction. The current CSS does not set `touch-action` on any slider element. (4) Debouncing for expensive downstream effects — the prediction engine recalculates on every slider `onChange` event. On mobile, this can mean 30–60 recalculations per second during a slide gesture. The numeric display should update immediately, but chart re-renders should be debounced to 150–200ms. (5) Step snapping with haptic feedback — on devices that support the Vibration API (`navigator.vibrate(10)`), a brief vibration on step boundaries provides tactile confirmation.

### Charts on Mobile (Recharts Limitations)

Recharts (v2.15.3, the version used in this project) has specific mobile interaction limitations that are well-documented in the React data visualization community:

**Tooltip behavior**: Recharts tooltips are triggered by `onMouseMove` events. On touch devices, this translates to a single-tap-then-drag gesture that is not intuitive. The `Tooltip` component accepts an `active` prop and `coordinate` prop that can be controlled programmatically, but implementing tap-to-show-tooltip requires wrapping the chart in a click handler and managing tooltip state manually. This is not built-in.

**No native touch gestures**: Recharts does not support pinch-to-zoom or swipe-to-pan. For dense time-series data (e.g., 10+ election years across 234 constituencies), the data is rendered at full density regardless of viewport size. There is no built-in mechanism to reduce visible data points on mobile or enable horizontal scrolling within a chart area.

**SVG rendering performance**: Recharts renders entirely in SVG. For charts with many elements (a stacked bar chart with 8 parties across 10 years = 80 SVG `<rect>` elements, plus axes, labels, and grid lines), rendering performance is acceptable. However, re-rendering on every slider change (as the prediction panel does) can cause frame drops on budget Android devices. The `shouldUpdate` lifecycle is not exposed in Recharts' functional component API, making `React.memo` with custom comparison functions the primary optimization lever.

**Fixed height containers**: All charts in this codebase use fixed pixel heights (250px–400px) via `ResponsiveContainer`. On mobile, a 400px chart consumes 60% of the viewport height on an iPhone SE (667px viewport), leaving very little room for surrounding content. Responsive chart heights based on viewport height (using `clamp()` or viewport units) are not used.

**Alternative charting approaches**:
- **Nivo Charts** (`@nivo/bar`, `@nivo/line`, etc.): Offers both SVG and Canvas rendering. Canvas rendering outperforms SVG for charts with 100+ elements — not critical for this use case where most charts have under 100 elements. Nivo provides built-in animation via `react-spring`, better TypeScript types, and a `theme` prop for global chart styling. Bundle size: each `@nivo/*` package is 15–40KB gzipped. Migration from Recharts would require rewriting chart component props but the conceptual model (declarative data → chart) is similar.
- **Visx** (Airbnb): Low-level D3 wrapper for React. Maximum flexibility but requires writing much more code per chart. Not recommended for a solo developer — the productivity loss outweighs the control gained. Bundle size: modular, each package is 2–10KB gzipped.
- **Observable Plot / Chart.js**: Observable Plot is declarative and lightweight but has a non-React API requiring DOM refs. Chart.js renders to Canvas and is the most performant option for mobile but has a non-React API requiring wrapper libraries like `react-chartjs-2`.

The finding is that Recharts is adequate for this use case if optimized with memoization, debounced re-renders, and responsive height adjustments. A wholesale library migration is not warranted by the current chart complexity.

### Tables on Mobile

The current constituency grid (`.const-grid`) uses `position: sticky` for left-column pinning and `overflow-x: auto` for horizontal scrolling. The `max-height: 400px !important` override on mobile creates a double-scroll scenario (vertical scroll within the table, vertical scroll on the page) that is a known mobile UX anti-pattern.

Best practices for data tables on mobile include: (1) Priority-based column hiding — show only the 3 most critical columns (constituency name, winning party, margin) by default, with a "Show more" toggle to reveal additional columns. This eliminates horizontal scrolling entirely for the common case. (2) Card-based alternative view — for tables with many rows, convert each row into a card on mobile, showing the constituency as a card title and data points as key-value pairs within the card. This pattern is used by Google Analytics' mobile interface. (3) Virtual scrolling — for the 234-constituency prediction results table, rendering all rows simultaneously creates a DOM with 1,000+ elements. Libraries like TanStack Virtual or react-window render only visible rows (typically 10–15 at a time), reducing DOM size by 95% and significantly improving scroll performance on budget devices.

---

## 6. Design System Token Architecture

### Structuring a Comprehensive Token System

A design token architecture for this platform must address five domains: color, typography, spacing, elevation, and radii. The current system covers only a fragment of color (8 variables) and nothing else.

**Color tokens** should be organized in three layers:

- **Primitive colors**: Raw color values with no semantic meaning. These define the full palette. Example: `--gray-50: oklch(0.985 0 0)` through `--gray-950: oklch(0.13 0 0)`. Using OKLCH (as Tailwind v4 does) provides perceptually uniform lightness steps and P3 gamut support on modern displays. A non-partisan palette for a political analytics platform should use neutral tones for UI chrome (grays, with a slight warm or cool cast for personality) and a limited set of semantic accent colors.

- **Semantic colors**: Purpose-driven aliases. `--color-surface: var(--gray-900)`, `--color-surface-elevated: var(--gray-800)`, `--color-text-primary: var(--gray-100)`, `--color-text-secondary: var(--gray-400)`, `--color-accent: var(--teal-400)`, `--color-success: var(--green-400)`, `--color-warning: var(--amber-400)`, `--color-error: var(--red-400)`. These enable theme switching by reassigning semantic tokens without touching component code.

- **Component colors**: Specific to UI patterns. `--color-button-primary-bg`, `--color-card-border`, `--color-slider-track`, `--color-chart-grid`. These provide a final layer of indirection that makes component-level theming possible.

**Cultural appropriateness for Indian political context**: The platform must carefully navigate color associations. In Indian politics, saffron orange (#FF9933) is strongly associated with BJP and the Hindu nationalist movement. Green (#138808) is associated with INC and Muslim political identity. Blue (#000080) is associated with BSP and Dalit political movements. Red is associated with CPI(M) and Left Front parties. Using any of these as the platform's primary accent color would create an appearance of political bias. The current cyan accent (`#7ae0ff`) is a neutral choice. Alternative neutral accent options include: teal (between green and blue, not closely associated with any Indian party), purple/violet (used by some smaller parties but no major national association), and warm gray or bronze (conveys authority and neutrality). The recommended approach is to use a **neutral teal or purple accent** for platform UI, while using **accurate party colors** only in data visualization contexts (charts, maps, badges) where they serve an informational purpose and are attributed to specific parties.

**Dark mode refinement**: The current dark background `#0f0f1a` (oklch ≈ 0.11) is very close to pure black. Research from OLED display manufacturers and accessibility studies indicates that pure black backgrounds create excessive contrast with white text, causing "halation" (text appearing to bleed into the background) for users with astigmatism (approximately 33% of the population). Netflix uses `#141414`, Spotify uses `#121212`, and GitHub uses `#0d1117`. A slightly lighter background in the range of oklch 0.13–0.16 would reduce eye strain while maintaining the premium dark aesthetic. The current `--text-muted: #a0a0a0` against `#0f0f1a` has a contrast ratio of approximately 7.5:1, which exceeds the 4.5:1 WCAG AA requirement, but could be softened to `#888888` (contrast ratio 5.9:1) for truly secondary text to create better visual hierarchy without violating accessibility requirements.

**Light mode support**: Implementing a full dual-theme system requires defining all semantic color tokens in both light and dark variants, typically using a data attribute or class on the `<html>` element (e.g., `[data-theme="light"]`) with CSS variable reassignments. For charts, light mode requires different grid colors, tooltip backgrounds, and text colors. The effort is significant — every color in the system must work in both modes. Deferring light mode in favor of a well-refined dark mode is viable if the target audience primarily uses the platform in evening/night contexts (common for political news consumption in India).

**Typography tokens**: The current system-ui font stack is functional but lacks brand personality. The refined prompt considers Inter, DM Sans, and Manrope. Key considerations for this platform: (1) Tabular numbers (monospaced digits) are essential for aligned vote counts and percentages in tables — Inter and DM Sans both support `font-variant-numeric: tabular-nums`. (2) Devanagari script support is needed for some constituency names and party labels. Inter and Manrope do not support Devanagari. Noto Sans does, but at a significant size cost (the Devanagari subset alone is ~30KB woff2). The recommendation is to use a Latin web font (Inter is the strongest candidate for data-heavy interfaces due to its tabular numbers, extensive hinting, and 17KB woff2 Latin subset) with Noto Sans Devanagari as a fallback for Hindi text: `font-family: 'Inter', 'Noto Sans Devanagari', system-ui, sans-serif`. Fluid typography using `clamp()` eliminates the need for font-size media queries: `--font-size-body: clamp(0.875rem, 0.8rem + 0.4vw, 1rem)` scales from 14px on 320px viewports to 16px on 1280px viewports.

**Spacing tokens**: A 4px base unit system provides sufficient granularity for compact data interfaces: `--space-1: 4px`, `--space-2: 8px`, `--space-3: 12px`, `--space-4: 16px`, `--space-6: 24px`, `--space-8: 32px`, `--space-10: 40px`, `--space-12: 48px`, `--space-16: 64px`. The current CSS uses inconsistent spacing values (padding ranges from `2px` to `60px` without a pattern). Adopting a 4px grid enforces visual consistency.

**Elevation tokens**: The current design uses flat surfaces with `1px solid var(--border)` borders. Adding subtle box-shadows creates depth hierarchy without adding border visual weight: `--shadow-sm: 0 1px 2px oklch(0 0 0 / 0.3)`, `--shadow-md: 0 4px 6px oklch(0 0 0 / 0.3)`, `--shadow-lg: 0 10px 15px oklch(0 0 0 / 0.3)`. On dark backgrounds, shadows are less visible than on light backgrounds, so elevation should also incorporate slightly lighter background tints for elevated surfaces (as Material Design 3 does with its "surface tint" system).

---

## 7. Animation and Micro-interaction Strategy

### Motion (formerly Framer Motion) vs React Spring vs CSS-Only

**Motion (v12.x, formerly Framer Motion)**: The leading React animation library, now rebranded as "Motion" and available via the `motion` npm package. Motion's hybrid engine uses the Web Animations API and ScrollTimeline for hardware-accelerated 120fps animations, falling back to JavaScript only for capabilities those APIs can't provide (spring physics, interruptible keyframes, gesture tracking). This is a significant performance advantage over purely JavaScript-based animation libraries, particularly relevant for mobile where CPU is constrained.

Bundle size: The `motion` package is 22.7KB minified+gzipped (tree-shakeable, side-effect free). On a slow 3G connection (50KB/s), this adds approximately 450ms to download time. For the current project's lazy-loading architecture, Motion would only be loaded when components that use it are rendered, not on initial page load. If imported only in the PredictionPanel and CommunityFeed routes, it would not impact the landing page or national dashboard load times.

Key features relevant to this project: (1) `whileHover` and `whileTap` props for button press states — works correctly on both mouse and touch. (2) `layout` prop for automatic FLIP-based layout animations — perfect for accordion sections in the prediction panel that change height. (3) `AnimatePresence` for exit animations — enables smooth modal entrance/exit and toast notification animations. (4) Gesture recognizers (`drag`, `pan`) that are cross-device and handle touch events correctly — unlike CSS `:hover` which fires unreliably on touch. (5) `useScroll` for scroll-linked animations — could drive a progress indicator or parallax effect on the national dashboard.

**React Spring (v9.7.x)**: Physics-based animation library using spring dynamics. Bundle size: 19.1KB minified+gzipped, but not marked side-effect free, limiting tree-shaking. React Spring runs all animations in JavaScript on the main thread using `requestAnimationFrame`, which means animations compete with React rendering for CPU time. On budget Android devices with 4x CPU throttling, this can cause frame drops during complex animations. React Spring excels at spring physics (realistic bounce and overshoot) but does not provide gesture recognizers, layout animations, or exit animations. The `useSpring`, `useTransition`, and `useTrail` hooks offer a composable API, but each hook requires manual orchestration for sequences. The library's development pace has slowed significantly compared to Motion.

**CSS-Only (transitions + keyframe animations)**: Zero JavaScript overhead. CSS transitions using `transform` and `opacity` are GPU-accelerated on all browsers and devices. A well-crafted CSS animation strategy using `cubic-bezier` easing, `@keyframes`, and the `transition` shorthand can cover most UI animation needs: button hover/active states, modal fade-in/slide-up, accordion height transitions (via `grid-template-rows: 0fr`/`1fr` trick), loading skeleton shimmer effects, and chart container fade-in on load. The new CSS `@starting-style` rule (supported in Chrome 117+, Safari 17.5+) enables enter animations without JavaScript — though browser support may be insufficient for budget Android devices running older WebView versions.

Limitations of CSS-only: (1) No spring physics — all easing must be defined as cubic-bezier curves, which can approximate spring motion but not replicate it precisely. (2) No gesture tracking — CSS cannot respond to drag distance or velocity. (3) No exit animations without JavaScript — `AnimatePresence` in Motion or similar React wrappers are needed to animate elements being removed from the DOM. (4) No stagger without JavaScript — animating a list of items with cascading delays requires inline `style` attributes or CSS variable injection from React. (5) Height transitions are complex — CSS cannot transition to/from `height: auto`, requiring workarounds like the `grid-template-rows` technique or `max-height` estimation.

**Assessment for this project**: Motion (Framer Motion) is the strongest choice. Its hybrid rendering engine and hardware acceleration make it the most performant option on mobile. The 22.7KB gzipped cost is justified by the features it provides that CSS alone cannot: gesture recognition for touch interactions, layout animations for accordion/panel transitions, exit animations for modals and toasts, and scroll-linked animations for dashboard effects. React Spring's pure-JavaScript rendering is a performance liability on budget devices, and its limited feature set would require supplementing with CSS animations anyway. CSS-only covers 70% of animation needs but the remaining 30% (gestures, exit animations, layout animations) are precisely the interactions that differentiate a "modern" feeling app from a static one.

### Recommended Animation Patterns for Data Dashboards

Based on observation of successful data dashboard products (Linear, Vercel Dashboard, Grafana, Datadog):

- **Page transitions**: Fade-in with slight upward translate (opacity 0→1, translateY 8px→0, duration 200ms) for route changes. Not full page transitions — those add latency perception.
- **Chart entrance**: Staggered fade-in of chart elements on mount, 150ms per element with 50ms stagger delay. This creates a "data loading in" perception that is more engaging than an instant render.
- **Slider interaction**: Scale the slider thumb to 1.2x on press (whileTap), spring back on release. Value label follows thumb position with a slight bounce.
- **Modal entrance**: Fade overlay (200ms) + slide-up content (300ms, spring). Exit: reverse with faster timing (150ms).
- **Toast notifications**: Slide in from top-right (or top-center on mobile), auto-dismiss after 3 seconds with progress indicator.
- **Accordion/collapsible sections**: Animate height using `layout` prop on Motion components. Content fades in after height animation completes (50ms delay).
- **Skeleton loading**: CSS-only gradient animation shimmer effect (no JS needed). Linear gradient from `var(--surface)` to `var(--surface-elevated)` animating `background-position`.
- **Button press states**: Scale to 0.97 on press with spring return. Ripple effects (Material Design style) are an option but add complexity — simple scale transforms are equally effective.

### Performance Guidelines for Mobile Animation

All animations should use `transform` and `opacity` properties exclusively for the animated values, as these are composited on the GPU without triggering layout or paint. Animating `width`, `height`, `margin`, `padding`, `top`, `left`, or `border` properties causes layout recalculation on every frame, which drops below 60fps on budget devices. The `will-change` property should be applied sparingly — only on elements that are about to animate — as overuse consumes GPU memory. The `prefers-reduced-motion` media query must be respected: users who have enabled reduced motion in their OS settings should see instant state changes instead of animations. Motion provides a `useReducedMotion()` hook for this purpose.

---

## 8. Mobile Navigation Patterns for Analytics Dashboards

### Analysis of the Current Navigation

The application has 7 primary routes: National Dashboard (`/national`), State Overview (`/state/:state`), Constituencies (`/state/:state/constituencies`), Predictions (`/predictions`), Community Feed (`/community`), Bookmarks (`/bookmarks`), and a landing page (`/`). Additional utility routes include Privacy Policy, Terms of Service, Pricing, and Support. The current navigation renders as horizontal flex buttons in a `<nav>` element that converts to a horizontally-scrollable tab bar on mobile (≤600px), with touch momentum scrolling. The buttons shrink to `7px 14px` padding on mobile, and the bar is not persistent — it scrolls out of view when the user scrolls down the page.

### Pattern Assessment for This Application

**Bottom Navigation Bar**: Material Design 3's compact layout guidelines explicitly recommend a bottom navigation bar for mobile apps with 3–5 primary destinations. The bottom of the screen is within the natural thumb reach zone on both left-handed and right-handed grip. Studies by Steven Hoober (cited in Apple's HIG) show that 75% of mobile interactions use a single thumb, and the bottom 40% of the screen is the most comfortable reach zone. For this application with 5 primary destinations (National, State, Predictions, Community, Profile/Bookmarks), a bottom nav bar with icon + label is the strongest pattern. The bottom bar should be persistent (visible on all pages) and should use the `position: fixed; bottom: 0` CSS pattern. The prediction panel and community feed — the two most interactive routes — benefit from always-accessible navigation because users frequently switch between creating predictions and viewing community predictions.

Tradeoffs: Bottom nav consumes approximately 56px of vertical space on every screen. On an iPhone SE (667px viewport), this is 8.4% of screen real estate — significant but acceptable given the navigational efficiency gained. On mobile web (as opposed to native apps), the browser's own bottom chrome (URL bar on Safari, navigation buttons on some Android browsers) can conflict with a fixed bottom nav. This can be mitigated by using `env(safe-area-inset-bottom)` padding on iOS and testing across Android browsers. The CSS approach: `padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px))` ensures content is not hidden behind the nav bar.

**Top Scrolling Tabs (Current Implementation)**: The current approach works for a browse-mostly interface but has several disadvantages for an analytics dashboard: (1) Navigation disappears on scroll, requiring the user to scroll back up to switch sections. (2) Tabs beyond the visible area are not discoverable — the user must know to scroll the tab bar horizontally. (3) Touch targets at `7px 14px` padding are too small. (4) No visual indication that more tabs exist beyond the visible set.

**Hamburger Menu**: Not recommended for this application. NNGroup research (Raluca Budiu, 2015, with updated guidelines through 2025) consistently finds that hamburger menus reduce discoverability of navigation options. For an analytics dashboard where users need frequent access to multiple data views, hiding navigation behind a tap-to-reveal menu adds friction. The hamburger menu is best suited for content-consumption apps (news readers, social feeds) where navigation is secondary to content browsing. This platform is a tool, not a content feed.

**Hybrid Approach**: The optimal pattern for this application may combine bottom navigation with contextual top tabs. The bottom bar provides the 4–5 primary routes (National, State, Predictions, Community, Profile). Within the State section, a top tab bar (not scrollable, just 2–3 tabs: Overview, Constituencies) provides sub-navigation. Within National, top tabs (Map, Parties, Compare, Timeline — the existing `TABS` array in `NationalDashboard.jsx`) remain as contextual navigation. This two-level hierarchy matches the information architecture: top-level navigation at the bottom (always accessible, persistent), sub-navigation at the top (contextual, page-specific).

---

## 9. Performance Optimization for Mobile India

### Indian Mobile Device Landscape

India's smartphone market is dominated by budget and mid-range Android devices. As of 2025–2026 data from Counterpoint Research and IDC:

- **Median device price**: ₹10,000–₹15,000 ($120–$180). Popular models include Redmi Note series, Realme Narzo, Samsung Galaxy M/A series, and Motorola G series.
- **Typical specifications**: Qualcomm Snapdragon 4xx/6xx or MediaTek Dimensity 700/900 chipsets, 4–6GB RAM, 720p or 1080p display, Android 12–14.
- **CPU performance**: These chipsets score approximately 2,500–4,000 on Geekbench 5 single-core — roughly equivalent to a Moto G Power (the Lighthouse throttling reference device) or 3–5x slower than a flagship iPhone.
- **Browser**: Chrome for Android is dominant (70%+ market share). Samsung Internet accounts for ~15% on Samsung devices. WebView-based browsers (UC Browser, Opera Mini) have declined but still represent 5–10% of Indian mobile web traffic.

### Network Conditions

India's mobile network landscape as of 2025–2026:

- **4G coverage**: 95%+ of urban India, 80%+ of rural India (Jio, Airtel, Vi networks). Average 4G speed: 15–25 Mbps download (TRAI data).
- **5G coverage**: Expanding rapidly but concentrated in metro cities. 5G users represent approximately 15–20% of mobile internet users.
- **Effective connection quality**: Despite 4G coverage, real-world mobile web performance is affected by network congestion (especially during peak hours: 6PM–10PM IST, which coincides with political news consumption), signal quality in buildings, and data plan throttling (many prepaid plans throttle speeds after daily data caps of 1–2GB). The `navigator.connection.effectiveType` API reports the effective connection type — for many Indian users, this will show "3g" even on a 4G network during congested periods.
- **Data cost sensitivity**: Indian mobile data is among the cheapest globally (~$0.17/GB as of 2025), but users on low-income plans are conscious of data usage. Total page weight matters.

### Performance Strategy

Given these constraints, the performance optimization strategy should target the "Moto G4 on slow 4G" profile used by Lighthouse — 4x CPU throttling, 4Mbps network with 150ms round-trip latency. This closely approximates the experience of a budget Indian Android phone on a congested 4G network.

**Initial load budget**: The refined prompt targets 300KB gzipped for initial JavaScript. The current bundle breakdown (estimated from dependencies): React/ReactDOM/ReactRouter vendor chunk ≈ 45KB gzipped, Firebase chunk ≈ 80KB gzipped (Firebase Auth is the largest sub-package), Sentry ≈ 25KB gzipped, app code ≈ 15KB gzipped. Total initial: approximately 165KB gzipped. Recharts and react-simple-maps are lazy-loaded. This leaves significant headroom (135KB) for a CSS framework, animation library, and component primitives.

**Critical rendering path optimizations**:
1. **Font preloading**: Add `<link rel="preload" href="inter-latin.woff2" as="font" type="font/woff2" crossorigin>` in `index.html` to prevent FOIT (Flash of Invisible Text) or FOUT (Flash of Unstyled Text). Use `font-display: swap` to render with system font immediately while web font loads.
2. **Above-the-fold content prioritization**: The landing page and national dashboard should render meaningful content within the first 150KB of resources. Defer Firebase initialization until after first paint — Firebase Auth SDK (80KB) is only needed when the user initiates login.
3. **Image optimization**: The India map (`react-simple-maps` with `india-states.json`) loads the full GeoJSON on mount. This file should be lazy-loaded and compressed. Consider pre-rendering the map to SVG at build time for the landing page.
4. **CSS loading**: If using Tailwind, the generated CSS is small enough (<20KB gzipped) to inline in `<head>` for instant styling without a render-blocking CSS file. If using the current CSS file, split critical above-the-fold styles into an inlined `<style>` block and defer the rest.

**Runtime performance optimizations**:
1. **Chart rendering debouncing**: Wrap Recharts chart updates in a `useMemo` with a debounced dependency on prediction parameters. Use `requestAnimationFrame` batching: accumulate slider changes, then render the chart on the next frame. The numeric result displays (seat counts, vote shares) should update synchronously for immediate feedback.
2. **Virtual scrolling for constituency table**: The 234-row prediction constituency table creates ~2,000 DOM nodes. TanStack Virtual (12KB gzipped) renders only visible rows (typically 10–15), reducing DOM node count by 90%. This dramatically improves initial render time and scroll performance.
3. **React.memo for chart components**: Wrap all Recharts `<ResponsiveContainer>` parents in `React.memo` with a shallow comparison function that only updates when data or dimensions change, not when unrelated parent state changes.
4. **Lazy-load below-fold content**: Charts that appear below the initial viewport should use Intersection Observer to defer rendering until they scroll into view. The `React.lazy` + `Suspense` pattern already handles route-level splitting, but within a single route (e.g., StateOverview with 3 charts), only the first chart is above the fold.
5. **Network-adaptive data loading**: Use the Network Information API (`navigator.connection.effectiveType`) to adapt data loading strategies. On `"2g"` or `"slow-2g"`, show summarized data (last 3 elections instead of all 15), use lower-resolution map geometry, and skip animation entirely. On `"4g"`, load full historical data and enable all visual enhancements.

**Specific Lighthouse score drivers**:
- **LCP (Largest Contentful Paint)**: The LCP element on the national dashboard is likely the India map SVG or the first data table. Ensure this element renders within 2.5 seconds by preloading the GeoJSON data or inlining a lightweight placeholder map. On the landing page, LCP is the hero title text — ensure web fonts are preloaded or use system fonts for the hero.
- **INP (Interaction to Next Paint)**: The most latency-sensitive interaction is the prediction slider. If each slider change triggers a full React re-render tree (prediction engine → result cards → charts), INP could exceed 200ms on budget devices. Isolate the prediction engine calculation in a web worker or at minimum use `React.startTransition` to mark chart updates as non-urgent.
- **CLS (Cumulative Layout Shift)**: The primary CLS risk is chart containers that render at 0 height during data loading, then expand to their full height (250–400px) when data arrives. All `ResponsiveContainer` wrappers should have explicit `min-height` matching their content height, or skeleton placeholders should occupy the same space. Font loading CLS is mitigated by `font-display: swap` and font preloading.

---

## 10. Edge Cases and Risks

**Tailwind migration risk**: If Approach A or B is chosen, the migration period will leave the codebase in a hybrid state — some components using Tailwind utilities, others still using CSS classes from `index.css`. This creates visual inconsistency and makes it unclear which system governs any given element. A phased migration should proceed component-by-component in order of visual prominence (header/nav first, then data views, then forms/modals), with the old CSS classes removed only after the Tailwind equivalent is verified.

**Party color management**: The current `partyColor()` function in `constants.js` returns hardcoded hex values for party names. If the design token system introduces a party color token layer, these values must remain distinct from the platform's UI accent colors to avoid confusion between "this is a button" and "this represents BJP."

**Recharts + Motion interaction**: If Motion's `layout` animation is applied to a container that wraps a Recharts `ResponsiveContainer`, the FLIP-based transform can temporarily distort the SVG chart during the animation. Recharts measures its container dimensions synchronously and does not handle animated container size changes gracefully. The workaround is to exclude Recharts containers from layout animations and use opacity-only transitions.

**Bottom navigation on mobile web**: Safari on iOS has its own bottom toolbar that overlaps with fixed-positioned bottom elements. The `env(safe-area-inset-bottom)` CSS function addresses the iPhone notch area, but Safari's toolbar behavior (appearing/disappearing on scroll) can cause the bottom nav to feel unstable. Testing on physical iOS devices is essential. On Android, the system navigation bar (gesture or button) similarly requires `safe-area-inset-bottom` consideration.

**Budget device performance ceiling**: On a Redmi Note 10 (Snapdragon 678, 4GB RAM), a full React re-render of the prediction panel + 3 Recharts charts takes approximately 80–120ms based on comparable React/Recharts benchmarks. This is within the 200ms INP target but leaves little headroom. Adding Motion animations on top of this could push individual frames over 16ms (the 60fps frame budget). Animating chart entrance on mount is acceptable (one-time cost), but animating chart updates on slider change is risky and should be avoided on budget devices (detect via `navigator.hardwareConcurrency <= 4` or `navigator.deviceMemory <= 4`).

**CSS-only fallback for animation**: If Motion is adopted, all animations must have CSS-only fallbacks for users with `prefers-reduced-motion: reduce` enabled and for environments where JavaScript is slow to parse. This means key state transitions (modal open/close, accordion expand/collapse) must be functional without animation — they should be instant rather than broken.

---

## 11. Security Findings

No new security findings beyond those documented in the prior research report. The UI/UX transformation is a frontend-only change that does not introduce new attack surfaces. However, the following security-adjacent concerns are noted:

**Third-party dependency surface area**: Adopting Tailwind CSS (PostCSS plugin or Vite plugin), Radix UI primitives (8–10 packages), and Motion (1 package) increases the dependency count by approximately 15–25 packages. Each dependency is a potential supply chain attack vector. All new dependencies should be pinned to exact versions in `package.json` (not using `^` ranges) and audited via `npm audit` before adoption. Tailwind Labs and Radix UI (maintained by WorkOS) are well-established organizations with strong security practices. Motion is maintained by Framer (now independent as Motion Division).

**Content Security Policy impact**: The current CSP in `main.py` allows `unsafe-inline` for styles. Tailwind generates utility classes at build time as static CSS, so it does not require runtime style injection and is compatible with strict CSP. Motion uses inline styles via React's `style` prop for animation values, which is allowed under CSP because React's inline styles are set via DOM properties, not `style` attributes parsed as HTML. No CSP changes are needed for the proposed UI/UX transformation.

---

## 12. Performance Findings

### Current Performance Baseline (Estimated)

Based on codebase analysis (actual Lighthouse testing was not performed in this research phase):

- **Initial JS bundle (estimated)**: ~165KB gzipped (React 45KB + Firebase 80KB + Sentry 25KB + app 15KB). Recharts (~45KB gzipped) and react-simple-maps (~15KB gzipped) are lazy-loaded.
- **CSS**: ~12KB gzipped (single file).
- **Fonts**: System font stack — no web font loading latency.
- **Critical rendering path**: Blocking resources are the main JS bundle and CSS file. Firebase initializes on module load (not deferred).
- **Chart render cost**: Each Recharts chart with 5–8 data series and 10 data points takes approximately 15–25ms to render on a mid-range device. The StateOverview page renders 3 charts simultaneously, totaling 45–75ms of render time.
- **Prediction panel interaction cost**: Each slider change triggers: `onChange` → `update()` → `onChange({...params})` in parent → state update → React re-render of prediction panel + results + charts. The prediction engine (`generateBaseline` + `applyNewParty` + `aggregateResults`) processes 234 constituencies synchronously. On a budget device, this full cycle is estimated at 80–120ms.

### Performance Impact of Proposed Changes

- **Tailwind CSS**: Net neutral to slight improvement. Generated CSS is comparable in size. Build-time tree-shaking eliminates unused styles (current CSS has many unused selectors from deleted/refactored components). The Vite plugin is faster than PostCSS for incremental builds.
- **Radix UI primitives**: Adds 40–60KB gzipped JS, but lazy-loaded per-route. Impact on initial load: zero. Impact on route load: 10–20KB per route depending on which primitives are used.
- **Motion**: Adds ~22KB gzipped JS. If imported only in interactive routes (PredictionPanel, CommunityFeed), initial page load is unaffected. Animation rendering uses hardware-accelerated Web Animations API, so runtime cost is minimal (GPU-composited, off main thread).
- **Inter web font**: Adds ~17KB woff2. With `<link rel="preload">` and `font-display: swap`, impact on LCP is negligible (text renders immediately with system font, swaps to Inter when loaded).
- **Virtual scrolling (TanStack Virtual)**: Reduces DOM node count by ~90% for the constituency table. Improves initial render by 50–100ms on budget devices. Adds ~12KB gzipped JS.
- **Net impact**: Total new JS (across all routes, not initial load): approximately 85–110KB gzipped. Total initial load increase: approximately 17KB (web font only, assuming all JS additions are lazy-loaded). This keeps the project well within the 300KB initial JS budget.

---

## Summary of Key Findings

1. **CSS Architecture**: Three viable approaches exist. Shadcn/ui + Radix + Tailwind (Approach B) provides the best combination of accessibility, DX, and modern design system capabilities, but at the highest migration effort. Enhanced custom CSS (Approach C) is the fastest path but provides no accessibility improvements. Tailwind-only (Approach A) is the middle ground.

2. **Data Visualization**: Recharts is adequate with optimization. Mobile charts need responsive heights, tap-to-reveal tooltips, inline data labels, and reduced data density. A wholesale library migration is not warranted.

3. **Touch Interactions**: Current slider thumbs at 28×34px effective size are below the 44×44px minimum. The prediction panel needs larger touch targets, `touch-action: none` on sliders, debounced chart updates, and value labels that follow the thumb.

4. **Design Tokens**: The current 8-variable system needs expansion to ~60 tokens covering color scales, typography, spacing, elevation, and radii. Neutral teal or purple accent colors avoid political color associations. Dark mode should use slightly lighter backgrounds (oklch 0.13–0.16) to reduce eye strain.

5. **Animation**: Motion (formerly Framer Motion) is the strongest choice at 22.7KB gzipped, leveraging hardware-accelerated Web Animations API. CSS-only covers basic needs but cannot handle gestures, exit animations, or layout transitions. React Spring's main-thread rendering is a liability on budget devices.

6. **Navigation**: Bottom navigation bar with 4–5 primary destinations is the recommended pattern, combined with contextual top tabs for sub-navigation within sections. The current horizontal scrolling tabs disappear on scroll and have inadequate touch targets.

7. **Mobile India Performance**: Target the Moto G4/slow 4G profile. Current estimated initial bundle is 165KB gzipped (well within budget). Key optimizations: defer Firebase init, preload web fonts, use virtual scrolling for constituency tables, debounce chart renders, and use Network Information API for adaptive data loading. All proposed additions (Tailwind, Radix, Motion, Inter font) fit within the 300KB initial JS budget when lazy-loaded appropriately.

---

*Report saved to `_architect/research/2026-04-29-mobile-first-ui-ux-research.md`*
