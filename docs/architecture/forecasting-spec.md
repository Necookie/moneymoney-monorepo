# Forecasting specification

Implementation: `packages/finance-engine` (pure, deterministic, no I/O). Tests: `packages/finance-engine/test`.

## Core formula

```
projectedBalance(d) = startingActualBalance
                    + Σ inflows  (asOf ≤ date ≤ d)
                    − Σ outflows (asOf ≤ date ≤ d)
                    − Σ budgetedSpending (asOf ≤ date ≤ d)
```

- `startingActualBalance` = net position (assets − liabilities) at the end of *today* in the user's
  timezone, from recorded transactions only. Planned items never modify it.
- Events are processed chronologically; on the same day inflows precede outflows (salary lands
  before bills), then by event id for stability. Identical inputs always give identical output.

## Money and dates

- Integer centavos; `allocate()` splits amounts exactly (remainder to the earliest parts);
  ratios use BigInt with half-up rounding. `parseMoney` never uses floating point.
- Calendar dates are `YYYY-MM-DD` strings; arithmetic uses UTC day numbers so the host timezone and
  DST cannot shift results. "Today" is resolved explicitly in Asia/Manila (configurable).

## Recurrence

| Frequency | Rule |
|---|---|
| none | single date |
| daily / weekly / biweekly | start + k·step·interval |
| monthly / quarterly / yearly | anchor day (default: start day) each period; `clamp` (31st → 30th/28th/29th) or `last_day` |
| semimonthly | two days per month (default 15th and month-end, clamped) — PH payroll |

- `endDate` (inclusive) stops a series — **contract income is never projected past its end**.
- `count` limits occurrences; **installments** (`n ≥ 2`) turn a total into `n` monthly payments that sum exactly.
- Leap years: Feb 29 anchors fall on Feb 28 in non-leap years.

## Statuses and overrides

- `planned`, `committed`, `recurring` project; `paid` and `cancelled` never do.
- Per-occurrence overrides keyed by the original date: `skip`, `reschedule` (new date), `amount`,
  `paid` (with the realising transaction id).
- **No double counting:** marking an occurrence paid creates the actual transaction and a `paid`
  override in one DB transaction; the projection drops it while the actual balance includes it.
  A unique index prevents the same occurrence being realised twice. Deleting the transaction
  restores the planned occurrence.
- Overdue one-off items (date passed, not paid) are projected on today and flagged `overdue`.
  Past recurring occurrences are *not* projected (assumed realised or missed).

## Modes

| Mode | Inflows counted | Inflow amount | Outflows counted | Outflow amount |
|---|---|---|---|---|
| conservative | confirmed | min of range | all | max of range |
| expected (default) | confirmed + likely | expected | all | expected |
| optimistic | all | max of range | confirmed + likely | min of range |

Uncertain income is **excluded** from conservative and expected views and reported separately
(`excludedInflow`). "Safe to spend" uses the **conservative** projection:
`safeToSpend = max(0, lowestBalance − safetyBuffer)` over the next 30 days.

## Budgeted (unscheduled) spending

For each budget and month in the horizon, the remaining allowance
(`limit − spentThisMonth − scheduledOutflowsInCategory`) is spread evenly over the remaining days
(exact allocation). An overall budget covers what category budgets and scheduled items do not.
Without budgets, only scheduled items are projected (stated in `assumptions`).

## Outputs

Daily points (balance, inflow, outflow, budgeted spending, items), ending balance, lowest balance
and date, month-end balance, first shortfall (< 0) and first below-buffer dates, totals,
safe-to-spend, excluded uncertain inflow, and a human-readable `assumptions` list (explainability).

## Scenarios

`baseline`, `salary_delayed` (N days, all salaries or chosen events), `income_lost` (from date),
`purchase_added` (optionally in installments), `purchase_postponed`, `spending_reduced` (% of
budgets and variable expenses). Each returns the full forecast plus deltas vs baseline.

## Affordability ("Can I afford this?")

Simulates a purchase without persisting anything.
- **Affordable today:** paying account (or liquid cash) ≥ first payment.
- **Affordable without compromising obligations:** with only confirmed income (conservative), the
  balance never drops below the safety buffer.
- Verdicts: `comfortable`, `tight`, `compromises_emergency_fund` (dips into money allocated to the
  emergency-fund goal), `creates_shortfall`, `not_affordable_today` — with reasons, lowest balance,
  buffer headroom and the obligations that would be left uncovered.

## Alerts (rule-based, no ML)

| Rule | Trigger | Severity |
|---|---|---|
| budget_exceeded | spent > limit | critical |
| budget_approaching | ≥ 80% used | warning |
| spending_pace | projected month spend > limit (after day 3) | warning |
| obligations_exceed_funds | conservative balance < 0 within 30 days | critical |
| below_safety_buffer | expected balance < buffer (critical if < 0) | warning/critical |
| uncertain_income_risk | expected OK but conservative < 0 | warning |
| purchase_shortfall | a planned purchase alone causes the buffer breach | warning |
| goal_off_track | estimated completion after target date | warning |

Each alert has a stable **fingerprint** (rule + subject + period). Storage upserts by fingerprint,
keeps dismissals, and resolves alerts whose condition disappears — no duplicate or repeated nagging.
