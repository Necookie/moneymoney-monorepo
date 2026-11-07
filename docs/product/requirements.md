# Product requirements — Money Money

**Vision:** a personal financial command center that shows what I have today, what is coming, and
what I can safely spend — without ever confusing projections with real money.

**User:** one private user (PHP, Asia/Manila). **Platforms:** web (production), Android
(production), iOS (future; codebase ready).

## Questions the product must answer

| # | Question | Where |
|---|---|---|
| 1 | How much money do I currently have? | Overview → actual net position (assets, liquid, owed) |
| 2 | How much have I earned this month? | Overview → month income |
| 3 | How much have I spent? | Overview → net spending (refunds netted, transfers excluded) |
| 4 | How much can I safely spend? | Safe to spend (conservative, buffer-protected) + daily budget allowance |
| 5 | What expenses are coming? | Upcoming list, Financial Calendar (calendar + timeline) |
| 6 | When will my next salary arrive? | Next expected income |
| 7 | Balance in 7/30/90/365 days? | Cash-flow chart / Forecast (three modes) |
| 8 | Am I overspending? | Budget pace, alerts |
| 9 | Can I afford a planned purchase? | Can I afford this? |
| 10 | What if my salary is delayed? | Scenario: salary delayed |
| 11 | What if a client contract ends? | Contract end dates + scenario: income lost |
| 12 | Will a purchase compromise my emergency fund? | Affordability verdict `compromises_emergency_fund` |
| 13 | How long until I reach my goals? | Goals → estimated completion, required monthly contribution |

## Functional scope (initial release)

- **Accounts:** cash, bank, e-wallet, savings, credit (liability); opening balance + date; archive.
- **Transactions:** income, expense, transfer, refund, adjustment; categories, tags, notes; search,
  filters, edit, soft delete; CSV import (dry run, duplicate-safe) and export.
- **Future expense planner:** planned / committed / recurring / paid / cancelled items with amount
  range, confidence, recurrence, installments; edit, postpone, split, skip, cancel, mark paid
  (converts to a transaction with no double counting); calendar and timeline views.
- **Income forecasting:** monthly, semi-monthly, weekly, biweekly, freelance, contracts with end
  dates, one-off and variable income; confirmed vs uncertain; conservative / expected / optimistic.
- **Forecast engine:** daily projection, lowest balance, month-end, shortfall dates, scenarios.
- **Overspending detection:** eight deterministic rules with severity, reason, amount, date, suggestion.
- **Can I afford this?:** affordable today vs affordable without compromising obligations.
- **Budgets & goals:** category + overall monthly budgets; goals with allocations, projections.
- **Android:** native app, quick add, offline SQLite with idempotent sync, biometric lock, local
  notifications, APK.
- **Demo mode:** explicitly flagged sample data with a persistent banner and one-click removal.

## Non-goals (initial release)

AI chatbot, bank scraping/integrations, multi-currency conversion, shared households, iOS builds.

## Quality bars

Exact money (integer centavos), deterministic tests for every financial rule, ownership checks on
every resource, no secrets in git, isolated infrastructure, verified backups.
