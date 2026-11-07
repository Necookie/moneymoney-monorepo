# ADR 0005 — Forecast modes instead of probability weighting

**Status:** accepted · 2026-11-07

**Decision.** Confidence is categorical (confirmed / likely / uncertain). Forecasts run in three
explicit modes (conservative / expected / optimistic) rather than multiplying income by
probabilities. "Safe to spend" and "affordable without compromise" use the conservative view.

**Why.** Probability-weighted income produces amounts that never actually arrive and invites
treating uncertain money as spendable. Modes keep every projected figure a real, explainable sum.
