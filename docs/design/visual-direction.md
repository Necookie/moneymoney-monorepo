# Money Money — Visual Direction

**Brand:** `money money.` (lowercase wordmark with a trailing period) · **Tagline:** Know your money before you spend it.

## Philosophy

Premium editorial fintech: minimal, precise, calm, highly readable, financially trustworthy. Think a
well-typeset financial newspaper crossed with a modern spend-management tool — **not** a generic
gradient-heavy "AI dashboard".

## Tokens (source of truth: `packages/design-tokens`)

| Token | Value | Use |
|---|---|---|
| Canvas | `#F4F2F0` | App background |
| Card | `#FFFFFF` | Cards, tables, sheets |
| Ink | `#0C0A08` | Primary text, primary dark buttons |
| Dark surface | `#1A1919` | Sidebar/hero blocks, inverted panels |
| Muted | `#6D6C6B` | Secondary text, labels, axis ticks |
| Border | `#E5E7EB` | 1px hairlines |
| Accent | `#E4F222` | **Sparingly**: primary CTA, active nav item, focus ring, "today" marker |
| Positive / Negative / Warning | `#1F7A4D` / `#B42318` / `#A15C07` | Financial meaning only (never accent) |

Typeface: **Inter** (OFL, free to bundle) with `font-variant-numeric: tabular-nums` on every money value.

## Components

- Flat cards, 1px border, 12–16px radius, no shadow (shadow only for popovers/menus).
- Buttons 6px radius; inputs 10px radius; 4px spacing grid; generous whitespace.
- Strong type hierarchy: small uppercase/letter-spaced section labels in muted; big tabular figures.
- Subtle, functional motion only (120–260ms, no bounce).
- Accessible contrast (WCAG AA), visible focus states, full keyboard navigation on web.

## Financial honesty rules (product requirements — enforce in UI copy and visuals)

1. **Actual vs projected are always visually distinct.** Actual history = solid ink line/area.
   Projection = dashed muted line with a soft band. Label "Actual" and "Projected"; mark "Today".
2. **Never present uncertain income as cash.** Show confidence (Confirmed / Likely / Uncertain) as
   small chips; uncertain amounts are muted and excluded from "Safe to spend".
3. Planned items never change the "Actual balance" figure. Copy: "Planned — affects projections only".
4. Transfers between own accounts are never shown as income or spending.
5. Money formatting: `₱1,234.50` via `formatMoney` from `@mm/finance-engine`; parse user input
   with `parseMoney` (never `parseFloat * 100`). Negative values use a true minus `−`.
6. Demo data is only ever shown with a persistent "Demo data" banner and a one-click "Remove demo data".

## Patterns (inspired by beautifului.dev — patterns, not copied components)

- **Sidebar navigation** (web): dark or canvas sidebar, compact section labels, active item marked with
  a chartreuse indicator; collapses to icons.
- **Status filter chips with counts** for transaction types / planner status: `All 42 · Expenses 30 · Income 8 · Transfers 4`.
- **Insight cards**: one-line narrative + signed figure + tiny sparkline ("Food spending is 18% ahead of pace").
- **Records tables** with sticky header, right-aligned tabular amounts, muted meta row, aggregate footer row.
- **Command-style search** with instant filtering and a helpful empty state.
- **Review-before-commit cards** (e.g. "Can I afford this?" verdict card with reasons and actions).
- **Expandable "why" panels** explaining how a forecast number was computed (show assumptions list).
- **Skeleton loading** that mirrors final layout; empty states with a single clear next action.

## Icons

Rune Icons (Apache-2.0, bundled locally, never hotlinked): `runeicons-react` (web) and
`runeicons-react-native` (mobile, uses react-native-svg). Outline style, 24px grid, ~1.5–2px stroke.
Wrap them in a single local `Icon` component so the icon set can be swapped in one place.
