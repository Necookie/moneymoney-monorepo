/**
 * Shared domain vocabulary for Money Money.
 *
 * Conventions:
 * - Money is always an integer number of centavos (`Centavos`). 1 PHP = 100 centavos.
 * - Calendar dates are ISO `YYYY-MM-DD` strings (`IsoDate`) interpreted in the user's timezone
 *   (Asia/Manila by default). Instants are ISO-8601 timestamps (`IsoDateTime`).
 */
export const CURRENCIES = ['PHP'];
export const DEFAULT_CURRENCY = 'PHP';
export const DEFAULT_TIMEZONE = 'Asia/Manila';
// ── Accounts ──────────────────────────────────────────────────────────────
export const ACCOUNT_TYPES = ['cash', 'bank', 'ewallet', 'savings', 'credit'];
/** Liability accounts carry balances owed (a negative contribution to net worth). */
export const LIABILITY_ACCOUNT_TYPES = ['credit'];
// ── Transactions ──────────────────────────────────────────────────────────
export const TRANSACTION_TYPES = ['income', 'expense', 'transfer', 'refund', 'adjustment'];
// ── Categories ────────────────────────────────────────────────────────────
export const CATEGORY_KINDS = ['income', 'expense'];
// ── Scheduled financial events (planned purchases, bills, salary, contracts) ─
export const EVENT_DIRECTIONS = ['inflow', 'outflow'];
export const EVENT_KINDS = [
  'expense',
  'bill',
  'purchase',
  'salary',
  'freelance',
  'contract',
  'income',
];
export const EVENT_STATUSES = ['planned', 'committed', 'recurring', 'paid', 'cancelled'];
/** How sure we are that an event will happen at the stated amount/date. */
export const CONFIDENCE_LEVELS = ['confirmed', 'likely', 'uncertain'];
export const RECURRENCE_FREQUENCIES = [
  'none',
  'daily',
  'weekly',
  'biweekly',
  'semimonthly',
  'monthly',
  'quarterly',
  'yearly',
];
/**
 * What happens when a monthly anchor day does not exist in a month (e.g. the 31st in April).
 * - `clamp`: use the last day of the shorter month (31 → 30 Apr, 28/29 Feb).
 * - `last_day`: always fall on the last day of every month.
 */
export const MONTH_END_RULES = ['clamp', 'last_day'];
export const OCCURRENCE_ACTIONS = ['skip', 'reschedule', 'paid', 'amount'];
// ── Forecasting ──────────────────────────────────────────────────────────
export const FORECAST_MODES = ['conservative', 'expected', 'optimistic'];
export const FORECAST_HORIZONS = { '7d': 7, '30d': 30, '90d': 90, '12m': 365 };
// ── Goals & budgets ──────────────────────────────────────────────────────
export const GOAL_KINDS = ['emergency', 'investment', 'vehicle', 'electronics', 'travel', 'custom'];
// ── Alerts ───────────────────────────────────────────────────────────────
export const ALERT_SEVERITIES = ['info', 'warning', 'critical'];
export const ALERT_RULES = [
  'budget_approaching',
  'budget_exceeded',
  'spending_pace',
  'obligations_exceed_funds',
  'below_safety_buffer',
  'purchase_shortfall',
  'uncertain_income_risk',
  'goal_off_track',
];
export const ALERT_STATUSES = ['active', 'dismissed', 'resolved'];
// ── Sync ─────────────────────────────────────────────────────────────────
export const SYNC_ENTITIES = ['transaction'];
export const SYNC_OPS = ['create', 'update', 'delete'];
//# sourceMappingURL=index.js.map
