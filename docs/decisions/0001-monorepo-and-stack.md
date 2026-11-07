# ADR 0001 — pnpm + Turborepo monorepo, TypeScript everywhere

**Status:** accepted · 2026-11-07

**Context.** Web, Android and API share domain rules (money, dates, recurrence, forecasting) and
the wire contract. Divergent re-implementations of financial logic are the main correctness risk.

**Decision.** One pnpm workspace (hoisted linker for React Native/EAS compatibility) orchestrated by
Turborepo. Shared packages: `finance-engine` (pure logic), `validation` (Zod contract),
`api-client`, `types`, `design-tokens`, `database`, `config`. Strict TypeScript 6.

**Consequences.** One source of truth for calculations and types; packages build to `dist/` and
must be built before apps (turbo `^build`, EAS `eas-build-post-install`).
