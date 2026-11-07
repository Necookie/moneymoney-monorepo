# ADR 0003 — Money as integer centavos

**Status:** accepted · 2026-11-07

**Decision.** All amounts are integer centavos: `BIGINT` in Postgres (Drizzle `mode: number`),
`number` in TypeScript guarded by `Number.isSafeInteger`, integers on the wire. Ratios use BigInt
with explicit rounding; splits use exact allocation. User input is parsed by `parseMoney` (string
→ integer), never `parseFloat * 100`. Floats are used only for chart-axis display.

**Consequences.** Totals reconcile exactly; the safe-integer range (≈ ₱90 trillion) is ample.
