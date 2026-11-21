---
name: "Flownix"
description: "Private financial research workspace; evidence before inference."
colors:
  dark-bg: "#101316"
  dark-surface: "#171b20"
  dark-raised: "#20262d"
  dark-line: "#303942"
  dark-text: "#edf0f3"
  dark-muted: "#b4bec8"
  dark-subtle: "#82909e"
  dark-accent: "#a7cae2"
  dark-positive: "#8dcbb3"
  dark-warning: "#e1be82"
  dark-negative: "#e39b9d"
  dark-on-accent: "#101316"
  dark-focus: "#a7cae2"
  dark-chart-volume: "#303942"
  light-bg: "#f2f4f5"
  light-surface: "#fbfcfd"
  light-raised: "#e6ebef"
  light-line: "#a4b0ba"
  light-text: "#17212b"
  light-muted: "#465564"
  light-subtle: "#596979"
  light-accent: "#285f83"
  light-positive: "#22654e"
  light-warning: "#805815"
  light-negative: "#a7353b"
  light-on-accent: "#fbfcfd"
  light-focus: "#285f83"
  light-chart-volume: "#a4b0ba"
typography:
  headline:
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  headline-mobile:
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "25px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "13px"
    fontWeight: 550
    lineHeight: 1.5
  label:
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  small:
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.6
  tag:
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.5
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  tag: "4px"
  control: "6px"
  surface: "8px"
  monogram: "50%"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-6: "24px"
  space-8: "32px"
  compact: "10px"
  table-inline: "14px"
  section-block: "18px"
  panel: "20px"
  nav-inline: "28px"
components:
  button-default:
    backgroundColor: "{colors.dark-raised}"
    textColor: "{colors.dark-text}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-primary:
    backgroundColor: "{colors.dark-accent}"
    textColor: "{colors.dark-on-accent}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-primary-hover:
    backgroundColor: "{colors.dark-text}"
    textColor: "{colors.dark-bg}"
  button-quiet:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-text}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  input:
    backgroundColor: "{colors.dark-bg}"
    textColor: "{colors.dark-text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  navigation:
    textColor: "{colors.dark-muted}"
    typography: "{typography.label}"
    padding: "14px 12px"
  tag:
    backgroundColor: "{colors.dark-raised}"
    textColor: "{colors.dark-muted}"
    typography: "{typography.tag}"
    rounded: "{rounded.tag}"
    padding: "3px 7px"
  workbench:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.surface}"
---

# Design System: Flownix

## Overview

**Creative North Star: "Source-and-freshness ledger"**

Flownix is a restrained, dense private financial research terminal. Neutral graphite surfaces keep source evidence, timestamps and availability legible during long sessions. The observation-blue accent identifies interaction and focus; semantic status colors describe observed facts without predicting returns.

**Key Characteristics:**

- Evidence and source freshness remain inspectable beside observations.
- Flat, table-first workbench with compact typography and generous control targets.
- Explicit dark and light themes; text accompanies every status.
- Original flow mark, system typography and no decorative motion.

The following original interface direction is preserved from this build:

Mode: Operate. User-directed dark, dense trading terminal; code-first for app screens. No product or aesthetic questions are needed: the supplied brief sets purpose, style, stack and constraints.

Use a centered full-width workbench capped at 1680px, horizontal navigation, compact filter bar, paginated evidence table, and inline disclosure for evidence. The signature is a source-and-freshness ledger beside every observation. No marketing hero, fictitious score or performance chart.

Color tokens live in globals.css: charcoal background, neutral raised surfaces, observation-blue selection/verified states, amber incomplete states, red risk. System sans is intentional for a long-session data tool. Monospace only for addresses and numeric measurements. Typography 13–16px, 28px page heads; controls have 44px targets. Status always has text.

References inspected 2026-11-15: DEX Screener (dense token columns and chain identity), DefiLlama (table-first hierarchy), GeckoTerminal (pool-specific provenance). Framer Sightline Lite consulted for responsive filter/pagination patterns only; its fabricated metrics and paid assets are excluded. Original implementation; no template assets copied.

Responsive: navigation scrolls, filters wrap, tables use a labelled horizontal scroll region. On phones secondary columns collapse; primary token, price and status remain. Focus outlines, reduced motion, visible empty/error/loading states, and UTC source times are required. No decorative motion.

Observation blue identifies selection, links, focus and brand strokes; jade describes positive observed change.

## Colors

The normative frontmatter records each semantic role separately for dark and light themes. They resolve directly from `apps/web/app/globals.css`; component frontmatter describes the default dark theme, while the live component snippets inherit theme variables.

### Primary

Observation blue (`dark-accent` / `light-accent`) identifies actions, links, text selection, carets, active navigation and the original brand mark. Its paired on-accent color preserves foreground contrast.

### Neutral

Graphite background, surface and raised roles establish three flat layers. Line separates sections; text carries primary content, muted carries supporting copy, and subtle carries tertiary labels. Light mode supplies explicit alternatives rather than inverting the dark palette. Chart volume uses the line role in each theme.

### Semantic states

Jade positive describes a positive observed change; amber warning describes caution or incomplete evidence; rose negative describes negative change or risk. These roles retain textual status and do not imply a forecast.

**The Evidence Color Rule.** Status color describes an observed change or availability state; it never predicts an outcome. Always retain the text label.

## Typography

**Body and interface font:** The declared local stack starts with Inter, followed by the operating system sans stack. No remote font loader is required; Inter is used only if available. The primary interface intentionally relies on the system fallback.

