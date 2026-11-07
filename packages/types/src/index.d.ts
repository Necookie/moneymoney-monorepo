/**
 * Shared domain vocabulary for Money Money.
 *
 * Conventions:
 * - Money is always an integer number of centavos (`Centavos`). 1 PHP = 100 centavos.
 * - Calendar dates are ISO `YYYY-MM-DD` strings (`IsoDate`) interpreted in the user's timezone
 *   (Asia/Manila by default). Instants are ISO-8601 timestamps (`IsoDateTime`).
 */
/** Integer number of the smallest currency unit (centavos for PHP). Never a float. */
export type Centavos = number;
/** Calendar date, `YYYY-MM-DD`. */
export type IsoDate = string;
/** Instant, ISO-8601 with offset. */
export type IsoDateTime = string;
export type Uuid = string;
export declare const CURRENCIES: readonly ['PHP'];
export type Currency = (typeof CURRENCIES)[number];
export declare const DEFAULT_CURRENCY: Currency;
export declare const DEFAULT_TIMEZONE = 'Asia/Manila';
export declare const ACCOUNT_TYPES: readonly ['cash', 'bank', 'ewallet', 'savings', 'credit'];
export type AccountType = (typeof ACCOUNT_TYPES)[number];
/** Liability accounts carry balances owed (a negative contribution to net worth). */
export declare const LIABILITY_ACCOUNT_TYPES: readonly AccountType[];
export declare const TRANSACTION_TYPES: readonly [
  'income',
  'expense',
  'transfer',
  'refund',
  'adjustment',
];
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export declare const CATEGORY_KINDS: readonly ['income', 'expense'];
export type CategoryKind = (typeof CATEGORY_KINDS)[number];
export declare const EVENT_DIRECTIONS: readonly ['inflow', 'outflow'];
export type EventDirection = (typeof EVENT_DIRECTIONS)[number];
export declare const EVENT_KINDS: readonly [
  'expense',
  'bill',
  'purchase',
  'salary',
  'freelance',
  'contract',
  'income',
];
export type EventKind = (typeof EVENT_KINDS)[number];
export declare const EVENT_STATUSES: readonly [
  'planned',
  'committed',
  'recurring',
  'paid',
  'cancelled',
];
export type EventStatus = (typeof EVENT_STATUSES)[number];
/** How sure we are that an event will happen at the stated amount/date. */
export declare const CONFIDENCE_LEVELS: readonly ['confirmed', 'likely', 'uncertain'];
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];
export declare const RECURRENCE_FREQUENCIES: readonly [
  'none',
  'daily',
  'weekly',
  'biweekly',
  'semimonthly',
  'monthly',
  'quarterly',
  'yearly',
];
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];
/**
 * What happens when a monthly anchor day does not exist in a month (e.g. the 31st in April).
 * - `clamp`: use the last day of the shorter month (31 → 30 Apr, 28/29 Feb).
 * - `last_day`: always fall on the last day of every month.
 */
export declare const MONTH_END_RULES: readonly ['clamp', 'last_day'];
export type MonthEndRule = (typeof MONTH_END_RULES)[number];
export declare const OCCURRENCE_ACTIONS: readonly ['skip', 'reschedule', 'paid', 'amount'];
export type OccurrenceAction = (typeof OCCURRENCE_ACTIONS)[number];
export declare const FORECAST_MODES: readonly ['conservative', 'expected', 'optimistic'];
export type ForecastMode = (typeof FORECAST_MODES)[number];
export declare const FORECAST_HORIZONS: {
  readonly '7d': 7;
  readonly '30d': 30;
  readonly '90d': 90;
  readonly '12m': 365;
};
export type ForecastHorizon = keyof typeof FORECAST_HORIZONS;
export declare const GOAL_KINDS: readonly [
  'emergency',
  'investment',
  'vehicle',
  'electronics',
  'travel',
  'custom',
];
export type GoalKind = (typeof GOAL_KINDS)[number];
export declare const ALERT_SEVERITIES: readonly ['info', 'warning', 'critical'];
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];
export declare const ALERT_RULES: readonly [
  'budget_approaching',
  'budget_exceeded',
  'spending_pace',
  'obligations_exceed_funds',
  'below_safety_buffer',
  'purchase_shortfall',
  'uncertain_income_risk',
  'goal_off_track',
];
export type AlertRule = (typeof ALERT_RULES)[number];
export declare const ALERT_STATUSES: readonly ['active', 'dismissed', 'resolved'];
export type AlertStatus = (typeof ALERT_STATUSES)[number];
export declare const SYNC_ENTITIES: readonly ['transaction'];
export type SyncEntity = (typeof SYNC_ENTITIES)[number];
export declare const SYNC_OPS: readonly ['create', 'update', 'delete'];
export type SyncOp = (typeof SYNC_OPS)[number];
//# sourceMappingURL=index.d.ts.map