**Code font:** The local monospace stack serves addresses and code. Numeric table cells use tabular numerals and right alignment; they are not globally forced to monospace. Brand source wordmarks use DejaVu Sans as documented in `docs/BRAND.md`.

### Hierarchy

Page headings use the `headline` role and switch to `headline-mobile` at the phone breakpoint. Section titles use `title`; tertiary headings use the same size with weight 550. Body paragraphs have a 72-character measure; supporting panel copy and controls use compact text. Labels, table cells and navigation use the label scale; table headings and source-time annotations use the small scale. Tags use the smallest scale. There is no marketing display type role.

## Layout

The centered workbench caps at 1680px. Desktop main content uses the largest spacing token; phone main content uses 24px vertically and 16px horizontally. Reused spacing tokens are normative above; compact 10/14/18/20px intervals support dense rows and grouped controls.

The masthead, horizontally scrollable navigation, page heading, status strip, filters and bordered workbench form the recurring shell. Filters wrap; desktop two-column panels become one column at 1100px. The same breakpoint removes designated secondary table columns. At 700px, search occupies its own masthead row, page actions stack, forms and timeline collapse to one column, and secondary footer content stacks. Primary token, price and status remain available in a labelled horizontally scrollable table region. At 1600px and wider, top spacing increases without expanding the content cap.

Tables use 42px headers, 76px data rows and 12px cell block padding. Controls retain a 44px minimum height; navigation links have a 48px minimum height. Pagination stays below the evidence table rather than being simulated as infinite data.

## Elevation & Depth

Depth comes from background, surface and raised tones plus one-pixel borders. There are no floating surface shadows. The only box-shadow in the current system is the two-pixel inset active-navigation underline.

**The Flat Workbench Rule.** Use tonal surfaces and thin separators for structure. The active-navigation inset line is an indicator, not floating elevation.

## Shapes

Controls have restrained rounded corners; workbenches and notices use the surface radius; tags use the smaller tag radius. Circular token portraits identify data rows and remain visible on phones. Borders use the current theme line role. The original flow mark comprises three time-separated observations converging into a single inspectable flow, anchored by the vertical stroke of an open F. It has no coin, shield, hexagon or Binance motif. Preserve paths and proportions, a quarter-mark clear space, and the 20px minimum mark size; use the icon below a 120px horizontal logo width.

## Components

### Buttons

Default controls use the raised tone, primary controls use the observation accent and on-accent text, and quiet controls use the surface tone. All share compact control typography, a thin border and the control radius. Hover changes the default background to line; primary hover uses text over background. Active state reduces opacity to 0.8; disabled buttons use 0.45 opacity and a not-allowed cursor. The shared target is a minimum height, not a fixed box.

### Inputs / Fields

Inputs, selects and textareas use the page background, line border, control radius and full available width. Hover changes border to subtle; placeholders use subtle and carets use accent. Labels sit above fields with a 6px gap. Textareas resize vertically and have a 100px minimum height. Current shared CSS does not define a distinct error or disabled input treatment.

### Navigation

Horizontal text navigation uses muted labels; the current route uses accent text and an inset underline. Hover uses raised background and primary text. Navigation scrolls horizontally at narrow widths. Tab navigation follows the same underline convention with primary text on the active tab. The keyboard skip link reveals itself on focus.

### Tags

Small, passive text tags use raised background and muted text. They carry identity or evidence labels and do not define a selected filter state. Status text may additionally use the positive, warning or negative semantic roles.

### Cards / Containers

Bordered workbenches group filters, table content and pagination. Section headers use a bottom divider and compact padding; panel interiors use the panel spacing token. Notices share the surface and border vocabulary and use warning-colored emphasis where evidence is incomplete. Loading skeletons are static raised rectangles. Empty states explicitly describe unavailable evidence rather than rendering invented values.

### Source-and-freshness ledger

Status strips, source annotations, UTC times and inline disclosure keep provenance next to each observation. Disclosure remains inspectable without a floating overlay. Charts use theme-aware grid and volume colors and are only populated by available evidence; an unavailable series has an explicit empty state.

### Focus and motion

Every focus-visible element uses a 2px theme focus outline with a 3px offset. Button feedback transitions background color, color and opacity over 140ms with the CSS default ease. There is no page entrance choreography. Reduced-motion preference removes animation and transitions and forces automatic scroll behavior. Charts must not animate through misleading intermediate values.

## Do's and Don'ts

### Do:

- **Do** keep source identity, UTC observation times and availability visible.
- **Do** use the existing semantic variables so light and dark states remain consistent.
- **Do** preserve keyboard focus, reduced-motion support and labelled table scrolling.
- **Do** preserve the flow mark paths, proportions and independent identity.

### Don't:

- **Don't** invent provider coverage, metrics, profit probabilities or live chart data.
- **Don't** use status colors to imply returns or Binance endorsement.
- **Don't** add decorative motion, marketing heroes or unsupported performance charts.


## Token identity refinement — 2026-11-21

The shared token identity displays the official symbol, full project name, chain/contract context and a 36px token portrait with an 18px bottom-right chain badge. Portrait and badge remain visible on phones. Official registry provenance is bound to the exact chain/contract identity; missing, rejected, loading or broken images show neutral UI initials. Brand colors, typography, focus and reduced-motion behavior remain unchanged. No Binance interface or brand mark is copied.

Desktop and tablet retain the table ledger. At 700px and below Radar/Watchlist use flat compact rows with identity, price, quote, 24h change and freshness visible together; expandable statistics retain identity, market data and research evidence. This supersedes the earlier phone monogram/table behavior only for these lists. Other evidence tables retain labelled horizontal scrolling.
